-- Toplu duyuru mesajları (admin → tüm kullanıcılar)
alter table public.messages add column if not exists subject text;
alter table public.messages add column if not exists is_broadcast boolean not null default false;

create index if not exists idx_messages_broadcast_inbox
  on public.messages (receiver_id, created_at desc)
  where is_broadcast = true;

comment on column public.messages.subject is 'Duyuru başlığı (toplu mesajlarda)';
comment on column public.messages.is_broadcast is 'true: admin tarafından tüm kullanıcılara gönderilen duyuru';
