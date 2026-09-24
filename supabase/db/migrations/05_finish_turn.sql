-- ٢٤ سبتمبر ٢٠٢٦ — لا تضيع رسالة تصل أثناء الرد على ما قبلها (C1 في تقرير المراجعة)
-- finish_processing كانت تمسح المخزن كاملاً، فتضيع أي رسالة وصلت أثناء تفكير الذكاء.
-- finish_turn تمسح النص الذي عولج فقط، وتعيد ما وصل بعده ليرد عليه نفس المعالج في دورة تالية.
create or replace function public.finish_turn(p_customer uuid, p_consumed text)
returns text
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_buf  text;
  v_left text;
begin
  select buffer into v_buf from customers where id = p_customer for update;
  if not found then
    return '';
  end if;

  if coalesce(p_consumed, '') = '' then
    v_left := v_buf;                                             -- لم يُعالج شيء: ما في المخزن كله للدورة التالية
  elsif v_buf = p_consumed then
    v_left := '';                                                -- عولج كل شيء
  elsif starts_with(v_buf, p_consumed || E'\n') then
    v_left := substr(v_buf, char_length(p_consumed) + 2);        -- عولج الأول، والباقي وصل أثناء المعالجة
  else
    return '';                                                   -- عالجه معالج آخر: لا نلمس المخزن ولا القفل
  end if;

  update customers
     set buffer       = v_left,
         locked_until = case when v_left <> '' then now() + interval '90 seconds' else null end
   where id = p_customer;

  return v_left;
end
$function$;

revoke all on function public.finish_turn(uuid, text) from public, anon, authenticated;
grant execute on function public.finish_turn(uuid, text) to service_role;
