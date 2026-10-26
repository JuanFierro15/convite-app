-- Tope de familias para un regalo repetible; nulo significa sin límite.
alter table public.gifts
  add column max_reservations integer,
  add constraint gifts_max_reservations_valid check (
    max_reservations is null or (kind = 'repeatable' and max_reservations >= 1)
  );

-- Bajar el tope por debajo de las reservas dejaría familias por fuera sin avisarles.
-- El update bloquea la fila del regalo antes de correr el disparador y reserve_gift
-- también la bloquea, así que un cambio de tope y una reserva no se cruzan.
create or replace function private.gifts_check_max_reservations()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.gift_reservations r
    where r.gift_id = new.id
  ) > new.max_reservations then
    raise exception 'reservations_exceed_limit';
  end if;
  return new;
end;
$$;

create trigger gifts_check_max_reservations
  before update of max_reservations on public.gifts
  for each row
  when (new.max_reservations is not null and new.max_reservations is distinct from old.max_reservations)
  execute function private.gifts_check_max_reservations();

revoke execute on function private.gifts_check_max_reservations() from public, anon, authenticated;

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
          ),
          'remaining', case
            when g.max_reservations is null then null
            else greatest(g.max_reservations - c.reserved_count, 0)
          end,
          'full', g.max_reservations is not null and c.reserved_count >= g.max_reservations
        )
        order by
          case g.kind when 'repeatable' then 0 when 'free' then 1 else 2 end,
          g.sort_order,
          g.name,
          g.id
      )
      from public.gifts g
      cross join lateral (
        select count(*)::integer as reserved_count
        from public.gift_reservations r
        where r.gift_id = g.id
      ) c
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
  select g.max_reservations into v_max_reservations
  from public.gifts g
  where g.id = p_gift_id
    and g.event_id = v_event_id
  for update;

  if not found then
    raise exception 'gift_not_found';
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

  if v_max_reservations is not null then
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
