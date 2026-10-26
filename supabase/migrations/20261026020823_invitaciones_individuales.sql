-- Una invitación puede ser para un grupo o para una sola persona;
-- en la individual, el nombre del grupo es el de la persona.

alter table public.invitations
  add column kind text not null default 'group',
  add constraint invitations_kind_valid check (kind in ('group', 'individual'));

drop function public.save_invitation(uuid, uuid, text, text, jsonb);

create or replace function public.save_invitation(
  p_invitation_id uuid,
  p_event_id uuid,
  p_group_name text,
  p_phone text,
  p_guests jsonb,
  p_kind text default null
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
  v_kind text;
begin
  if p_guests is null or jsonb_typeof(p_guests) <> 'array' then
    raise exception 'guests_required';
  end if;

  if jsonb_array_length(p_guests) = 0 then
    raise exception 'guests_required';
  end if;

  if p_kind is not null and p_kind not in ('group', 'individual') then
    raise exception 'invalid_kind';
  end if;

  v_kind := coalesce(p_kind, (select i.kind from public.invitations i where i.id = p_invitation_id), 'group');

  if v_kind = 'individual' and jsonb_array_length(p_guests) <> 1 then
    raise exception 'individual_requires_one_guest';
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

  insert into public.invitations (id, event_id, group_name, phone, kind)
  values (p_invitation_id, p_event_id, p_group_name, v_phone, v_kind)
  on conflict (id) do update
  set group_name = excluded.group_name,
      phone = excluded.phone,
      kind = excluded.kind;

  delete from public.guests g
  where g.invitation_id = p_invitation_id
    and not (g.id = any (v_guest_ids));

  insert into public.guests (id, invitation_id, full_name, sort_order)
  select
    (value ->> 'id')::uuid,
    p_invitation_id,
    case when v_kind = 'individual' then p_group_name else value ->> 'full_name' end,
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

revoke execute on function public.save_invitation(uuid, uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.save_invitation(uuid, uuid, text, text, jsonb, text) to authenticated;

create or replace function public.get_invitation(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  v_invitation public.invitations%rowtype;
  v_event public.events%rowtype;
begin
  select * into v_invitation
  from public.invitations i
  where i.code = v_code;

  if not found then
    return null;
  end if;

  select * into v_event
  from public.events e
  where e.id = v_invitation.event_id;

  return jsonb_build_object(
    'invitation', jsonb_build_object(
      'id', v_invitation.id,
      'group_name', v_invitation.group_name,
      'code', v_invitation.code,
      'kind', v_invitation.kind
    ),
    'event', jsonb_build_object(
      'name', v_event.name,
      'theme_id', v_event.theme_id,
      'starts_at', v_event.starts_at,
      'venue_name', v_event.venue_name,
      'venue_address', v_event.venue_address,
      'city', v_event.city,
      'map_url', v_event.map_url,
      'welcome_message', v_event.welcome_message,
      'rsvp_deadline', v_event.rsvp_deadline
    ),
    'guests', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', g.id, 'full_name', g.full_name, 'rsvp', g.rsvp)
          order by g.sort_order, g.created_at
        )
        from public.guests g
        where g.invitation_id = v_invitation.id
      ),
      '[]'::jsonb
    ),
    'can_respond', now() <= v_event.rsvp_deadline,
    'gifts_open', now() < v_event.starts_at
  );
end;
$$;

revoke execute on function public.get_invitation(text) from public;
grant execute on function public.get_invitation(text) to anon, authenticated;
