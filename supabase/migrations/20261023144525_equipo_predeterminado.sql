-- Tablas de equipos (teams y team_members) y actualización de events_add_owner:
-- cuando un owner de un equipo crea un evento, los demás miembros de ese equipo
-- quedan agregados automáticamente al evento con su rol del equipo.

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint teams_name_length check (char_length(name) between 1 and 120)
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  constraint team_members_pkey primary key (team_id, user_id),
  constraint team_members_role_valid check (role in ('owner', 'helper'))
);

create index team_members_user_id_idx on public.team_members (user_id);

-- Solo se administran desde SQL.
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

revoke all on table public.teams, public.team_members from anon, authenticated;

-- security definer porque el creador todavía no es miembro y porque
-- team_members no es legible para authenticated.
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

    insert into public.event_members (event_id, user_id, role)
    select distinct on (tm.user_id)
      new.id,
      tm.user_id,
      tm.role
    from public.team_members tm
    join public.team_members creator_tm
      on creator_tm.team_id = tm.team_id
    where creator_tm.user_id = new.created_by
      and creator_tm.role = 'owner'
      and tm.user_id <> new.created_by
    order by
      tm.user_id,
      case when tm.role = 'owner' then 0 else 1 end
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function private.events_add_owner() from public;
