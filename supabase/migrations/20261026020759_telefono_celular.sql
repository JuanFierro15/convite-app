-- Solo se aceptan celulares colombianos: 10 dígitos que empiezan por 3.

do $$
begin
  if exists (
    select 1
    from public.invitations
    where phone is not null
      and phone !~ '^\+573[0-9]{9}$'
  ) then
    raise exception 'phones_out_of_format';
  end if;
end;
$$;

alter table public.invitations
  drop constraint invitations_phone_format,
  add constraint invitations_phone_format check (phone is null or phone ~ '^\+573[0-9]{9}$');
