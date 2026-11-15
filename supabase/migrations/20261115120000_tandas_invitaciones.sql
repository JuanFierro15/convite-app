-- Tandas de invitaciones: cada tanda adicional define su propia fecha límite
-- para confirmar asistencia; la primera tanda sigue usando events.rsvp_deadline.

-- =============================================================================
-- 1. Tabla public.invitation_batches
-- =============================================================================

-- La primera tanda no vive en esta tabla: usar events.rsvp_deadline como tanda
-- inicial evita crear filas por defecto en eventos existentes y mantiene intacto
-- el comportamiento actual cuando invitations.batch_id es nulo.
create table public.invitation_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  rsvp_deadline timestamptz not null,
  created_at timestamptz not null default now(),
  constraint invitation_batches_name_length check (char_length(btrim(name)) between 1 and 60)
);

create index invitation_batches_event_id_idx on public.invitation_batches (event_id);

alter table public.invitation_batches enable row level security;

create policy "Members can view invitation batches"
  on public.invitation_batches for select
  to authenticated
  using (private.is_event_member(event_id));

create policy "Owners can create invitation batches"
  on public.invitation_batches for insert
  to authenticated
  with check (private.is_event_member(event_id, array['owner']));

create policy "Owners can update invitation batches"
  on public.invitation_batches for update
  to authenticated
  using (private.is_event_member(event_id, array['owner']))
  with check (private.is_event_member(event_id, array['owner']));

create policy "Owners can delete invitation batches"
  on public.invitation_batches for delete
  to authenticated
  using (private.is_event_member(event_id, array['owner']));

revoke all on table public.invitation_batches from public, anon, authenticated;
grant select, insert, update, delete on table public.invitation_batches to authenticated;

-- =============================================================================
-- 2. Columna batch_id en public.invitations
-- =============================================================================

-- Se usa on delete no action (y no restrict) porque impide borrar una tanda
-- mientras tenga invitaciones, pero se evalúa al final de la sentencia y deja
-- funcionar el borrado en cascada del evento completo.
alter table public.invitations
  add column batch_id uuid constraint invitations_batch_id_fkey
    references public.invitation_batches (id) on delete no action;

create index invitations_batch_id_idx on public.invitations (batch_id);

-- =============================================================================
-- 3. Disparadores de integridad entre eventos, tandas e invitaciones
-- =============================================================================

-- security definer y bloqueo share sobre el evento para serializar con cambios
-- simultáneos de events.starts_at sin depender de RLS.
create or replace function private.invitation_batches_check_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_starts_at timestamptz;
begin
  select e.starts_at into v_starts_at
  from public.events e
  where e.id = new.event_id
  for share;

  if v_starts_at is not null and new.rsvp_deadline > v_starts_at then
    raise exception 'batch_deadline_after_start';
  end if;

  return new;
end;
$$;

create trigger invitation_batches_check_deadline
  before insert or update on public.invitation_batches
  for each row execute function private.invitation_batches_check_deadline();

create trigger invitation_batches_prevent_event_change
  before update of event_id on public.invitation_batches
  for each row
  when (old.event_id is distinct from new.event_id)
  execute function private.prevent_event_id_change();

-- Se bloquea el evento para evitar que entre una tanda con fecha mayor mientras
-- se adelanta starts_at en otra transacción.
create or replace function private.events_check_batch_deadlines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.events e
  where e.id = new.id
  for no key update;

  if exists (
    select 1
    from public.invitation_batches b
    where b.event_id = new.id
      and b.rsvp_deadline > new.starts_at
  ) then
    raise exception 'batch_deadline_after_start';
  end if;

  return new;
end;
$$;

create trigger events_check_batch_deadlines
  before update of starts_at on public.events
  for each row
  when (new.starts_at is distinct from old.starts_at)
  execute function private.events_check_batch_deadlines();

-- security definer para distinguir una tanda de otro evento (oculta por RLS)
-- de una inexistente y solo comparar identificadores.
create or replace function private.invitations_check_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_event_id uuid;
begin
  if new.batch_id is null then
    return new;
  end if;

  select b.event_id into v_batch_event_id
  from public.invitation_batches b
  where b.id = new.batch_id;

  if found and v_batch_event_id is distinct from new.event_id then
    raise exception 'batch_not_in_event';
  end if;

  return new;
end;
$$;

create trigger invitations_check_batch
  before insert or update of batch_id on public.invitations
  for each row execute function private.invitations_check_batch();

revoke execute on function private.invitation_batches_check_deadline() from public, anon, authenticated;
revoke execute on function private.events_check_batch_deadlines() from public, anon, authenticated;
revoke execute on function private.invitations_check_batch() from public, anon, authenticated;

-- =============================================================================
-- 4. Funciones RPC del invitado (get_invitation y set_rsvp)
-- =============================================================================

-- La web del invitado conserva exactamente las mismas claves: event.rsvp_deadline
-- y can_respond reflejan la fecha efectiva de la invitación (tanda o evento).
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
  select
    i.id,
    coalesce(b.rsvp_deadline, e.rsvp_deadline)
  into v_invitation_id, v_rsvp_deadline
  from public.invitations i
  join public.events e on e.id = i.event_id
  left join public.invitation_batches b on b.id = i.batch_id
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

revoke execute on function public.set_rsvp(text, uuid, text) from public;
grant execute on function public.set_rsvp(text, uuid, text) to anon, authenticated;

-- =============================================================================
-- 5. Función RPC save_invitation con soporte opcional de tanda
-- =============================================================================

-- p_set_batch distingue "conservar la tanda actual" (versiones anteriores de la
-- app que no envían el parámetro) de "mover a la primera tanda" (null explícito).
drop function public.save_invitation(uuid, uuid, text, text, jsonb, text, uuid[]);

create or replace function public.save_invitation(
  p_invitation_id uuid,
  p_event_id uuid,
  p_group_name text,
  p_phone text,
  p_guests jsonb,
  p_kind text default null,
  p_known_guest_ids uuid[] default null,
  p_batch_id uuid default null,
  p_set_batch boolean default false
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

  insert into public.invitations as i (id, event_id, group_name, phone, kind, batch_id)
  values (
    p_invitation_id,
    p_event_id,
    p_group_name,
    v_phone,
    v_kind,
    case when coalesce(p_set_batch, false) then p_batch_id else null end
  )
  on conflict (id) do update
  set group_name = excluded.group_name,
      phone = excluded.phone,
      kind = excluded.kind,
      batch_id = case
        when coalesce(p_set_batch, false) then excluded.batch_id
        else i.batch_id
      end;

  delete from public.guests g
  where g.invitation_id = p_invitation_id
    and not (g.id = any (v_guest_ids))
    and (p_known_guest_ids is null or g.id = any (p_known_guest_ids));

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

revoke execute on function public.save_invitation(uuid, uuid, text, text, jsonb, text, uuid[], uuid, boolean) from public, anon;
grant execute on function public.save_invitation(uuid, uuid, text, text, jsonb, text, uuid[], uuid, boolean) to authenticated;
