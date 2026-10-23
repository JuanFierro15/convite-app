-- Impide mover invitaciones y regalos de un evento a otro: si cambian de evento,
-- sus personas y reservas quedan con el event_id anterior, y RLS y Realtime
-- dependen de esa columna.

create or replace function private.prevent_event_id_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'event_id_immutable';
end;
$$;

create trigger invitations_prevent_event_change
  before update of event_id on public.invitations
  for each row
  when (old.event_id is distinct from new.event_id)
  execute function private.prevent_event_id_change();

create trigger gifts_prevent_event_change
  before update of event_id on public.gifts
  for each row
  when (old.event_id is distinct from new.event_id)
  execute function private.prevent_event_id_change();

revoke execute on function private.prevent_event_id_change() from public;
