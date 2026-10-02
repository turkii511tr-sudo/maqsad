-- ٢ أكتوبر ٢٠٢٦ — المدينة في الطلب والمطابقة، وميزانية الإيجار بفترتها، وتوحيد «بيع» و«شراء»
-- إضافات فقط: عمودان جديدان في customers ودالة مطابقة جديدة بجانب القديمة (wa-webhook المنشور
-- يستمر على match_properties حتى يُنشر الجديد). لا حذف ولا تغيير نوع لأي عمود.
--
-- ترتيب النشر: هذا الملف أولاً ← ثم wa-webhook و api ← ثم الواجهة.

-- 1) أعمدة العميل
alter table public.customers add column if not exists city text;
-- عدد ردود الذكاء المتتالية اللي ما أضافت أي معلومة جديدة للطلب (حماية من الدوران بلا تقدم)
alter table public.customers add column if not exists stale_turns integer not null default 0;

-- 2) تطبيع عربي خفيف للمقارنة: «حي النرجس» = «النرجس»، «المنتزه» = «المنتزة»، «الأندلس» = «الاندلس»
create or replace function public.ar_norm(t text)
 returns text language sql immutable
 set search_path to 'public', 'pg_temp'
as $$
  select lower(translate(btrim(regexp_replace(coalesce(t, ''), '^\s*(حي|مدينة|مدينه)\s+', '')), 'أإآةى', 'اااهي'))
$$;

-- 3) المطابقة الجديدة: فترة الميزانية تُحترم، والمدينة شرط إذا عُرفت، و«بيع» = «شراء»
create or replace function public.match_properties_v2(
  p_office uuid, p_deal text, p_type text, p_districts text[], p_budget numeric, p_rooms integer,
  p_limit integer default 3, p_period text default null, p_city text default null)
 returns table(id uuid, title text, city text, district text, price numeric, rooms integer,
               ad_license_no text, ad_license_expiry date, images text[], score integer, grade text)
 language sql stable
 set search_path to 'public', 'pg_temp'
as $function$
  with b as (select public.annual_budget(p_deal, p_budget, p_period) as budget),
  scored as (
    select p.id, p.title, p.city, p.district, p.price, p.rooms,
           p.ad_license_no, p.ad_license_expiry, p.images,
           (
             case
               when p_districts is null or array_length(p_districts,1) is null then 20
               when exists (select 1 from unnest(p_districts) d
                            where public.ar_norm(d) <> ''
                              and (public.ar_norm(p.district) like '%' || public.ar_norm(d) || '%'
                                   or public.ar_norm(d) like '%' || public.ar_norm(p.district) || '%')) then 40
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
      and (p_deal is null
           or p.deal_type = p_deal
           or (p_deal in ('شراء', 'بيع') and p.deal_type in ('شراء', 'بيع')))
      and (p_type is null or p.property_type = p_type)
      and (p_city is null or public.ar_norm(p_city) = ''
           or public.ar_norm(p.city) = public.ar_norm(p_city))
      and (b.budget is null or p.price between b.budget * 0.5 and b.budget * 1.15)
  )
  select id, title, city, district, price, rooms, ad_license_no, ad_license_expiry, images, score,
         case when score >= 85 then 'تطابق تام'
              when score >= 70 then 'تطابق قوي'
              else 'بديل جيد' end
  from scored
  where score >= 50
  order by score desc, price asc
  limit greatest(p_limit, 1);
$function$;

-- 4) عملاء سابقون يطابقون عقاراً: «بيع» = «شراء»، والمدينة إن عرفناها من العميل، والأحياء بالتطبيع
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
      and (c.deal_type = p.deal_type
           or (c.deal_type in ('شراء', 'بيع') and p.deal_type in ('شراء', 'بيع')))
      and c.property_type = p.property_type
      and (c.city is null or btrim(c.city) = '' or public.ar_norm(c.city) = public.ar_norm(p.city))
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
      where public.ar_norm(d) <> ''
        and (public.ar_norm(p.district) like '%' || public.ar_norm(d) || '%'
             or public.ar_norm(d) like '%' || public.ar_norm(p.district) || '%'))
  order by 13 desc, c.seen desc
  limit greatest(p_limit, 1);
$function$;

-- 5) بيانات: التطبيق يحفظ البيع باسم «شراء» (نفس قيمة طلب العميل)، وعقارات قديمة حُفظت «بيع»
--    فما كانت تطابق أي عميل شراء. التوحيد على «شراء» (لا يمس السعر ولا الترخيص).
update public.properties set deal_type = 'شراء' where deal_type = 'بيع';

-- 6) الصلاحيات: مثل بقية دوال المطابقة — للخادم فقط
revoke all on function public.ar_norm(text) from public, anon, authenticated;
grant execute on function public.ar_norm(text) to service_role;
revoke all on function public.match_properties_v2(uuid,text,text,text[],numeric,integer,integer,text,text) from public, anon, authenticated;
grant execute on function public.match_properties_v2(uuid,text,text,text[],numeric,integer,integer,text,text) to service_role;
