-- ===== نتيجة الاتصال وسبب التسليم =====
alter table public.customers
  add column if not exists handoff_reason   text,
  add column if not exists handed_at        timestamptz,
  add column if not exists outcome          text,
  add column if not exists outcome_at       timestamptz,
  add column if not exists first_outcome_at timestamptz,
  add column if not exists outcome_by       uuid references public.staff(id) on delete set null;

alter table public.customers
  add constraint customers_outcome_chk check (
    outcome is null or outcome in ('no_answer','contacted','viewing','deal','lost')),
  add constraint customers_handoff_chk check (
    handoff_reason is null or handoff_reason in ('qualified','human','quota','owner_offer','ai_error','taken'));

create index if not exists customers_office_handed_idx  on public.customers (office_id, handed_at);
create index if not exists customers_office_outcome_idx on public.customers (office_id, outcome_at);
create index if not exists messages_office_created_idx  on public.messages (office_id, created_at);

-- العملاء المؤهلون المسلَّمون قبل هذا التحديث
update public.customers
   set handoff_reason = 'qualified',
       handed_at = coalesce(manual_pinged_at, last_message_at, created_at)
 where status = 'qualified' and mode = 'manual' and handoff_reason is null;

-- ===== الاستهلاك اليومي لكل مكتب (أرقام فقط، بلا أي بيانات شخصية) =====
create table if not exists public.usage_daily (
  office_id        uuid    not null references public.offices(id) on delete cascade,
  day              date    not null,
  ai_calls         integer not null default 0,
  ai_in_tokens     bigint  not null default 0,
  ai_cached_tokens bigint  not null default 0,
  ai_out_tokens    bigint  not null default 0,
  ai_errors        integer not null default 0,
  wa_out           integer not null default 0,
  wa_failed        integer not null default 0,
  otp_platform     integer not null default 0,
  otp_office       integer not null default 0,
  primary key (office_id, day)
);
alter table public.usage_daily enable row level security;
revoke all on public.usage_daily from anon, authenticated;

create or replace function public.bump_usage(
  p_office uuid,
  p_ai_calls int default 0, p_in bigint default 0, p_cached bigint default 0, p_out bigint default 0,
  p_ai_errors int default 0, p_wa_out int default 0, p_wa_failed int default 0,
  p_otp_platform int default 0, p_otp_office int default 0)
returns void
language sql
set search_path = public, pg_temp
as $$
  insert into public.usage_daily as u
    (office_id, day, ai_calls, ai_in_tokens, ai_cached_tokens, ai_out_tokens, ai_errors,
     wa_out, wa_failed, otp_platform, otp_office)
  values
    (p_office, (now() at time zone 'Asia/Riyadh')::date, p_ai_calls, p_in, p_cached, p_out, p_ai_errors,
     p_wa_out, p_wa_failed, p_otp_platform, p_otp_office)
  on conflict (office_id, day) do update set
    ai_calls         = u.ai_calls         + excluded.ai_calls,
    ai_in_tokens     = u.ai_in_tokens     + excluded.ai_in_tokens,
    ai_cached_tokens = u.ai_cached_tokens + excluded.ai_cached_tokens,
    ai_out_tokens    = u.ai_out_tokens    + excluded.ai_out_tokens,
    ai_errors        = u.ai_errors        + excluded.ai_errors,
    wa_out           = u.wa_out           + excluded.wa_out,
    wa_failed        = u.wa_failed        + excluded.wa_failed,
    otp_platform     = u.otp_platform     + excluded.otp_platform,
    otp_office       = u.otp_office       + excluded.otp_office;
$$;

-- ===== إحصاءات المكتب لفترة (ملخص الشهر وبطاقة «هذا الشهر») =====
-- «خارج الدوام» = أول رسالة للعميل وصلت بين ١٠ الليل و٩ الصبح بتوقيت الرياض
create or replace function public.office_month_stats(p_office uuid, p_from timestamptz, p_to timestamptz)
returns json
language sql
stable
set search_path = public, pg_temp
as $$
with
cust as (select * from public.customers where office_id = p_office),
new_c as (select * from cust where created_at >= p_from and created_at < p_to),
first_in as (
  select m.customer_id, min(m.created_at) as t_in
    from public.messages m join new_c c on c.id = m.customer_id
   where m.direction = 'in'
   group by m.customer_id),
first_reply as (
  select fi.customer_id, fi.t_in,
         (select min(o.created_at) from public.messages o
           where o.customer_id = fi.customer_id and o.direction = 'out' and o.created_at >= fi.t_in) as t_out
    from first_in fi),
handed as (select * from cust where handed_at >= p_from and handed_at < p_to),
outc as (select * from cust where outcome_at >= p_from and outcome_at < p_to),
areas as (
  select btrim(x) as d
    from new_c, unnest(string_to_array(coalesce(new_c.location, ''), ',')) as x
   where btrim(x) <> '')
