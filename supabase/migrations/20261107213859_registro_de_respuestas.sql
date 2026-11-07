-- Registro de cada cambio de respuesta para que el equipo vea quién acaba de
-- responder sin revisar invitación por invitación.

-- =============================================================================
-- 1. Tabla
-- =============================================================================

create table public.rsvp_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  guest_id uuid not null references public.guests (id) on delete cascade,
  previous_rsvp text,
  rsvp text not null,
  source text not null,
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint rsvp_log_rsvp_valid check (rsvp in ('pending', 'accepted', 'declined')),
  constraint rsvp_log_previous_rsvp_valid check (
    previous_rsvp is null or previous_rsvp in ('pending', 'accepted', 'declined')
  ),
  -- unknown solo lo usan las respuestas anteriores a este registro.
  constraint rsvp_log_source_valid check (source in ('guest', 'team', 'unknown'))
);

alter table public.rsvp_log enable row level security;

create index rsvp_log_event_created_idx on public.rsvp_log (event_id, created_at desc, id desc);
create index rsvp_log_invitation_id_idx on public.rsvp_log (invitation_id);
create index rsvp_log_guest_id_idx on public.rsvp_log (guest_id);
create index rsvp_log_actor_id_idx on public.rsvp_log (actor_id);

-- Solo se lee; las filas las escribe el disparador de guests.
create policy "Members can view rsvp log"
  on public.rsvp_log for select
  to authenticated
  using (private.is_event_member(event_id));

revoke all on table public.rsvp_log from anon, authenticated;
grant select on table public.rsvp_log to authenticated;

-- =============================================================================
-- 2. Disparador
-- =============================================================================

-- security definer porque nadie tiene permiso de insertar en rsvp_log.
create or replace function private.guests_log_rsvp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text;
begin
  if tg_op = 'UPDATE' and new.rsvp is not distinct from old.rsvp then
    return null;
  end if;

  if tg_op = 'INSERT' and new.rsvp = 'pending' then
    return null;
  end if;

  -- set_rsvp marca la transacción; cualquier otro cambio viene de la app del equipo.
  if coalesce(current_setting('convite.rsvp_source', true), '') = 'guest' then
    v_source := 'guest';
  else
    v_source := 'team';
  end if;

  insert into public.rsvp_log (
    event_id, invitation_id, guest_id, previous_rsvp, rsvp, source, actor_id
  )
  values (
    new.event_id,
    new.invitation_id,
    new.id,
    case when tg_op = 'UPDATE' then old.rsvp end,
    new.rsvp,
    v_source,
    (select auth.uid())
  );

  return null;
end;
$$;

revoke execute on function private.guests_log_rsvp() from public;

create trigger guests_log_rsvp
  after insert or update of rsvp on public.guests
  for each row execute function private.guests_log_rsvp();

-- =============================================================================
-- 3. set_rsvp marca que la respuesta vino del invitado
-- =============================================================================

create or replace function public.set_rsvp(p_code text, p_guest_id uuid, p_rsvp text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  v_invitation_id uuid;
  v_rsvp_deadline timestamptz;
begin
  select i.id, e.rsvp_deadline into v_invitation_id, v_rsvp_deadline
  from public.invitations i
  join public.events e on e.id = i.event_id
  where i.code = v_code;

  if not found then
    raise exception 'invalid_code';
  end if;

  perform 1
  from public.guests g
  where g.id = p_guest_id
    and g.invitation_id = v_invitation_id;

  if not found then
    raise exception 'guest_not_in_invitation';
  end if;

  if now() > v_rsvp_deadline then
    raise exception 'deadline_passed';
  end if;

  if p_rsvp is null or p_rsvp not in ('accepted', 'declined') then
    raise exception 'invalid_value';
  end if;

  perform set_config('convite.rsvp_source', 'guest', true);

  update public.guests
  set rsvp = p_rsvp
  where id = p_guest_id;

  return public.get_invitation(v_code);
end;
$$;

-- =============================================================================
-- 4. Lectura para la app
-- =============================================================================

-- security definer para leer el nombre visible del integrante en auth.users;
-- solo se muestra el de quienes siguen siendo miembros del evento.
create or replace function public.list_rsvp_log(
  p_event_id uuid,
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if (select auth.uid()) is null or not private.is_event_member(p_event_id) then
    raise exception 'not_event_member';
  end if;

  return jsonb_build_object(
    'total',
    (select count(*) from public.rsvp_log l where l.event_id = p_event_id),
    'items',
    coalesce(
      (
        select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc)
        from (
          select
            l.id,
            l.invitation_id,
            l.guest_id,
            g.full_name as guest_name,
            i.group_name,
            i.kind as invitation_kind,
            l.previous_rsvp,
            l.rsvp,
            l.source,
            nullif(btrim(u.raw_user_meta_data ->> 'display_name'), '') as actor_name,
            l.created_at
          from public.rsvp_log l
          join public.guests g on g.id = l.guest_id
          join public.invitations i on i.id = l.invitation_id
          left join public.event_members m
            on m.event_id = l.event_id and m.user_id = l.actor_id
          left join auth.users u on u.id = m.user_id
          where l.event_id = p_event_id
          order by l.created_at desc, l.id desc
          limit v_limit
          offset v_offset
        ) x
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke execute on function public.list_rsvp_log(uuid, integer, integer) from public, anon;
grant execute on function public.list_rsvp_log(uuid, integer, integer) to authenticated;

-- =============================================================================
-- 5. Respuestas anteriores a este registro
-- =============================================================================

insert into public.rsvp_log (
  event_id, invitation_id, guest_id, previous_rsvp, rsvp, source, actor_id, created_at
)
select g.event_id, g.invitation_id, g.id, null, g.rsvp, 'unknown', null, g.rsvp_updated_at
from public.guests g
where g.rsvp <> 'pending'
  and g.rsvp_updated_at is not null;

-- =============================================================================
-- 6. Realtime
-- =============================================================================

alter publication supabase_realtime add table public.rsvp_log;
