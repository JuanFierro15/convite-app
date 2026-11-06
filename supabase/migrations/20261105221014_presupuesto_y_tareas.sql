-- Presupuesto y tareas: equipo del evento, perfiles, categorías, gastos, pagos y tareas.
-- El vínculo gasto-tarea vive en expenses.task_id: así tasks no guarda nada que le
-- revele a un ayudante que una tarea tiene gasto.

-- =============================================================================
-- 1. Equipo del evento
-- =============================================================================

alter table public.events
  add column team_id uuid references public.teams (id) on delete set null;

create index events_team_id_idx on public.events (team_id);

-- Solo hay un evento y su creador es propietario de un único equipo.
update public.events e
set team_id = (
  select tm.team_id
  from public.team_members tm
  where tm.user_id = e.created_by
    and tm.role = 'owner'
)
where (
  select count(*)
  from public.team_members tm
  where tm.user_id = e.created_by
    and tm.role = 'owner'
) = 1;

-- Va en un disparador before porque events_add_owner corre after y ya no puede
-- cambiar la fila. Ignora lo que mande el cliente: team_id da acceso a los perfiles.
create or replace function private.events_set_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_ids uuid[];
begin
  select array_agg(tm.team_id) into v_team_ids
  from public.team_members tm
  where tm.user_id = new.created_by
    and tm.role = 'owner';

  new.team_id := case when cardinality(v_team_ids) = 1 then v_team_ids[1] else null end;
  return new;
end;
$$;

create trigger events_set_team
  before insert on public.events
  for each row execute function private.events_set_team();

-- auth.uid() es nulo en SQL administrativo: un evento sin equipo se corrige por ahí.
create or replace function private.events_prevent_team_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    raise exception 'team_id_immutable';
  end if;
  return new;
end;
$$;

create trigger events_prevent_team_change
  before update of team_id on public.events
  for each row
  when (old.team_id is distinct from new.team_id)
  execute function private.events_prevent_team_change();

-- =============================================================================
-- 2. Tablas
-- =============================================================================

create table public.team_profiles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint team_profiles_name_length check (char_length(btrim(name)) between 1 and 40)
);

create unique index team_profiles_active_name_key
  on public.team_profiles (team_id, lower(btrim(name)))
  where archived_at is null;

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint expense_categories_name_length check (char_length(btrim(name)) between 1 and 40),
  constraint expense_categories_id_event_key unique (id, event_id)
);

create unique index expense_categories_name_key
  on public.expense_categories (event_id, lower(btrim(name)));

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null,
  note text,
  assignee_profile_id uuid references public.team_profiles (id) on delete restrict,
  due_date date not null,
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint tasks_note_length check (note is null or char_length(note) <= 500),
  constraint tasks_done_by_requires_done_at check (done_by is null or done_at is not null),
  constraint tasks_id_event_key unique (id, event_id)
);

create index tasks_event_id_idx on public.tasks (event_id);
create index tasks_assignee_profile_id_idx on public.tasks (assignee_profile_id);
create index tasks_done_by_idx on public.tasks (done_by);

-- Las llaves compuestas con event_id garantizan en la base que la categoría y la
-- tarea son del mismo evento. La de categoría va con no action y no con restrict:
-- frena borrar una categoría con gastos, pero se revisa al final de la cascada y
-- deja borrar el evento completo.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  category_id uuid not null,
  task_id uuid,
  description text not null,
  amount_cop integer not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_description_length check (char_length(btrim(description)) between 1 and 120),
  constraint expenses_amount_range check (amount_cop between 1 and 999999999),
  constraint expenses_note_length check (note is null or char_length(note) <= 500),
  constraint expenses_id_event_key unique (id, event_id),
  constraint expenses_task_id_key unique (task_id),
  constraint expenses_category_same_event foreign key (category_id, event_id)
    references public.expense_categories (id, event_id) on delete no action,
  constraint expenses_task_same_event foreign key (task_id, event_id)
    references public.tasks (id, event_id) on delete set null (task_id)
);

