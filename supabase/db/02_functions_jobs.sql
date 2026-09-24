-- ===== extensions =====

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;

-- ===== views =====

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
    created_at
   FROM properties
  WHERE state = 'available'::prop_state AND ad_license_no IS NOT NULL AND btrim(ad_license_no) <> ''::text AND ad_license_expiry IS NOT NULL AND ad_license_expiry >= CURRENT_DATE;

-- ===== functions =====

CREATE OR REPLACE FUNCTION public.build_app()
 RETURNS TABLE(bytes integer, md5 text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare shell text; css text; js text; out text;
begin
  select content into shell from app_sources where path = 'src/index.html';
  select content into css   from app_sources where path = 'src/app.css';
  select content into js    from app_sources where path = 'src/app.js';
  if shell is null or css is null or js is null then
    raise exception 'مصدر ناقص: تأكد من وجود الملفات الثلاثة في app_sources';
  end if;

  out := replace(shell, '/*__CSS__*/',
         '/*==MAQSAD:CSS:START==*/' || E'\n' || css || E'\n' || '/*==MAQSAD:CSS:END==*/');
  out := replace(out,  '/*__JS__*/',
         '/*==MAQSAD:JS:START==*/'  || E'\n' || js  || E'\n' || '/*==MAQSAD:JS:END==*/');

  if position('/*__CSS__*/' in out) > 0 or position('/*__JS__*/' in out) > 0 then
    raise exception 'لم تُستبدل كل العلامات';
  end if;

  insert into app_pages (slug, html) values ('app', out)
  on conflict (slug) do update set html = excluded.html;

  return query select octet_length(out), md5(out);
end $function$
;
CREATE OR REPLACE FUNCTION public.bump_usage(p_office uuid, p_ai_calls integer DEFAULT 0, p_in bigint DEFAULT 0, p_cached bigint DEFAULT 0, p_out bigint DEFAULT 0, p_ai_errors integer DEFAULT 0, p_wa_out integer DEFAULT 0, p_wa_failed integer DEFAULT 0, p_otp_platform integer DEFAULT 0, p_otp_office integer DEFAULT 0)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.call_edge(fn text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'pg_temp'
AS $function$
declare rid bigint; sec text;
begin
  select value into sec from public.app_secrets where key = 'WEBHOOK_SECRET';
  select net.http_post(
    url := 'https://dindcejhsaxqwdkxtkcy.supabase.co/functions/v1/' || fn || '?forceFunctionRegion=eu-central-1&k=' || sec,
    body := payload,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 55000
  ) into rid;
  return rid;
end $function$
;
CREATE OR REPLACE FUNCTION public.demand_gap(p_office uuid, p_days integer DEFAULT 30)
 RETURNS TABLE(district text, demand integer, supply integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with asked as (
    select btrim(x) as district
    from customers c, unnest(string_to_array(coalesce(c.location,''), ',')) as x
    where c.office_id = p_office
      and c.created_at > now() - make_interval(days => p_days)
      and btrim(x) <> ''
  ),
  dem as (select district, count(*)::int as demand from asked group by 1),
  sup as (select district, count(*)::int as supply
            from v_listable_properties where office_id = p_office group by 1)
  select coalesce(dem.district, sup.district),
         coalesce(dem.demand, 0), coalesce(sup.supply, 0)
  from dem full outer join sup on dem.district = sup.district
  where coalesce(dem.district, sup.district) is not null
  order by coalesce(dem.demand,0) desc, coalesce(sup.supply,0) asc
  limit 8;
$function$
;
CREATE OR REPLACE FUNCTION public.finish_processing(p_customer uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
  update customers set buffer = '', locked_until = null where id = p_customer;
$function$
;
CREATE OR REPLACE FUNCTION public.housekeeping()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  delete from net._http_response where created < now() - interval '2 days';
end $function$
;
CREATE OR REPLACE FUNCTION public.ingest_message(p_office uuid, p_wa_id text, p_phone text, p_name text, p_msg_id text, p_body text, p_lock_sec integer DEFAULT 90)
 RETURNS TABLE(customer_id uuid, owns_lock boolean, is_duplicate boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id  uuid;
  v_dup boolean;
  v_got uuid;
begin
  insert into customers (office_id, wa_id, phone, name)
  values (p_office, p_wa_id, p_phone, nullif(p_name,''))
  on conflict (office_id, wa_id) do update
    set name = coalesce(nullif(excluded.name,''), customers.name)
  returning id into v_id;

  select p_msg_id = any(recent_ids) into v_dup from customers where id = v_id;
  if v_dup then
    return query select v_id, false, true;
    return;
  end if;

  update customers
     set buffer          = case when buffer = '' then p_body else buffer || E'\n' || p_body end,
         recent_ids      = (array[p_msg_id] || recent_ids)[1:20],
         last_message_at = now()
   where id = v_id;

  -- القفل ينجح فقط إن لم يكن مقفولاً أو انتهت مهلته
  update customers
     set locked_until = now() + make_interval(secs => p_lock_sec)
   where id = v_id
     and (locked_until is null or locked_until < now())
  returning id into v_got;

  return query select v_id, v_got is not null, false;
end $function$
;
CREATE OR REPLACE FUNCTION public.match_properties(p_office uuid, p_deal text, p_type text, p_districts text[], p_budget numeric, p_rooms integer, p_limit integer DEFAULT 3)
 RETURNS TABLE(id uuid, title text, district text, price numeric, rooms integer, ad_license_no text, ad_license_expiry date, images text[], score integer, grade text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with scored as (
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
               when p_budget is null then 20
               when p.price <= p_budget             then 30
               when p.price <= p_budget * 1.15      then 18
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
    from v_listable_properties p
    where p.office_id = p_office
      and (p_deal   is null or p.deal_type = p_deal)
      and (p_type   is null or p.property_type = p_type)
      and (p_budget is null or p.price between p_budget * 0.5 and p_budget * 1.15)
  )
  select id, title, district, price, rooms, ad_license_no, ad_license_expiry, images, score,
         case when score >= 85 then 'تطابق تام'
              when score >= 70 then 'تطابق قوي'
              else 'بديل جيد' end
  from scored
  where score >= 50
  order by score desc, price asc
  limit greatest(p_limit, 1);
$function$
;
CREATE OR REPLACE FUNCTION public.mint_magic(p_staff uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare tok text; sec text;
begin
  select value into sec from public.app_secrets where key = 'WEBHOOK_SECRET';
  tok := 'm' || replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.sessions (token_hash, staff_id, expires_at, kind)
  values (encode(digest(tok || '|' || sec, 'sha256'),'hex'),
          p_staff, now() + interval '15 minutes', 'magic');
  return 'https://maqsad-sa.netlify.app/?t=' || tok;
end $function$
;
CREATE OR REPLACE FUNCTION public.office_month_stats(p_office uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.office_summary(p_office uuid, p_days integer DEFAULT 30)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select json_build_object(
    'customers',   (select count(*) from customers where office_id=p_office
                      and created_at > now() - make_interval(days=>p_days)),
    'qualified',   (select count(*) from customers where office_id=p_office
                      and status='qualified' and created_at > now() - make_interval(days=>p_days)),
    'handed_over', (select count(*) from customers where office_id=p_office
                      and mode='manual' and created_at > now() - make_interval(days=>p_days)),
    'messages',    (select count(*) from messages where office_id=p_office
                      and created_at > now() - make_interval(days=>p_days)),
    'listable',    (select count(*) from v_listable_properties where office_id=p_office),
    'blocked',     (select count(*) from properties where office_id=p_office and state='available'
                      and (ad_license_no is null or btrim(ad_license_no)=''
                           or ad_license_expiry is null or ad_license_expiry < current_date))
  );
$function$
;
CREATE OR REPLACE FUNCTION public.platform_usage(p_from date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.tg_register()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'pg_temp'
AS $function$
declare tok text; sec text; rid bigint;
begin
  select value into tok from public.app_secrets where key = 'TELEGRAM_BOT_TOKEN';
  select value into sec from public.app_secrets where key = 'WEBHOOK_SECRET';
  if tok is null or position(':' in tok) = 0 then
    raise exception 'توكن بوت تيليجرام غير مضبوط';
  end if;
  select net.http_post(
    url := 'https://api.telegram.org/bot' || tok || '/setWebhook',
    body := jsonb_build_object(
      'url', 'https://dindcejhsaxqwdkxtkcy.supabase.co/functions/v1/tg?k=' || sec,
      'allowed_updates', jsonb_build_array('message'),
      'drop_pending_updates', true),
    headers := '{"Content-Type":"application/json"}'::jsonb
  ) into rid;
  return rid;
end $function$
;

-- ===== function privileges =====

grant execute on function build_app() to service_role;
grant execute on function bump_usage(uuid,integer,bigint,bigint,bigint,integer,integer,integer,integer,integer) to service_role;
grant execute on function call_edge(text,jsonb) to service_role;
grant execute on function demand_gap(uuid,integer) to public;
grant execute on function demand_gap(uuid,integer) to service_role;
grant execute on function finish_processing(uuid) to public;
grant execute on function finish_processing(uuid) to service_role;
grant execute on function housekeeping() to service_role;
grant execute on function ingest_message(uuid,text,text,text,text,text,integer) to public;
grant execute on function ingest_message(uuid,text,text,text,text,text,integer) to service_role;
grant execute on function match_properties(uuid,text,text,text[],numeric,integer,integer) to public;
grant execute on function match_properties(uuid,text,text,text[],numeric,integer,integer) to service_role;
grant execute on function mint_magic(uuid) to service_role;
grant execute on function office_month_stats(uuid,timestamp with time zone,timestamp with time zone) to service_role;
grant execute on function office_summary(uuid,integer) to public;
grant execute on function office_summary(uuid,integer) to service_role;
grant execute on function platform_usage(date,date) to service_role;
grant execute on function tg_register() to service_role;
revoke all on function build_app() from public;
revoke all on function bump_usage(uuid,integer,bigint,bigint,bigint,integer,integer,integer,integer,integer) from public;
revoke all on function call_edge(text,jsonb) from public;
revoke all on function housekeeping() from public;
revoke all on function mint_magic(uuid) from public;
revoke all on function office_month_stats(uuid,timestamp with time zone,timestamp with time zone) from public;
revoke all on function platform_usage(date,date) from public;
revoke all on function tg_register() from public;

-- ===== cron jobs =====

select cron.schedule('maqsad-backup-daily', '0 0 * * *', 'select public.call_edge(''backup'')');
select cron.schedule('maqsad-fal-check', '0 6 * * *', 'select public.call_edge(''fal-check'')');
select cron.schedule('maqsad-housekeeping', '30 0 * * *', 'select public.housekeeping()');
select cron.schedule('maqsad-monthly-report', '0 5 1 * *', 'select public.call_edge(''monthly-report'')');
select cron.schedule('maqsad-warm', '*/4 * * * *', '
  select net.http_post(
    url := ''https://dindcejhsaxqwdkxtkcy.supabase.co/functions/v1/api?forceFunctionRegion=eu-central-1'',
    body := ''{"action":"ping"}''::jsonb,
    headers := ''{"Content-Type":"application/json"}''::jsonb,
    timeout_milliseconds := 8000);
  select net.http_get(
    url := ''https://dindcejhsaxqwdkxtkcy.supabase.co/functions/v1/wa-webhook?forceFunctionRegion=eu-central-1&k=warm'',
    timeout_milliseconds := 8000);
');

-- ===== storage buckets =====

insert into storage.buckets (id, name, public) values ('backups', 'backups', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('fal-proofs', 'fal-proofs', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('site', 'site', true) on conflict (id) do nothing;
