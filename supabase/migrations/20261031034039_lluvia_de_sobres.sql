alter table public.gifts
  drop constraint gifts_kind_valid,
  add constraint gifts_kind_valid check (kind in ('unique', 'repeatable', 'free', 'suggestion', 'envelope'));

-- Si un evento tiene dos o más sugerencias llamadas "Lluvia de sobres", la migración
-- no elige cuál convertir y aborta para resolver la duplicación manualmente.
do $$
begin
  if exists (
    select 1
    from public.gifts
    where kind = 'suggestion'
      and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = 'lluvia de sobres'
    group by event_id
    having count(*) > 1
  ) then
    raise exception 'more_than_one_envelope_suggestion';
  end if;
end;
$$;

update public.gifts
set kind = 'envelope'
where kind = 'suggestion'
  and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = 'lluvia de sobres';

create unique index gifts_one_envelope_per_event on public.gifts (event_id) where kind = 'envelope';

create or replace function private.gift_reservations_before_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_gift_event_id uuid;
  v_gift_kind text;
  v_invitation_event_id uuid;
begin
  select g.event_id, g.kind into v_gift_event_id, v_gift_kind
  from public.gifts g
  where g.id = new.gift_id;

  if not found then
    raise exception 'gift_not_found';
  end if;

  if v_gift_kind not in ('unique', 'repeatable', 'free') then
    raise exception 'gift_not_reservable';
  end if;

  select i.event_id into v_invitation_event_id
  from public.invitations i
  where i.id = new.invitation_id;

  if not found then
    raise exception 'invitation_not_found';
  end if;

  if v_invitation_event_id <> v_gift_event_id then
    raise exception 'invitation_event_mismatch';
  end if;

  new.event_id := v_gift_event_id;
  new.is_unique := (v_gift_kind = 'unique');
  return new;
end;
$$;

revoke execute on function private.gift_reservations_before_insert() from public;

create or replace function public.reserve_gift(p_code text, p_gift_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  v_invitation_id uuid;
  v_event_id uuid;
  v_starts_at timestamptz;
  v_kind text;
  v_max_reservations integer;
  v_reserved_count integer;
begin
  select i.id, i.event_id, e.starts_at into v_invitation_id, v_event_id, v_starts_at
  from public.invitations i
  join public.events e on e.id = i.event_id
  where i.code = v_code;

  if not found then
    raise exception 'invalid_code';
  end if;

  -- El bloqueo pone en fila a quienes apartan el mismo regalo al mismo tiempo:
  -- el segundo espera y cuenta ya con la reserva del primero.
  select g.kind, g.max_reservations into v_kind, v_max_reservations
  from public.gifts g
  where g.id = p_gift_id
    and g.event_id = v_event_id
  for update;

  if not found then
    raise exception 'gift_not_found';
  end if;

  if v_kind not in ('unique', 'repeatable', 'free') then
    raise exception 'gift_not_reservable';
  end if;

  if now() >= v_starts_at then
    raise exception 'gifts_closed';
  end if;

  if exists (
    select 1
    from public.gift_reservations r
    where r.gift_id = p_gift_id
      and r.invitation_id = v_invitation_id
  ) then
    return public.get_gifts(v_code);
  end if;

  if v_kind = 'repeatable' then
    select count(*) into v_reserved_count
    from public.gift_reservations r
    where r.gift_id = p_gift_id;

    if v_reserved_count >= v_max_reservations then
      raise exception 'gift_full';
    end if;
  end if;

  -- El on conflict cubre que la misma invitación ya tenga el regalo (no es error);
  -- la violación del índice único parcial es otra invitación que ganó la carrera.
  begin
    insert into public.gift_reservations (gift_id, invitation_id)
    values (p_gift_id, v_invitation_id)
    on conflict (gift_id, invitation_id) do nothing;
  exception
    when unique_violation then
      raise exception 'already_reserved';
  end;

  return public.get_gifts(v_code);
end;
$$;

revoke execute on function public.reserve_gift(text, uuid) from public;
grant execute on function public.reserve_gift(text, uuid) to anon, authenticated;
