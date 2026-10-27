-- Tema de miel y flores silvestres: sin él en la lista, guardar un evento con ese tema falla.
alter table public.events
  drop constraint events_theme_id_valid,
  add constraint events_theme_id_valid check (theme_id in ('baby-shower', 'bautizo', 'honey-bee'));
