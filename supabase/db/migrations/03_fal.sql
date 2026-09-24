-- ===== رخصة فال: تحقق يدوي من مشغّل المنصة قبل تشغيل المساعد =====
-- الحالة المخزّنة: pending (بانتظار التحقق) · verified (متحقق منها) · rejected (غير معتمدة)
-- «منتهية» ليست حالة مخزّنة: تُحسب من تاريخ الانتهاء في كل مرة، فلا تتأخر ولا تحتاج مهمة تغيّرها
alter table public.offices
  add column if not exists fal_status      text not null default 'pending',
  add column if not exists fal_expires_on  date,
  add column if not exists fal_holder_name text,
  add column if not exists fal_proof_path  text,
  add column if not exists fal_verified_at timestamptz,
  -- بلا مفتاح أجنبي عمداً: علاقة ثانية بين المكاتب والموظفين تلخبط ربط «الموظف ← مكتبه» في الواجهة (PGRST201)
  add column if not exists fal_verified_by uuid,
  add column if not exists fal_note        text,
  -- آخر تنبيه انتهاء أُرسل للمكتب: 30 · 7 · 1 · -1 (انتهت) — يُصفَّر عند كل تحقق جديد
  add column if not exists fal_reminded    integer;

alter table public.offices
  add constraint offices_fal_status_chk check (fal_status in ('pending', 'verified', 'rejected')),
  -- لا اعتماد بلا تاريخ انتهاء واسم صاحب الرخصة وصورة من نتيجة الاستعلام
  add constraint offices_fal_verified_chk check (
    fal_status <> 'verified' or (
      fal_expires_on is not null and fal_holder_name is not null and
      fal_proof_path is not null and fal_verified_at is not null));

-- سجل كل تحقق أو رفض: الإثبات عند أي مراجعة (من تحقق، ومتى، وماذا رأى في الهيئة)
create table if not exists public.fal_checks (
  id          bigint generated always as identity primary key,
  office_id   uuid not null references public.offices(id) on delete cascade,
  license_no  text not null,
  result      text not null check (result in ('verified', 'rejected')),
  holder_name text,
  expires_on  date,
  proof_path  text,
  checks      jsonb not null default '{}'::jsonb,
  note        text,
  checked_by  uuid references public.staff(id) on delete set null,
  checked_at  timestamptz not null default now()
);
create index if not exists fal_checks_office_idx on public.fal_checks (office_id, checked_at desc);
alter table public.fal_checks enable row level security;
revoke all on public.fal_checks from anon, authenticated;

-- صور نتيجة الاستعلام: مخزن خاص بلا أي صلاحية عامة — يقرأه الخادم فقط، ويعرضه للمشغّل برابط مؤقت
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fal-proofs', 'fal-proofs', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- تنظيف: سجل الدخول بلا أي صلاحية عامة (كان مقفولاً بالحماية على مستوى الصفوف، وهذا يقفله من الأساس)
revoke all on public.login_audit from anon, authenticated;
