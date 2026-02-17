alter table public.clients
  add column if not exists address text,
  add column if not exists postcode text,
  add column if not exists notes text;
