-- Registro de llegadas al evento; la hora la toma el celular al escanear y
-- se sincroniza después, por eso solo se guarda si la persona aún no tiene llegada.

alter table public.guests
  add column arrived_at timestamptz,
  add column arrived_by uuid references auth.users (id) on delete set null;

create index guests_arrived_by_idx on public.guests (arrived_by);

create or replace function private.guests_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  select i.event_id into v_event_id
  from public.invitations i
  where i.id = new.invitation_id;

  if not found then
    raise exception 'invitation_not_found';
  end if;

  new.event_id := v_event_id;

  if tg_op = 'INSERT' then
    if new.rsvp is distinct from 'pending' then
      new.rsvp_updated_at := now();
    end if;
    new.arrived_at := null;
    new.arrived_by := null;
  elsif tg_op = 'UPDATE' then
    if new.rsvp is distinct from old.rsvp then
      new.rsvp_updated_at := now();
    end if;

    if old.arrived_at is not null and new.arrived_at is not null and old.arrived_at <> new.arrived_at then
      new.arrived_at := old.arrived_at;
      new.arrived_by := old.arrived_by;
    elsif old.arrived_at is null and new.arrived_at is not null then
      new.arrived_by := coalesce((select auth.uid()), new.arrived_by);
    elsif new.arrived_at is null then
      new.arrived_by := null;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.guests_before_write() from public;

create or replace function public.record_arrivals(p_event_id uuid, p_arrivals jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_uid uuid;
  v_elem jsonb;
  v_guest_id uuid;
  v_arrived_at timestamptz;
  v_target_time timestamptz;
  v_rec_arrived_at timestamptz;
  v_rec_arrived_by uuid;
  v_status text;
  v_results jsonb := '[]'::jsonb;
begin
  v_uid := (select auth.uid());

  if v_uid is null or not private.is_event_member(p_event_id) then
    raise exception 'not_event_member';
  end if;

  if p_arrivals is null or jsonb_typeof(p_arrivals) <> 'array' or jsonb_array_length(p_arrivals) = 0 then
    raise exception 'arrivals_required';
  end if;

  if jsonb_array_length(p_arrivals) > 500 then
    raise exception 'too_many_arrivals';
  end if;

  for v_elem in
    select value
    from jsonb_array_elements(p_arrivals) with ordinality
    order by ordinality
  loop
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'invalid_arrival';
    end if;

    if not (v_elem ? 'guest_id') or v_elem ->> 'guest_id' is null or btrim(v_elem ->> 'guest_id') = '' then
      raise exception 'invalid_arrival';
    end if;

    begin
      v_guest_id := (v_elem ->> 'guest_id')::uuid;

      if v_elem ->> 'arrived_at' is null then
        v_arrived_at := now();
      else
        v_arrived_at := (v_elem ->> 'arrived_at')::timestamptz;
      end if;
    exception
      when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
        raise exception 'invalid_arrival';
    end;

    v_target_time := least(v_arrived_at, now());

    update public.guests g
    set arrived_at = v_target_time,
        arrived_by = v_uid
    where g.id = v_guest_id
      and g.event_id = p_event_id
      and g.arrived_at is null
    returning g.arrived_at, g.arrived_by
    into v_rec_arrived_at, v_rec_arrived_by;

    if found then
      v_status := 'recorded';
    else
      select g.arrived_at, g.arrived_by
      into v_rec_arrived_at, v_rec_arrived_by
      from public.guests g
      where g.id = v_guest_id
        and g.event_id = p_event_id;

      if found then
        v_status := 'already_arrived';
      else
        v_status := 'not_found';
        v_rec_arrived_at := null;
        v_rec_arrived_by := null;
      end if;
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'guest_id', v_guest_id,
        'status', v_status,
        'arrived_at', v_rec_arrived_at,
        'arrived_by', v_rec_arrived_by
      )
    );
  end loop;

  return v_results;
end;
$$;

revoke execute on function public.record_arrivals(uuid, jsonb) from public, anon;
grant execute on function public.record_arrivals(uuid, jsonb) to authenticated;
