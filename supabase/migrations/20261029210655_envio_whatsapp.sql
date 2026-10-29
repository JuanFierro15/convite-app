alter table public.invitations
  add column whatsapp_sent_at timestamptz;

comment on column public.invitations.whatsapp_sent_at is
  'Primera vez que se abrió el chat de WhatsApp o se compartió el mensaje de la invitación desde la app.';
