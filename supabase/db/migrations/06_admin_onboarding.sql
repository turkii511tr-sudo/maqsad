-- ٢٦ سبتمبر ٢٠٢٦: لوحة المدير · صورة رخصة فال عند التسجيل · خطوات أول دخول للمكتب

-- صورة/ملف رخصة فال المرفوعة مع طلب الانضمام (في مخزن fal-proofs الخاص)
alter table public.signup_requests add column if not exists fal_proof_path text;

-- المكتب: صورة الرخصة من التسجيل، وطلب تعديل الرخصة من صاحب المكتب (ينتظر المدير)
alter table public.offices add column if not exists fal_signup_proof text;
alter table public.offices add column if not exists fal_request jsonb;

-- خطوات أول دخول: متى أنهاها المكتب (أو تخطاها)، والخطوات المنجزة
alter table public.offices add column if not exists onboarded_at timestamptz;
alter table public.offices add column if not exists onboarding jsonb not null default '{}'::jsonb;

-- سجل تعديلات المدير يُقرأ من events بحسب النوع
create index if not exists events_kind_id_idx on public.events (kind, id desc);

-- ملف رخصة فال قد يكون PDF
update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
 where id = 'fal-proofs';
