-- Esquema inicial de Convite: tablas, índices, funciones auxiliares, disparadores,
-- políticas RLS, privilegios, funciones RPC del invitado y publicación de Realtime.
-- No contiene datos.

-- =============================================================================
-- 1. Extensiones y esquema private
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Supabase no expone el esquema private por la API.
create schema if not exists private;

-- Se crea antes de las tablas porque es el default de invitations.code.
-- 256 es múltiplo de 32, así que byte % 32 no introduce sesgo.
create or replace function private.generate_invitation_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_code text := '';
  i integer;
begin
  for i in 0..9 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

-- =============================================================================
-- 2. Tablas
-- =============================================================================

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  theme_id text not null default 'baby-shower',
  starts_at timestamptz not null,
  venue_name text,
  venue_address text,
  city text,
  map_url text,
  welcome_message text,
  rsvp_deadline timestamptz not null,
  budget_cop bigint,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_name_length check (char_length(name) between 1 and 120),
  constraint events_theme_id_valid check (theme_id in ('baby-shower', 'bautizo')),
  constraint events_rsvp_deadline_before_start check (rsvp_deadline <= starts_at),
  constraint events_budget_cop_non_negative check (budget_cop >= 0)
);

create table public.event_members (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  constraint event_members_pkey primary key (event_id, user_id),
  constraint event_members_role_valid check (role in ('owner', 'helper'))
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  group_name text not null,
  phone text,
  code text not null default private.generate_invitation_code(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_code_key unique (code),
  constraint invitations_group_name_length check (char_length(group_name) between 1 and 120),
  constraint invitations_phone_format check (phone is null or phone ~ '^\+57[0-9]{10}$')
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  full_name text not null,
  rsvp text not null default 'pending',
  rsvp_updated_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint guests_full_name_length check (char_length(full_name) between 1 and 120),
  constraint guests_rsvp_valid check (rsvp in ('pending', 'accepted', 'declined'))
);

create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  description text,
  category text,
  kind text not null default 'unique',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint gifts_name_length check (char_length(name) between 1 and 120),
  constraint gifts_kind_valid check (kind in ('unique', 'repeatable', 'free'))
);

create table public.gift_reservations (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.gifts (id) on delete cascade,
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  is_unique boolean not null default false,
  created_at timestamptz not null default now(),
  constraint gift_reservations_gift_invitation_key unique (gift_id, invitation_id)
);

-- =============================================================================
-- 3. Índices
-- =============================================================================

-- RN-14: como máximo un regalo libre por evento.
create unique index gifts_one_free_per_event on public.gifts (event_id) where kind = 'free';

-- RN-04: hace cumplir el apartado único aunque dos reservas lleguen en el mismo
-- instante; una validación previa con select dejaría pasar las dos.
create unique index gift_reservations_one_per_unique_gift on public.gift_reservations (gift_id) where is_unique;

create index events_created_by_idx on public.events (created_by);
create index event_members_user_id_idx on public.event_members (user_id);
create index invitations_event_id_idx on public.invitations (event_id);
create index guests_invitation_id_idx on public.guests (invitation_id);
create index guests_event_id_idx on public.guests (event_id);
create index gifts_event_id_idx on public.gifts (event_id);
create index gift_reservations_invitation_id_idx on public.gift_reservations (invitation_id);
create index gift_reservations_event_id_idx on public.gift_reservations (event_id);

-- =============================================================================
-- 4. Funciones auxiliares
-- =============================================================================

-- security definer porque la política de event_members consulta la misma tabla;
-- sin eso RLS entraría en recursión infinita.
create or replace function private.is_event_member(
  p_event_id uuid,
  p_roles text[] default array['owner', 'helper']
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_members m
    where m.event_id = p_event_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

-- =============================================================================
-- 5. Disparadores
-- =============================================================================

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger events_set_updated_at
  before update on public.events
  for each row execute function private.set_updated_at();

create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function private.set_updated_at();

-- event_id se copia siempre desde la invitación para que el cliente no pueda
-- desalinearlo; Realtime y RLS dependen de esa columna.
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
  elsif new.rsvp is distinct from old.rsvp then
    new.rsvp_updated_at := now();
  end if;

  return new;
end;
$$;

create trigger guests_before_write
  before insert or update on public.guests
  for each row execute function private.guests_before_write();

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

create trigger gift_reservations_before_insert
  before insert on public.gift_reservations
  for each row execute function private.gift_reservations_before_insert();

-- RN-15: is_unique de las reservas existentes quedaría inconsistente con el nuevo tipo.
create or replace function private.gifts_prevent_kind_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.gift_reservations r where r.gift_id = old.id
  ) then
    raise exception 'gift_has_reservations';
  end if;
  return new;
