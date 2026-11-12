-- Galería de fotos: tabla event_photos, columna display_name en event_members,
-- bucket privado event-photos, políticas RLS, disparadores y publicación en Realtime.

-- =============================================================================
-- 1. Nombre visible en miembros del evento
-- =============================================================================

alter table public.event_members
  add column display_name text,
  add constraint event_members_display_name_length
    check (display_name is null or char_length(btrim(display_name)) between 1 and 40);

-- =============================================================================
-- 2. Tabla event_photos
-- =============================================================================

create table public.event_photos (
  id uuid primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  width integer not null,
  height integer not null,
  size_bytes integer not null,
  thumb_size_bytes integer not null,
  photo_path text generated always as (event_id::text || '/' || id::text || '.jpg') stored,
  thumb_path text generated always as (event_id::text || '/' || id::text || '_thumb.jpg') stored,
  constraint event_photos_width_valid check (width between 1 and 1600),
  constraint event_photos_height_valid check (height between 1 and 1600),
  constraint event_photos_size_valid check (size_bytes between 1 and 2097152),
  constraint event_photos_thumb_size_valid check (thumb_size_bytes between 1 and 2097152)
);

create index event_photos_event_created_idx on public.event_photos (event_id, created_at desc, id desc);
create index event_photos_uploaded_by_idx on public.event_photos (uploaded_by);

-- =============================================================================
-- 3. Funciones auxiliares y disparadores
-- =============================================================================

create or replace function private.photo_object_event_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_thumb)?\.jpg$'
    then split_part(p_name, '/', 1)::uuid
    else null
  end;
$$;

create or replace function private.event_photos_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo_count integer;
  v_user_id text;
  v_photo_path text;
  v_thumb_path text;
begin
  perform 1
  from public.events
  where id = new.event_id
  for no key update;

  select count(*) into v_photo_count
  from public.event_photos
  where event_id = new.event_id;

  if v_photo_count >= 300 then
    raise exception 'photo_limit_reached';
  end if;

  v_user_id := (select auth.uid())::text;

  if v_user_id is not null then
    v_photo_path := new.event_id::text || '/' || new.id::text || '.jpg';
    v_thumb_path := new.event_id::text || '/' || new.id::text || '_thumb.jpg';

    if not (
      exists (
        select 1
        from storage.objects o
        where o.bucket_id = 'event-photos'
          and o.name = v_photo_path
          and o.owner_id = v_user_id
      )
      and exists (
        select 1
        from storage.objects o
        where o.bucket_id = 'event-photos'
          and o.name = v_thumb_path
          and o.owner_id = v_user_id
      )
    ) then
      raise exception 'photo_files_missing';
    end if;
  end if;

  return new;
end;
$$;

create trigger event_photos_before_insert
  before insert on public.event_photos
  for each row execute function private.event_photos_before_insert();

create trigger event_photos_prevent_event_change
  before update of event_id on public.event_photos
  for each row
  when (old.event_id is distinct from new.event_id)
  execute function private.prevent_event_id_change();

-- =============================================================================
-- 4. RLS y privilegios de event_photos
-- =============================================================================

alter table public.event_photos enable row level security;

revoke all on table public.event_photos from anon, authenticated;
grant select, delete on table public.event_photos to authenticated;
grant insert (id, event_id, width, height, size_bytes, thumb_size_bytes) on public.event_photos to authenticated;

create policy "Members can view event photos"
  on public.event_photos for select
  to authenticated
  using (private.is_event_member(event_id));

create policy "Members can upload photos as themselves"
  on public.event_photos for insert
  to authenticated
  with check (
    private.is_event_member(event_id)
    and uploaded_by = (select auth.uid())
  );

create policy "Uploader or owner can delete photos"
  on public.event_photos for delete
  to authenticated
  using (
    private.is_event_member(event_id)
    and (
      uploaded_by = (select auth.uid())
      or private.is_event_member(event_id, array['owner'])
    )
  );

-- =============================================================================
-- 5. Bucket de almacenamiento y políticas de storage.objects
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-photos', 'event-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Members can read event photo files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'event-photos'
    and private.is_event_member(private.photo_object_event_id(name))
  );

create policy "Members can upload event photo files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-photos'
    and private.is_event_member(private.photo_object_event_id(name))
  );

create policy "Uploader or owner can delete event photo files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-photos'
    and private.is_event_member(private.photo_object_event_id(name))
    and (
      owner_id = (select auth.uid())::text
      or private.is_event_member(private.photo_object_event_id(name), array['owner'])
    )
  );

-- =============================================================================
-- 6. Permisos de funciones
-- =============================================================================

revoke execute on function private.photo_object_event_id(text) from public;
grant execute on function private.photo_object_event_id(text) to authenticated;

revoke execute on function private.event_photos_before_insert() from public;

-- =============================================================================
-- 7. Realtime
-- =============================================================================

alter publication supabase_realtime add table public.event_photos;
