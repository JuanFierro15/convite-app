-- Los textos de regalos del invitado dependen del tipo de evento y de para quién es.

alter table public.events
  add column event_type text not null default 'other',
  add column honoree_name text,
  add constraint events_event_type_check
    check (event_type in ('baby_shower', 'baptism', 'birthday', 'wedding', 'anniversary', 'other')),
  add constraint events_honoree_name_check
    check (honoree_name is null or char_length(btrim(honoree_name)) between 1 and 60);

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
  v_batch_deadline timestamptz;
  v_effective_deadline timestamptz;
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

  if v_invitation.batch_id is not null then
    select b.rsvp_deadline into v_batch_deadline
    from public.invitation_batches b
    where b.id = v_invitation.batch_id;
  end if;

  v_effective_deadline := coalesce(v_batch_deadline, v_event.rsvp_deadline);

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
      'event_type', v_event.event_type,
      'honoree_name', v_event.honoree_name,
      'starts_at', v_event.starts_at,
      'venue_name', v_event.venue_name,
      'venue_address', v_event.venue_address,
      'city', v_event.city,
      'map_url', v_event.map_url,
      'welcome_message', v_event.welcome_message,
      'rsvp_deadline', v_effective_deadline
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
    'can_respond', now() <= v_effective_deadline,
    'gifts_open', now() < v_event.starts_at
  );
end;
$$;

revoke execute on function public.get_invitation(text) from public;
grant execute on function public.get_invitation(text) to anon, authenticated;
