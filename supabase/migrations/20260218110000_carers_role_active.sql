alter table public.carers
  add column if not exists role text,
  add column if not exists active boolean default true;