create index expenses_event_id_idx on public.expenses (event_id);
create index expenses_category_id_idx on public.expenses (category_id, event_id);

create table public.expense_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  event_id uuid not null references public.events (id) on delete cascade,
  paid_by_profile_id uuid not null references public.team_profiles (id) on delete restrict,
  amount_cop integer not null,
  paid_on date not null default ((now() at time zone 'America/Bogota')::date),
  created_at timestamptz not null default now(),
  constraint expense_payments_amount_positive check (amount_cop > 0),
  constraint expense_payments_expense_same_event foreign key (expense_id, event_id)
    references public.expenses (id, event_id) on delete cascade
);

create index expense_payments_expense_id_idx on public.expense_payments (expense_id, event_id);
create index expense_payments_event_id_idx on public.expense_payments (event_id);
create index expense_payments_paid_by_profile_id_idx on public.expense_payments (paid_by_profile_id);

alter table public.team_profiles enable row level security;
alter table public.expense_categories enable row level security;
alter table public.tasks enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payments enable row level security;

-- =============================================================================
-- 3. Funciones auxiliares
-- =============================================================================

-- security definer porque team_members no es legible para authenticated.
create or replace function private.is_team_owner(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = (select auth.uid())
      and tm.role = 'owner'
  );
$$;

create or replace function private.is_team_event_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    join public.event_members m on m.event_id = e.id
    where e.team_id = p_team_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.assert_profile_usable(p_profile_id uuid, p_event_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_team_id uuid;
  v_archived_at timestamptz;
  v_event_team_id uuid;
begin
  select p.team_id, p.archived_at into v_profile_team_id, v_archived_at
  from public.team_profiles p
  where p.id = p_profile_id;

  if not found then
    raise exception 'profile_not_found';
  end if;

  select e.team_id into v_event_team_id
  from public.events e
  where e.id = p_event_id;

  if v_event_team_id is distinct from v_profile_team_id then
    raise exception 'profile_wrong_team';
  end if;

  if v_archived_at is not null then
    raise exception 'profile_archived';
  end if;
end;
$$;

-- =============================================================================
-- 4. Disparadores
-- =============================================================================

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function private.set_updated_at();

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function private.set_updated_at();

create trigger expense_categories_prevent_event_change
  before update of event_id on public.expense_categories
  for each row
  when (old.event_id is distinct from new.event_id)
  execute function private.prevent_event_id_change();

create trigger tasks_prevent_event_change
  before update of event_id on public.tasks
  for each row
  when (old.event_id is distinct from new.event_id)
  execute function private.prevent_event_id_change();

create trigger expenses_prevent_event_change
  before update of event_id on public.expenses
  for each row
  when (old.event_id is distinct from new.event_id)
  execute function private.prevent_event_id_change();

create trigger expense_payments_prevent_event_change
  before update of event_id on public.expense_payments
  for each row
  when (old.event_id is distinct from new.event_id)
  execute function private.prevent_event_id_change();

-- El update ya bloqueó la fila del gasto y un pago nuevo también la bloquea,
-- así que bajar el monto y registrar un pago no se cruzan.
create or replace function private.expenses_check_amount()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    select coalesce(sum(p.amount_cop), 0)
    from public.expense_payments p
    where p.expense_id = new.id
  ) > new.amount_cop then
    raise exception 'amount_below_paid';
  end if;
  return new;
end;
$$;

create trigger expenses_check_amount
  before update of amount_cop on public.expenses
  for each row
  when (new.amount_cop is distinct from old.amount_cop)
  execute function private.expenses_check_amount();

-- event_id se copia del gasto para que el cliente no lo pueda desalinear. Con
-- security invoker, quien no ve el gasto recibe expense_not_found.
create or replace function private.expense_payments_before_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_amount integer;
  v_paid bigint;
