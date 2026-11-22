-- Chạy đoạn SQL này 1 lần duy nhất trong Supabase -> SQL Editor -> New query -> Run

create table if not exists public.app_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.html_models (
  id text primary key,
  name text not null,
  file_name text not null,
  added_at text not null,
  html text not null,
  created_at timestamptz not null default now()
);

-- Bật Row Level Security (chặn truy cập công khai trực tiếp từ trình duyệt;
-- chỉ backend server.py dùng Secret / service_role key mới đọc & ghi được)
alter table public.app_store enable row level security;
alter table public.html_models enable row level security;
