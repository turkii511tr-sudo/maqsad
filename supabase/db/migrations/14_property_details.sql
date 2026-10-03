-- ٣ أكتوبر ٢٠٢٦ — تفاصيل العقار الاختيارية (دورات المياه، المساحة، العمر، المرافق، شروط الإيجار/البيع…)
-- عمود واحد jsonb اسمه details: المفاتيح المسموحة والقيم يفحصها api (cleanDetails) والواجهة (PD_GROUPS)،
-- وما يُخزَّن إلا اللي عبّاه صاحب العقار (غير المعبّأ = غير معروف، لا «لا»).
-- إضافة فقط: عمود + إعادة تعريف الـview بالعمود الجديد في آخره (بدون أي تغيير في شرط الترخيص).
--
-- ترتيب النشر: هذا الملف أولاً ← ثم api ← ثم wa-webhook ← ثم الواجهة. ثم جرّب login_start حياً.

alter table public.properties add column if not exists details jsonb not null default '{}'::jsonb;

create or replace view public.v_listable_properties as
 SELECT id,
    office_id,
    title,
    deal_type,
    property_type,
    district,
    city,
    price,
    rooms,
    state,
    ad_license_no,
    ad_license_expiry,
    images,
    notes,
    created_at,
    details
   FROM properties
  WHERE state = 'available'::prop_state AND ad_license_no IS NOT NULL AND btrim(ad_license_no) <> ''::text AND ad_license_expiry IS NOT NULL AND ad_license_expiry >= CURRENT_DATE;
