-- ===== التنبيهات: المكتب يختار تيليجرام أو إشعارات الجوال أو الاثنين =====
alter table public.offices
  add column if not exists notify_telegram boolean not null default true,
  add column if not exists notify_push     boolean not null default true;

-- اشتراكات إشعارات الجوال (Web Push): جهاز لكل صف، مربوط بموظف ومكتب
create table if not exists public.push_subs (
  id          bigint generated always as identity primary key,
  office_id   uuid not null references public.offices(id) on delete cascade,
  -- بلا مفتاح أجنبي عمداً: أي علاقة ثانية بين الموظفين والمكاتب تلخبط ربط «الموظف ← مكتبه» (PGRST201)
  staff_id    uuid,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  device      text,
  fails       integer not null default 0,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
create index if not exists push_subs_office_idx on public.push_subs (office_id);
alter table public.push_subs enable row level security;
revoke all on public.push_subs from anon, authenticated;
-- الجداول الجديدة بعد ٣٠ أكتوبر تحتاج صلاحية صريحة للخادم
grant select, insert, update, delete on public.push_subs to service_role;
