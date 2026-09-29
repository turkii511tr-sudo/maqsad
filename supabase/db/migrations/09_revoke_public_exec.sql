-- 09: إغلاق تنفيذ دوال القاعدة من خارج الخادم (٢٩ سبتمبر ٢٠٢٦)
-- خمس دوال كانت قابلة للاستدعاء بالمفتاح العام (anon). الدوال تُستدعى من دوال الخادم فقط (service_role).
revoke all on function public.demand_gap(uuid,integer) from public, anon, authenticated;
revoke all on function public.finish_processing(uuid) from public, anon, authenticated;
revoke all on function public.ingest_message(uuid,text,text,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.match_properties(uuid,text,text,text[],numeric,integer,integer) from public, anon, authenticated;
revoke all on function public.office_summary(uuid,integer) from public, anon, authenticated;
-- أي دالة جديدة لاحقاً: مغلقة افتراضياً عن الجميع إلا من يُعطى صراحة
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
grant execute on function public.demand_gap(uuid,integer), public.finish_processing(uuid),
  public.ingest_message(uuid,text,text,text,text,text,integer),
  public.match_properties(uuid,text,text,text[],numeric,integer,integer),
  public.office_summary(uuid,integer) to service_role;
