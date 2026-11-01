-- Solo quedan los temas que tienen imágenes propias; ningún evento usaba el otro.
alter table public.events
  drop constraint events_theme_id_valid;

alter table public.events
  add constraint events_theme_id_valid check (theme_id in ('baby-shower', 'honey-bee'));
