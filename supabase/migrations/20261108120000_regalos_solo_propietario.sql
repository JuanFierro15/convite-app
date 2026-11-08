-- El ayudante puede leer los códigos de su evento, pero los regalos son solo del propietario.

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

  if auth.uid() is not null
     and private.is_event_member(v_event_id)
     and not private.is_event_member(v_event_id, array['owner']) then
    raise exception 'not_allowed';
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
          'max_reservations', g.max_reservations,
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
            when g.kind = 'repeatable' then greatest(g.max_reservations - c.reserved_count, 0)
            else null
          end,
          'full', g.kind = 'repeatable' and c.reserved_count >= g.max_reservations
        )
        order by
          case g.kind when 'repeatable' then 0 when 'free' then 1 when 'unique' then 2 else 3 end,
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

revoke execute on function public.get_gifts(text) from public;
grant execute on function public.get_gifts(text) to anon, authenticated;

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
  v_kind text;
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

  if auth.uid() is not null
     and private.is_event_member(v_event_id)
     and not private.is_event_member(v_event_id, array['owner']) then
    raise exception 'not_allowed';
  end if;

  -- El bloqueo pone en fila a quienes apartan el mismo regalo al mismo tiempo:
  -- el segundo espera y cuenta ya con la reserva del primero.
  select g.kind, g.max_reservations into v_kind, v_max_reservations
  from public.gifts g
  where g.id = p_gift_id
    and g.event_id = v_event_id
  for update;

  if not found then
    raise exception 'gift_not_found';
  end if;

  if v_kind not in ('unique', 'repeatable', 'free') then
    raise exception 'gift_not_reservable';
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

  if v_kind = 'repeatable' then
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

revoke execute on function public.reserve_gift(text, uuid) from public;
grant execute on function public.reserve_gift(text, uuid) to anon, authenticated;

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

  if auth.uid() is not null
     and private.is_event_member(v_event_id)
     and not private.is_event_member(v_event_id, array['owner']) then
    raise exception 'not_allowed';
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

revoke execute on function public.release_gift(text, uuid) from public;
grant execute on function public.release_gift(text, uuid) to anon, authenticated;
