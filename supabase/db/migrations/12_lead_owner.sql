-- ٢ أكتوبر ٢٠٢٦ — الوسيط المسؤول عن العميل (يختاره صاحب المكتب من بطاقة العميل) + الفرص الضائعة بالتفصيل
-- إضافات فقط: عمودان في customers وفهرس. بلا مفتاح أجنبي (مثل outcome_by): حذف الموظف يفرّغ العمود من api.
--
-- ترتيب النشر: هذا الملف أولاً ← ثم api ← ثم الواجهة. ثم جرّب login_start حياً.

alter table public.customers add column if not exists assigned_to uuid;
alter table public.customers add column if not exists assigned_at timestamp with time zone;
create index if not exists customers_office_assigned_idx on public.customers (office_id, assigned_to);


-- الفرص الضائعة بالتفصيل: الحي + نوع الطلب + نوع العقار، ووسط ميزانية الطالبين، وكم عقار متاح يناسب هالميزانية.
-- دالة جديدة بجانب demand_gap (api يرجع للقديمة إذا هذي ما انشرت). الأحياء تنفصل بـ «,» و«،»، وتُطبّع بـ ar_norm.
create or replace function public.demand_gap_v2(p_office uuid, p_days integer default 30)
 returns table(district text, deal_type text, property_type text, demand integer, budget numeric,
               supply integer, supply_fit integer)
 language sql stable
 set search_path to 'public', 'pg_temp'
as $function$
  with asked as (
    select public.ar_norm(x) as k, btrim(regexp_replace(x, '^\s*حي\s+', '')) as label,
           case when c.deal_type = 'بيع' then 'شراء' else c.deal_type end as deal,
           c.property_type as ptype,
           public.annual_budget(c.deal_type, c.budget, c.budget_period) as budget
    from public.customers c,
         unnest(regexp_split_to_array(coalesce(c.location, ''), '\s*[,،]\s*')) as x
    where c.office_id = p_office
      and c.created_at > now() - make_interval(days => p_days)
      and coalesce(c.deal_type, '') <> 'عرض عقار'
      and public.ar_norm(x) <> ''
  ),
  dem as (
    select k, min(label) as label, deal, ptype, count(*)::int as demand,
           (percentile_cont(0.5) within group (order by budget))::numeric as budget
    from asked group by k, deal, ptype
  ),
  sup as (
    select public.ar_norm(p.district) as k,
           case when p.deal_type = 'بيع' then 'شراء' else p.deal_type end as deal,
           p.property_type as ptype, p.price
    from public.v_listable_properties p where p.office_id = p_office
  ),
  res as (
    select d.label, d.deal, d.ptype, d.demand, round(d.budget) as budget,
      (select count(*)::int from sup s where s.k = d.k
         and (d.deal is null or s.deal = d.deal) and (d.ptype is null or s.ptype = d.ptype)) as supply,
      (select count(*)::int from sup s where s.k = d.k
         and (d.deal is null or s.deal = d.deal) and (d.ptype is null or s.ptype = d.ptype)
         and (d.budget is null or s.price <= d.budget * 1.1)) as supply_fit
    from dem d
  )
  select label, deal, ptype, demand, budget, supply, supply_fit
  from res
  order by (demand - supply_fit) desc, demand desc
  limit 8;
$function$;

revoke all on function public.demand_gap_v2(uuid, integer) from public, anon, authenticated;
grant execute on function public.demand_gap_v2(uuid, integer) to service_role;
