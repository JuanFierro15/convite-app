-- Guarda una invitación y sus personas en una sola transacción; los id los
-- genera el cliente para que repetir la llamada no duplique nada.

create or replace function public.save_invitation(
  p_invitation_id uuid,
  p_event_id uuid,
  p_group_name text,
  p_phone text,
  p_guests jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_phone text;
  v_guest_ids uuid[];
  v_result jsonb;
begin
  if p_guests is null or jsonb_typeof(p_guests) <> 'array' then
    raise exception 'guests_required';
  end if;

  if jsonb_array_length(p_guests) = 0 then
    raise exception 'guests_required';
  end if;

  v_phone := nullif(btrim(coalesce(p_phone, '')), '');

  select array_agg((value ->> 'id')::uuid)
  into v_guest_ids
  from jsonb_array_elements(p_guests);

  if exists (
    select 1
    from public.invitations i
    where i.id = p_invitation_id
      and i.event_id <> p_event_id
  ) then
    raise exception 'invitation_event_mismatch';
  end if;

  if exists (
    select 1
    from public.guests g
    where g.id = any (v_guest_ids)
      and g.invitation_id <> p_invitation_id
  ) then
    raise exception 'guest_not_in_invitation';
  end if;

  insert into public.invitations (id, event_id, group_name, phone)
  values (p_invitation_id, p_event_id, p_group_name, v_phone)
  on conflict (id) do update
  set group_name = excluded.group_name,
      phone = excluded.phone;

  delete from public.guests g
  where g.invitation_id = p_invitation_id
    and not (g.id = any (v_guest_ids));

  insert into public.guests (id, invitation_id, full_name, sort_order)
  select
    (value ->> 'id')::uuid,
    p_invitation_id,
    value ->> 'full_name',
    (ordinality - 1)::integer
  from jsonb_array_elements(p_guests) with ordinality
  on conflict (id) do update
  set full_name = excluded.full_name,
      sort_order = excluded.sort_order;

  select
    to_jsonb(i) || jsonb_build_object(
      'guests',
      coalesce(
        (
          select jsonb_agg(to_jsonb(g) order by g.sort_order, g.created_at)
          from public.guests g
          where g.invitation_id = i.id
        ),
        '[]'::jsonb
      )
    )
  into v_result
  from public.invitations i
  where i.id = p_invitation_id;

  return v_result;
end;
$$;

revoke execute on function public.save_invitation(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_invitation(uuid, uuid, text, text, jsonb) to authenticated;