begin
  select x.event_id, x.amount_cop into v_event_id, v_amount
  from public.expenses x
  where x.id = new.expense_id
  for update;

  if not found then
    raise exception 'expense_not_found';
  end if;

  new.event_id := v_event_id;

  if new.paid_on > (now() at time zone 'America/Bogota')::date then
    raise exception 'payment_future_date';
  end if;

  select coalesce(sum(p.amount_cop), 0) into v_paid
  from public.expense_payments p
  where p.expense_id = new.expense_id;

  if v_paid + new.amount_cop > v_amount then
    raise exception 'payment_exceeds_expense';
  end if;

  perform private.assert_profile_usable(new.paid_by_profile_id, v_event_id);
  return new;
end;
$$;

create trigger expense_payments_before_insert
  before insert on public.expense_payments
  for each row execute function private.expense_payments_before_insert();

-- Una tarea que ya tenía un perfil luego archivado se puede seguir editando.
create or replace function private.tasks_check_assignee()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.assert_profile_usable(new.assignee_profile_id, new.event_id);
  return new;
end;
$$;

create trigger tasks_check_assignee_insert
  before insert on public.tasks
  for each row
  when (new.assignee_profile_id is not null)
  execute function private.tasks_check_assignee();

create trigger tasks_check_assignee_update
  before update of assignee_profile_id on public.tasks
  for each row
  when (new.assignee_profile_id is not null and new.assignee_profile_id is distinct from old.assignee_profile_id)
  execute function private.tasks_check_assignee();

-- =============================================================================
-- 5. Políticas
-- =============================================================================

create policy "Team members can view profiles"
  on public.team_profiles for select
  to authenticated
  using (private.is_team_event_member(team_id) or private.is_team_owner(team_id));

create policy "Team owners can create profiles"
  on public.team_profiles for insert
  to authenticated
  with check (private.is_team_owner(team_id));

create policy "Team owners can update profiles"
  on public.team_profiles for update
  to authenticated
  using (private.is_team_owner(team_id))
  with check (private.is_team_owner(team_id));

create policy "Team owners can delete profiles"
  on public.team_profiles for delete
  to authenticated
  using (private.is_team_owner(team_id));

create policy "Owners can view expense categories"
  on public.expense_categories for select
  to authenticated
  using (private.is_event_member(event_id, array['owner']));

create policy "Owners can create expense categories"
  on public.expense_categories for insert
  to authenticated
  with check (private.is_event_member(event_id, array['owner']));

create policy "Owners can update expense categories"
  on public.expense_categories for update
  to authenticated
  using (private.is_event_member(event_id, array['owner']))
  with check (private.is_event_member(event_id, array['owner']));

create policy "Owners can delete expense categories"
  on public.expense_categories for delete
  to authenticated
  using (private.is_event_member(event_id, array['owner']));

create policy "Owners can view expenses"
  on public.expenses for select
  to authenticated
  using (private.is_event_member(event_id, array['owner']));

create policy "Owners can create expenses"
  on public.expenses for insert
  to authenticated
  with check (private.is_event_member(event_id, array['owner']));

create policy "Owners can update expenses"
  on public.expenses for update
  to authenticated
  using (private.is_event_member(event_id, array['owner']))
  with check (private.is_event_member(event_id, array['owner']));

create policy "Owners can delete expenses"
  on public.expenses for delete
  to authenticated
  using (private.is_event_member(event_id, array['owner']));

-- Sin política de update: un pago mal registrado se borra y se vuelve a registrar.
create policy "Owners can view expense payments"
  on public.expense_payments for select
  to authenticated
  using (private.is_event_member(event_id, array['owner']));

create policy "Owners can create expense payments"
  on public.expense_payments for insert
  to authenticated
  with check (private.is_event_member(event_id, array['owner']));

create policy "Owners can delete expense payments"
  on public.expense_payments for delete
  to authenticated
  using (private.is_event_member(event_id, array['owner']));

create policy "Members can view tasks"
  on public.tasks for select
  to authenticated
  using (private.is_event_member(event_id));