end;
$$;

create trigger gifts_prevent_kind_change
  before update of kind on public.gifts
  for each row
  when (old.kind is distinct from new.kind)
  execute function private.gifts_prevent_kind_change();

-- security definer porque el creador todavía no es miembro y RLS no le dejaría
-- insertarse en event_members.
create or replace function private.events_add_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.event_members (event_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger events_add_owner
  after insert on public.events
  for each row execute function private.events_add_owner();

-- =============================================================================
-- 6. RLS y políticas
-- =============================================================================

alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.invitations enable row level security;
alter table public.guests enable row level security;
alter table public.gifts enable row level security;
alter table public.gift_reservations enable row level security;

-- events

-- created_by permite leer la fila en el returning del insert, que corre antes de
-- que el disparador vuelva miembro al creador.
create policy "Members and creator can view events"
  on public.events for select
  to authenticated
  using (private.is_event_member(id) or created_by = (select auth.uid()));

create policy "Users can create their own events"
  on public.events for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "Owners can update events"
  on public.events for update
  to authenticated
  using (private.is_event_member(id, array['owner']))
  with check (private.is_event_member(id, array['owner']));

create policy "Owners can delete events"
  on public.events for delete
  to authenticated
  using (private.is_event_member(id, array['owner']));

-- event_members

create policy "Members can view members of their events"
  on public.event_members for select
  to authenticated
  using (private.is_event_member(event_id));

create policy "Owners can add members"
  on public.event_members for insert
  to authenticated
  with check (private.is_event_member(event_id, array['owner']));

create policy "Owners can update members"
  on public.event_members for update
  to authenticated
  using (private.is_event_member(event_id, array['owner']))
  with check (private.is_event_member(event_id, array['owner']));

create policy "Owners can remove members"
  on public.event_members for delete
  to authenticated
  using (private.is_event_member(event_id, array['owner']));

-- invitations

create policy "Members can view invitations"
  on public.invitations for select
  to authenticated
  using (private.is_event_member(event_id));

create policy "Members can create invitations"
  on public.invitations for insert
  to authenticated
  with check (private.is_event_member(event_id));

create policy "Members can update invitations"
  on public.invitations for update
  to authenticated
  using (private.is_event_member(event_id))
  with check (private.is_event_member(event_id));

create policy "Members can delete invitations"
  on public.invitations for delete
  to authenticated
  using (private.is_event_member(event_id));

-- guests

create policy "Members can view guests"
  on public.guests for select
  to authenticated
  using (private.is_event_member(event_id));

create policy "Members can create guests"
  on public.guests for insert
  to authenticated
  with check (private.is_event_member(event_id));

create policy "Members can update guests"
  on public.guests for update
  to authenticated
  using (private.is_event_member(event_id))
  with check (private.is_event_member(event_id));

create policy "Members can delete guests"
  on public.guests for delete
  to authenticated
  using (private.is_event_member(event_id));

-- gifts

create policy "Owners can view gifts"
  on public.gifts for select
  to authenticated
  using (private.is_event_member(event_id, array['owner']));

create policy "Owners can create gifts"
  on public.gifts for insert
  to authenticated
  with check (private.is_event_member(event_id, array['owner']));

create policy "Owners can update gifts"
  on public.gifts for update
  to authenticated
  using (private.is_event_member(event_id, array['owner']))
  with check (private.is_event_member(event_id, array['owner']));

create policy "Owners can delete gifts"
  on public.gifts for delete
  to authenticated
  using (private.is_event_member(event_id, array['owner']));

-- gift_reservations: sin políticas de insert ni update, solo se aparta por RPC.

create policy "Owners can view gift reservations"
  on public.gift_reservations for select
  to authenticated
  using (private.is_event_member(event_id, array['owner']));

create policy "Owners can delete gift reservations"
  on public.gift_reservations for delete
  to authenticated
  using (private.is_event_member(event_id, array['owner']));

-- =============================================================================
-- 7. Privilegios
-- =============================================================================

revoke all on table
  public.events,
  public.event_members,
  public.invitations,
  public.guests,
  public.gifts,
  public.gift_reservations
from anon;

grant select, insert, update, delete on table
  public.events,
  public.event_members,
  public.invitations,
  public.guests,
  public.gifts,
  public.gift_reservations
to authenticated;

grant usage on schema private to authenticated;

revoke execute on function private.generate_invitation_code() from public;
revoke execute on function private.is_event_member(uuid, text[]) from public;
revoke execute on function private.set_updated_at() from public;
revoke execute on function private.guests_before_write() from public;
revoke execute on function private.gift_reservations_before_insert() from public;
revoke execute on function private.gifts_prevent_kind_change() from public;
revoke execute on function private.events_add_owner() from public;

grant execute on function private.generate_invitation_code() to authenticated;
grant execute on function private.is_event_member(uuid, text[]) to authenticated;

-- El default de invitations.code se evalúa con el rol que inserta; los scripts que
-- usan la clave secreta insertan como service_role.
grant usage on schema private to service_role;
grant execute on function private.generate_invitation_code() to service_role;

-- =============================================================================
-- 8. Funciones RPC del invitado
-- =============================================================================

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
      'group_name', v_invitation.group_name
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

  update public.guests
  set rsvp = p_rsvp
  where id = p_guest_id;

  return public.get_invitation(v_code);
end;
$$;

create or replace function public.get_gifts(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  v_invitation_id uuid;
  v_event_id uuid;
begin
  select i.id, i.event_id into v_invitation_id, v_event_id
  from public.invitations i
  where i.code = v_code;

  if not found then
    raise exception 'invalid_code';
  end if;

  -- RN-07: taken nunca revela qué invitación apartó el regalo.
  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'description', g.description,
          'category', g.category,
          'kind', g.kind,
          'reserved_by_me', exists (
            select 1
            from public.gift_reservations r
            where r.gift_id = g.id
              and r.invitation_id = v_invitation_id
          ),
          'taken', g.kind = 'unique' and exists (
            select 1
            from public.gift_reservations r
            where r.gift_id = g.id
              and r.invitation_id <> v_invitation_id
          )
        )
        order by
          case g.kind when 'repeatable' then 0 when 'free' then 1 else 2 end,
          g.sort_order,
          g.name,
          g.id
      )
      from public.gifts g
      where g.event_id = v_event_id
    ),
    '[]'::jsonb
  );
