-- ٣ أكتوبر ٢٠٢٦ — تأكيد توفّر العقارات: زر «تم تأجيره/تم بيعه» + تذكير أسبوعي + إيقاف تلقائي بعد أسبوعين
-- إضافات فقط: قيمة جديدة «غير مؤكَّد» في حالات العقار + ثلاثة أعمدة في properties + مهمة cron يومية.
--
-- «غير مؤكَّد» حالة منفصلة عن «مؤجّر/مباع/مغلق»: العقار يختفي من البوت (v_listable_properties تقبل 'available' فقط)
-- ويرجعه صاحب المكتب بضغطة «ما زال متاح».
--
-- ترتيب النشر: هذا الملف أولاً ← ثم api ← ثم stock-check (مع notify.ts) ← ثم الواجهة. ثم جرّب login_start حياً.
-- ⚠️ الـcron لا يُفعَّل إلا بعد نشر stock-check؛ وكل عقار موجود يبدأ عدّه من لحظة تطبيق هذا الملف (لا إيقاف فوري).

alter type public.prop_state add value if not exists 'unconfirmed';

alter table public.properties add column if not exists confirmed_at timestamp with time zone not null default now();
alter table public.properties add column if not exists remind_count integer not null default 0;
alter table public.properties add column if not exists remind_sent_at timestamp with time zone;

create index if not exists properties_office_state_conf_idx on public.properties (office_id, state, confirmed_at);

-- يومياً ٩:٣٠ صباحاً بتوقيت الرياض (٦:٣٠ UTC)
select cron.schedule('maqsad-stock-check', '30 6 * * *', 'select public.call_edge(''stock-check'')');
