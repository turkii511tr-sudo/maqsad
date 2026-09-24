# المفاتيح — أسماء فقط، بلا قيم

القيم محفوظة في جدول `public.app_secrets` داخل Supabase (مشروع `maqsad`، منطقة eu-central-1).
**لا تُكتب أي قيمة هنا ولا في أي ملف داخل هذا المستودع.**

| الاسم | الاستخدام | يستخدمه |
| --- | --- | --- |
| `OPENAI_API_KEY` | فهم رسائل العملاء وكتابة الرد | wa-webhook |
| `TELEGRAM_BOT_TOKEN` | تنبيهات تيليجرام وربط المكاتب | كل الدوال + `tg_register()` |
| `WEBHOOK_SECRET` | حماية روابط الاستقبال والجدولة + ملح تشفير الجلسات ورموز الدخول | كل الدوال + `call_edge()` + `mint_magic()` |
| `TOKEN_PEPPER` | موجود وغير مستخدم حالياً (مخطط لفصل تشفير الجلسات عن WEBHOOK_SECRET) | — |
| `VAPID_KEYS` | تشفير إشعارات الجوال (تُولّد تلقائياً أول مرة) | api، wa-webhook، fal-check |
| `PRICE_AI_IN` · `PRICE_AI_CACHED` · `PRICE_AI_OUT` · `PRICE_OTP` · `PRICES_UPDATED` | أسعار تقديرية لحساب تكلفة كل مكتب | monthly-report، api |

مفاتيح مخططة وغير موجودة بعد: `OPERATOR_TG_CHAT` (محادثة المشغّل الخاصة)، `META_VERIFY_TOKEN` و`META_APP_SECRET` (ربط واتساب الرسمي)، `ALLOWED_ORIGINS` (اختياري).

مفاتيح لكل مكتب داخل جدول `offices`: `wa_instance` و`wa_token` (UltraMsg أو ميتا). تُدخل من شاشة المكاتب في التطبيق، لا من هنا.

مفاتيح تضعها Supabase تلقائياً داخل الدوال: `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY`.
