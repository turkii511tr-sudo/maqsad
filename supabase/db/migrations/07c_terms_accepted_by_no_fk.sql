-- ٢٧ سبتمبر: الرابط الثاني بين offices و staff خلّى استعلامات «staff → offices(...)» غامضة وكسر الدخول ("الرقم غير مسجل").
-- العمود يبقى، بلا رابط. لا تضف رابطاً من offices إلى staff مستقبلاً إلا مع تحديد اسم العلاقة في كل الدوال.
alter table public.offices drop constraint if exists offices_terms_accepted_by_fkey;
notify pgrst, 'reload schema';
