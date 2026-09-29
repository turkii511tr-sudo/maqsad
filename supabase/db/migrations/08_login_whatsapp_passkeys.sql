-- ٢٨ سبتمبر ٢٠٢٦: الدخول بلا رسائل رموز مدفوعة
--   ١) أول دخول (أو جهاز جديد): الموظف يرسل «دخول مقصد ١٢٣٤» من واتساب جواله إلى رقم المنصة (أو رقم مكتبه
--      حتى يُضبط رقم المنصة). الرسالة منه، فالرد عليها مجاني، وواتساب نفسه يثبت أنه صاحب الرقم.
--   ٢) بعدها: البصمة (Passkeys) على جهازه.
--   ٣) احتياط: رمز لمرة وحدة يصدره مشغّل المنصة، أو يصله هو على تيليجرام.
-- تنبيه: لا روابط (FK) بين هذه الجداول وجدول offices، حتى لا يصير ربط staff ↔ offices غامضاً (راجع 07c).

create table if not exists public.login_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  phone text not null,
  nonce text not null,
  poll_hash text not null,
  channel text not null check (channel in ('platform', 'office')),
  channel_office uuid,
  device text,
  expires_at timestamptz not null,
  verified_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists login_requests_phone_idx on public.login_requests (phone, nonce);

create table if not exists public.passkeys (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  cred_id text not null unique,
  public_key jsonb not null,
  alg integer not null,
  sign_count bigint not null default 0,
  rp_id text not null,
  transports text[],
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists passkeys_staff_idx on public.passkeys (staff_id);

create table if not exists public.auth_challenges (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('reg', 'login')),
  staff_id uuid references public.staff(id) on delete cascade,
  challenge text not null,
  rp_id text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- لا وصول إلا من الخادم (service_role)
alter table public.login_requests enable row level security;
alter table public.passkeys enable row level security;
alter table public.auth_challenges enable row level security;
revoke all on public.login_requests, public.passkeys, public.auth_challenges from public, anon, authenticated;
grant all on public.login_requests, public.passkeys, public.auth_challenges to service_role;

-- التنظيف اليومي: طلبات الدخول والتحديات المنتهية
create or replace function public.housekeeping()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  delete from public.sessions where kind = 'magic' and (used_at is not null or expires_at < now());
  delete from public.sessions   where expires_at < now() - interval '7 days';
  delete from public.otps       where expires_at < now() - interval '1 day';
  delete from public.login_requests  where created_at < now() - interval '1 day';
  delete from public.auth_challenges where created_at < now() - interval '1 day';
  delete from public.login_audit where created_at < now() - interval '90 days';
  delete from public.events     where created_at < now() - interval '90 days' and level <> 'error';
  delete from public.events     where created_at < now() - interval '12 months';
  delete from public.backup_runs where started_at < now() - interval '180 days';
  -- طلبات الانضمام: ١٢ شهراً، وبصمة IP ٣٠ يوماً
  delete from public.signup_requests where created_at < now() - interval '12 months';
  update public.signup_requests set ip_hash = null
    where ip_hash is not null and created_at < now() - interval '30 days';
  -- رسائل «راسلنا»: ١٢ شهراً، وطلبات الخصوصية ٢٤ شهراً، وبصمة IP ٣٠ يوماً
  delete from public.contact_messages where topic <> 'privacy' and created_at < now() - interval '12 months';
  delete from public.contact_messages where created_at < now() - interval '24 months';
  update public.contact_messages set ip_hash = null
    where ip_hash is not null and created_at < now() - interval '30 days';
  -- سجل طلبات الخصوصية المغلقة: ٢٤ شهراً لإثبات التنفيذ
  delete from public.privacy_requests where status <> 'open' and created_at < now() - interval '24 months';
  -- نص رسائل واتساب الخام: ٩٠ يوماً (الملخص وتفاصيل الطلب تبقى في بطاقة العميل)
  delete from public.messages where created_at < now() - interval '90 days';
  delete from net._http_response where created < now() - interval '2 days';
end $function$;