create policy "Owners can create tasks"
  on public.tasks for insert
  to authenticated
  with check (private.is_event_member(event_id, array['owner']));

create policy "Owners can update tasks"
  on public.tasks for update
  to authenticated
  using (private.is_event_member(event_id, array['owner']))
  with check (private.is_event_member(event_id, array['owner']));

create policy "Owners can delete tasks"
  on public.tasks for delete
  to authenticated
  using (private.is_event_member(event_id, array['owner']));

-- =============================================================================
-- 6. Privilegios
-- =============================================================================

revoke all on table
  public.team_profiles,
  public.expense_categories,
  public.tasks,
  public.expenses,
  public.expense_payments
from anon, authenticated;

grant select, insert, delete on table
  public.team_profiles,
  public.expense_categories,
  public.expenses,
  public.expense_payments
to authenticated;

grant update (name, sort_order, archived_at) on public.team_profiles to authenticated;
grant update (event_id, name, sort_order) on public.expense_categories to authenticated;
grant update (event_id, category_id, task_id, description, amount_cop, note) on public.expenses to authenticated;

-- done_at y done_by quedan por fuera: solo los escribe set_task_done.
grant select, delete on table public.tasks to authenticated;
grant insert (id, event_id, title, note, assignee_profile_id, due_date) on public.tasks to authenticated;
grant update (event_id, title, note, assignee_profile_id, due_date) on public.tasks to authenticated;

revoke execute on function private.events_set_team() from public;
revoke execute on function private.events_prevent_team_change() from public;
revoke execute on function private.is_team_owner(uuid) from public;
revoke execute on function private.is_team_event_member(uuid) from public;
revoke execute on function private.assert_profile_usable(uuid, uuid) from public;
revoke execute on function private.expenses_check_amount() from public;
revoke execute on function private.expense_payments_before_insert() from public;
revoke execute on function private.tasks_check_assignee() from public;

grant execute on function private.is_team_owner(uuid) to authenticated;
grant execute on function private.is_team_event_member(uuid) to authenticated;
grant execute on function private.assert_profile_usable(uuid, uuid) to authenticated;

-- Los disparadores que la llaman son security invoker: las pruebas y los datos de
-- prueba insertan como service_role.
grant execute on function private.assert_profile_usable(uuid, uuid) to service_role;

-- =============================================================================
-- 7. Funciones RPC del panel
-- =============================================================================

create or replace function public.can_manage_profiles(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.is_team_owner(e.team_id)
    from public.events e
    where e.id = p_event_id
      and private.is_event_member(e.id)
  ), false);
$$;

