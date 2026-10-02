-- ٢ أكتوبر ٢٠٢٦ — الوسيط المسؤول عن العميل (يختاره صاحب المكتب من بطاقة العميل)
-- إضافات فقط: عمودان في customers وفهرس. بلا مفتاح أجنبي (مثل outcome_by): حذف الموظف يفرّغ العمود من api.
--
-- ترتيب النشر: هذا الملف أولاً ← ثم api ← ثم الواجهة. ثم جرّب login_start حياً.

alter table public.customers add column if not exists assigned_to uuid;
alter table public.customers add column if not exists assigned_at timestamp with time zone;
create index if not exists customers_office_assigned_idx on public.customers (office_id, assigned_to);