select json_build_object(
  'new_customers', (select count(*) from new_c),
  'inbound_msgs',  (select count(*) from public.messages m
                     where m.office_id = p_office and m.direction = 'in'
                       and m.created_at >= p_from and m.created_at < p_to),
  'bot_replies',   (select count(*) from public.messages m
                     where m.office_id = p_office and m.direction = 'out'
                       and m.created_at >= p_from and m.created_at < p_to),
  'first_reply_median_s', (select round(percentile_cont(0.5) within group
                             (order by extract(epoch from (t_out - t_in))))::int
                             from first_reply where t_out is not null),
  'offhours_new',  (select count(*) from first_in
                     where ((t_in at time zone 'Asia/Riyadh')::time >= time '22:00'
                         or (t_in at time zone 'Asia/Riyadh')::time <  time '09:00')),
  'handoffs',      (select coalesce(json_object_agg(r, n), '{}'::json) from
                     (select handoff_reason as r, count(*) as n from handed
                       where handoff_reason is not null group by 1) h),
  'outcomes',      (select coalesce(json_object_agg(o, n), '{}'::json) from
                     (select outcome as o, count(*) as n from outc
                       where outcome is not null group by 1) q),
  'callback_median_s', (select round(percentile_cont(0.5) within group
                          (order by extract(epoch from (first_outcome_at - handed_at))))::int
                          from handed where first_outcome_at is not null and first_outcome_at >= handed_at),
  'waiting_now',   (select count(*) from cust
                     where mode = 'manual' and not coalesce(opted_out, false)
                       and (outcome is null or outcome = 'no_answer')
                       and (handoff_reason in ('qualified','human','quota','owner_offer','ai_error')
                            or (handoff_reason is null and status = 'qualified'))),
  'top_districts', (select coalesce(json_agg(json_build_object('d', d, 'n', n)), '[]'::json) from
                     (select d, count(*) as n from areas group by d order by count(*) desc, d limit 3) t),
  'opted_out',     (select count(*) from cust where opted_out_at >= p_from and opted_out_at < p_to),
  'deleted',       (select count(*) from public.privacy_requests pr
                     where pr.office_id = p_office and pr.kind = 'delete_customer'
                       and pr.created_at >= p_from and pr.created_at < p_to)
);
$$;

-- ===== استهلاك المنصة لكل مكتب (لوحة المشغّل) — التواريخ بتوقيت الرياض، النهاية غير داخلة =====
create or replace function public.platform_usage(p_from date, p_to date)
returns json
language sql
stable
set search_path = public, pg_temp
as $$
with
bounds as (select (p_from::timestamp at time zone 'Asia/Riyadh') as t0,
                  (p_to::timestamp   at time zone 'Asia/Riyadh') as t1),
u as (select office_id,
             sum(ai_calls) ai_calls, sum(ai_in_tokens) ai_in, sum(ai_cached_tokens) ai_cached,
             sum(ai_out_tokens) ai_out, sum(ai_errors) ai_errors, sum(wa_out) wa_out,
             sum(wa_failed) wa_failed, sum(otp_platform) otp_platform, sum(otp_office) otp_office
        from public.usage_daily where day >= p_from and day < p_to group by office_id)
select coalesce(json_agg(r order by r.new_customers desc, r.name), '[]'::json) from (
  select o.id, o.name, o.code, o.active,
         coalesce(u.ai_calls, 0) ai_calls, coalesce(u.ai_in, 0) ai_in, coalesce(u.ai_cached, 0) ai_cached,
         coalesce(u.ai_out, 0) ai_out, coalesce(u.ai_errors, 0) ai_errors,
         coalesce(u.wa_out, 0) wa_out, coalesce(u.wa_failed, 0) wa_failed,
         coalesce(u.otp_platform, 0) otp_platform, coalesce(u.otp_office, 0) otp_office,
         (select count(*) from public.customers c, bounds b
           where c.office_id = o.id and c.created_at >= b.t0 and c.created_at < b.t1) new_customers,
         (select count(*) from public.customers c, bounds b
           where c.office_id = o.id and c.handoff_reason = 'qualified'
             and c.handed_at >= b.t0 and c.handed_at < b.t1) qualified,
         (select count(*) from public.customers c, bounds b
           where c.office_id = o.id and c.outcome = 'deal'
             and c.outcome_at >= b.t0 and c.outcome_at < b.t1) deals,
         (select count(*) from public.messages m, bounds b
           where m.office_id = o.id and m.direction = 'in'
             and m.created_at >= b.t0 and m.created_at < b.t1) inbound,
         (select count(*) from public.events e, bounds b
           where e.office_id = o.id and e.level = 'error'
             and e.created_at >= b.t0 and e.created_at < b.t1) errors,
         (select max(c.last_message_at) from public.customers c where c.office_id = o.id) last_activity
    from public.offices o left join u on u.office_id = o.id
) r;
$$;

-- الدوال تُستدعى من الخادم فقط
revoke execute on function public.bump_usage(uuid,int,bigint,bigint,bigint,int,int,int,int,int) from public, anon, authenticated;
revoke execute on function public.office_month_stats(uuid,timestamptz,timestamptz) from public, anon, authenticated;
revoke execute on function public.platform_usage(date,date) from public, anon, authenticated;
grant execute on function public.bump_usage(uuid,int,bigint,bigint,bigint,int,int,int,int,int) to service_role;
grant execute on function public.office_month_stats(uuid,timestamptz,timestamptz) to service_role;
grant execute on function public.platform_usage(date,date) to service_role;

-- الأسعار التقديرية (دولار) — تُعدَّل من لوحة المشغّل
insert into public.app_secrets (key, value) values
  ('PRICE_AI_IN', '0.15'), ('PRICE_AI_CACHED', '0.075'), ('PRICE_AI_OUT', '0.60'),
  ('PRICE_OTP', '0.018'), ('PRICES_UPDATED', '2026-09-23')
on conflict (key) do nothing;