create or replace function public.set_task_done(p_task_id uuid, p_done boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
begin
  select * into v_task
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found or not private.is_event_member(v_task.event_id) then
    raise exception 'task_not_found';
  end if;

  if p_done and v_task.done_at is null then
    update public.tasks t
    set done_at = now(), done_by = (select auth.uid())
    where t.id = p_task_id
    returning * into v_task;
  elsif not p_done and v_task.done_at is not null then
    update public.tasks t
    set done_at = null, done_by = null
    where t.id = p_task_id
    returning * into v_task;
  end if;

  return jsonb_build_object('id', v_task.id, 'done_at', v_task.done_at, 'done_by', v_task.done_by);
end;
$$;

-- Guarda la tarea y su gasto en una transacción. Los id los genera el cliente para
-- que repetir la llamada no duplique nada. Va con update y luego insert, no con
-- on conflict: el disparador before insert rechazaría un perfil ya archivado aunque
-- la tarea solo se estuviera editando.
-- p_expense_action: keep | unlink | new (p_expense: id, category_id, description,
-- amount_cop) | link (p_expense: id).
create or replace function public.save_task(
  p_task_id uuid,
  p_event_id uuid,
  p_title text,
  p_note text,
  p_assignee_profile_id uuid,
  p_due_date date,
  p_expense_action text default 'keep',
  p_expense jsonb default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_expense_id uuid;
  v_result jsonb;
begin
  if p_expense_action not in ('keep', 'unlink', 'new', 'link') then
    raise exception 'invalid_expense_action';
  end if;

  if exists (
    select 1 from public.tasks t where t.id = p_task_id and t.event_id <> p_event_id
  ) then
    raise exception 'event_id_immutable';
  end if;

  update public.tasks t
  set title = btrim(p_title),
      note = nullif(btrim(coalesce(p_note, '')), ''),
      assignee_profile_id = p_assignee_profile_id,
      due_date = p_due_date
  where t.id = p_task_id;

  if not found then
    insert into public.tasks (id, event_id, title, note, assignee_profile_id, due_date)
    values (
      p_task_id,
      p_event_id,
      btrim(p_title),
      nullif(btrim(coalesce(p_note, '')), ''),
      p_assignee_profile_id,
      p_due_date
    );
  end if;

  if p_expense_action = 'keep' then
    null;
  else
    v_expense_id := (p_expense ->> 'id')::uuid;

    update public.expenses x
    set task_id = null
    where x.task_id = p_task_id
      and x.id is distinct from v_expense_id;

    if p_expense_action = 'new' then
      insert into public.expenses (id, event_id, category_id, task_id, description, amount_cop)
      values (
        v_expense_id,
        p_event_id,
        (p_expense ->> 'category_id')::uuid,
        p_task_id,
        btrim(p_expense ->> 'description'),
        (p_expense ->> 'amount_cop')::integer
      )
      on conflict (id) do nothing;

      -- Repetir la llamada deja el mismo vínculo. Si el id ya era de otro gasto, el
      -- insert no hace nada y sin esta revisión la tarea quedaría sin su gasto.
      if not exists (
        select 1
        from public.expenses x
        where x.id = v_expense_id
          and x.task_id = p_task_id
      ) then
        raise exception 'expense_already_linked';
      end if;
    elsif p_expense_action = 'link' then
      update public.expenses x
      set task_id = p_task_id
      where x.id = v_expense_id
        and (x.task_id is null or x.task_id = p_task_id);

      if not found then
        raise exception 'expense_already_linked';
      end if;
    end if;
  end if;

  select to_jsonb(t) into v_result from public.tasks t where t.id = p_task_id;
  return v_result;
end;
$$;

-- El gasto solo se borra si no tiene pagos; si tiene, la llave lo desvincula.
create or replace function public.delete_task(p_task_id uuid, p_delete_expense boolean default false)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_deleted_expense boolean := false;
begin
  if p_delete_expense then
    delete from public.expenses x
    where x.task_id = p_task_id
      and not exists (select 1 from public.expense_payments p where p.expense_id = x.id);
    v_deleted_expense := found;
  end if;

  delete from public.tasks t where t.id = p_task_id;

  if not found then
    raise exception 'task_not_found';
  end if;

  return jsonb_build_object('deleted_expense', v_deleted_expense);
end;
$$;

revoke execute on function public.can_manage_profiles(uuid) from public, anon;
revoke execute on function public.set_task_done(uuid, boolean) from public, anon;
revoke execute on function public.save_task(uuid, uuid, text, text, uuid, date, text, jsonb) from public, anon;
revoke execute on function public.delete_task(uuid, boolean) from public, anon;

grant execute on function public.can_manage_profiles(uuid) to authenticated;
grant execute on function public.set_task_done(uuid, boolean) to authenticated;
grant execute on function public.save_task(uuid, uuid, text, text, uuid, date, text, jsonb) to authenticated;
grant execute on function public.delete_task(uuid, boolean) to authenticated;

-- =============================================================================
-- 8. Realtime
-- =============================================================================

-- expenses, expense_payments y expense_categories quedan fuera a propósito:
-- apply_rls no evalúa RLS en DELETE y le avisaría a un ayudante suscrito.
alter publication supabase_realtime add table public.tasks;
