-- ٢٦ سبتمبر ٢٠٢٦: تقليل البيانات · العملاء السابقون المطابقون لعقار جديد · موافقة المكتب على اتفاقية معالجة البيانات

-- ===== ١) مدة حفظ نص المحادثات: ٩٠ يوماً ثم يُحذف النص الخام ويبقى الملخص والطلب في بطاقة العميل =====
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

create index if not exists messages_created_idx on public.messages (created_at);

-- ===== ٢) ميزانية الإيجار الشهرية =====
-- أسعار الإيجار في المخزون سنوية. ميزانية إيجار أقل من ١٠ آلاف = شهرية (ما فيه إيجار سنوي بأقل من كذا)،
-- فتُضرب في ١٢ قبل المقارنة. قبل هذا كان عميل «٣٥٠٠ شهري» ما يطابق شقة بـ ٤٢ ألف سنوي.
create or replace function public.annual_budget(p_deal text, p_budget numeric, p_period text default null)
 returns numeric language sql immutable
 set search_path to 'public', 'pg_temp'
as $$
  select case
    when p_budget is null then null
    when p_deal = 'إيجار' and (p_period = 'شهري' or (p_period is distinct from 'سنوي' and p_budget < 10000))
      then p_budget * 12
    else p_budget end
$$;

CREATE OR REPLACE FUNCTION public.match_properties(p_office uuid, p_deal text, p_type text, p_districts text[], p_budget numeric, p_rooms integer, p_limit integer DEFAULT 3)
 RETURNS TABLE(id uuid, title text, district text, price numeric, rooms integer, ad_license_no text, ad_license_expiry date, images text[], score integer, grade text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with b as (select public.annual_budget(p_deal, p_budget) as budget),
  scored as (
    select p.id, p.title, p.district, p.price, p.rooms,
           p.ad_license_no, p.ad_license_expiry, p.images,
           (
             case
               when p_districts is null or array_length(p_districts,1) is null then 20
               when exists (select 1 from unnest(p_districts) d
                            where btrim(d) <> '' and p.district ilike '%'||btrim(d)||'%') then 40
               else 0
             end
           + case
               when b.budget is null then 20
               when p.price <= b.budget             then 30
               when p.price <= b.budget * 1.15      then 18
               else 0
             end
           + case
               when p_rooms is null or p.rooms is null then 10
               when p.rooms = p_rooms                  then 20
               when abs(p.rooms - p_rooms) = 1         then 12
               else 4
             end
           + case
               when p_type is null then 5
               when p.property_type = p_type then 10
               else 0
             end
           )::int as score
    from v_listable_properties p, b
    where p.office_id = p_office
      and (p_deal   is null or p.deal_type = p_deal)
      and (p_type   is null or p.property_type = p_type)
      and (b.budget is null or p.price between b.budget * 0.5 and b.budget * 1.15)
  )
  select id, title, district, price, rooms, ad_license_no, ad_license_expiry, images, score,
         case when score >= 85 then 'تطابق تام'
              when score >= 70 then 'تطابق قوي'
              else 'بديل جيد' end
  from scored
  where score >= 50
  order by score desc, price asc
  limit greatest(p_limit, 1);
$function$;

-- ===== ٣) العملاء السابقون المطابقون لعقار (للمكتب نفسه فقط) =====
-- المكتب يشوف طلبات عملائه في آخر ٣٠ يوماً اللي تطابق عقاراً عنده: نفس نوع الطلب ونوع العقار والحي،
-- والسعر ضمن الميزانية (+١٥٪). يُستبعد من كتب «توقف» ومن أُغلق طلبه (صفقة أو ما تمت).
-- مقصد ما يرسل لهم شيء — المكتب يتواصل بنفسه إذا شاف أن الطلب ما زال قائماً.
create or replace function public.match_customers(p_office uuid, p_property uuid, p_days integer default 30, p_limit integer default 30)
 returns table(id uuid, name text, phone text, deal_type text, property_type text, location text,
               budget numeric, budget_period text, rooms integer, status text, outcome text,
               last_at timestamptz, score integer)
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with p as (select * from public.properties where id = p_property and office_id = p_office),
  c as (
    select c.*, coalesce(c.last_message_at, c.created_at) as seen,
           public.annual_budget(c.deal_type, c.budget, c.budget_period) as yb
    from public.customers c, p
    where c.office_id = p.office_id
      and c.deal_type = p.deal_type
      and c.property_type = p.property_type
      and not c.opted_out
      and coalesce(c.outcome, '') not in ('deal', 'lost')
      and coalesce(c.last_message_at, c.created_at) >= now() - make_interval(days => greatest(p_days, 1))
  )
  select c.id, c.name, c.phone, c.deal_type, c.property_type, c.location, c.budget, c.budget_period, c.rooms,
         c.status::text, c.outcome, c.seen,
         ( case when c.rooms is null or p.rooms is null then 10
                when c.rooms = p.rooms then 20
                when abs(c.rooms - p.rooms) = 1 then 12 else 4 end
         + case when p.price <= c.yb then 30 else 18 end
         + case when c.status = 'qualified' then 10 else 0 end )::int
  from c, p
  where c.yb is not null
    and p.price between c.yb * 0.5 and c.yb * 1.15
    and exists (
      select 1 from regexp_split_to_table(coalesce(c.location, ''), '\s*[,،]\s*') d
      where btrim(d) <> ''
        and (p.district ilike '%' || btrim(d) || '%' or btrim(d) ilike '%' || p.district || '%'))
  order by 13 desc, c.seen desc
  limit greatest(p_limit, 1);
$function$;

revoke all on function public.match_customers(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.match_customers(uuid, uuid, integer, integer) to service_role;
revoke all on function public.annual_budget(text, numeric, text) from public, anon, authenticated;
grant execute on function public.annual_budget(text, numeric, text) to service_role;

-- ===== ٤) موافقة المكتب على الشروط واتفاقية معالجة البيانات (من داخل التطبيق) =====
alter table public.offices add column if not exists terms_version text;
alter table public.offices add column if not exists terms_accepted_at timestamptz;
alter table public.offices add column if not exists terms_accepted_by uuid references public.staff(id) on delete set null;