end;
$$;

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
begin
  select i.id, i.event_id, e.starts_at into v_invitation_id, v_event_id, v_starts_at
  from public.invitations i
  join public.events e on e.id = i.event_id
  where i.code = v_code;

  if not found then
    raise exception 'invalid_code';
  end if;

  perform 1
  from public.gifts g
  where g.id = p_gift_id
    and g.event_id = v_event_id;

  if not found then
    raise exception 'gift_not_found';
  end if;

  if now() >= v_starts_at then
    raise exception 'gifts_closed';
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

create or replace function public.release_gift(p_code text, p_gift_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  v_invitation_id uuid;
  v_starts_at timestamptz;
begin
  select i.id, e.starts_at into v_invitation_id, v_starts_at
  from public.invitations i
  join public.events e on e.id = i.event_id
  where i.code = v_code;

  if not found then
    raise exception 'invalid_code';
  end if;

  perform 1
  from public.gift_reservations r
  where r.gift_id = p_gift_id
    and r.invitation_id = v_invitation_id;

  if not found then
    raise exception 'not_reserved_by_you';
  end if;

  if now() >= v_starts_at then
    raise exception 'gifts_closed';
  end if;

  delete from public.gift_reservations r
  where r.gift_id = p_gift_id
    and r.invitation_id = v_invitation_id;

  return public.get_gifts(v_code);
end;
$$;

revoke execute on function public.get_invitation(text) from public;
revoke execute on function public.set_rsvp(text, uuid, text) from public;
revoke execute on function public.get_gifts(text) from public;
revoke execute on function public.reserve_gift(text, uuid) from public;
revoke execute on function public.release_gift(text, uuid) from public;

grant execute on function public.get_invitation(text) to anon, authenticated;
grant execute on function public.set_rsvp(text, uuid, text) to anon, authenticated;
grant execute on function public.get_gifts(text) to anon, authenticated;
grant execute on function public.reserve_gift(text, uuid) to anon, authenticated;
grant execute on function public.release_gift(text, uuid) to anon, authenticated;

-- =============================================================================
-- 9. Publicación de Realtime
-- =============================================================================

alter publication supabase_realtime add table
  public.events,
  public.invitations,
  public.guests,
  public.gifts,
  public.gift_reservations;
