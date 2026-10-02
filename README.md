# مقصد — المصدر الكامل

هذا المستودع هو **النسخة الأصلية الوحيدة** لكل كود منصة مقصد. أي تعديل يبدأ من هنا، ثم يُنشر.
آخر مطابقة مع الإنتاج: ٢٤ سبتمبر ٢٠٢٦.

## ماذا يحتوي

| المجلد | ما هو | أين يعمل |
| --- | --- | --- |
| `supabase/functions/` | الخادم: ١٠ دوال (واتساب، التطبيق، تيليجرام، النماذج، التذكيرات، النسخ الاحتياطي…) | Supabase Edge Functions |
| `supabase/db/01_schema.sql` | الجداول والقيود والفهارس والصلاحيات — مطابقة حرفياً للقاعدة الحية (تحقق md5) | Supabase Postgres |
| `supabase/db/02_functions_jobs.sql` | دوال القاعدة، العرض، المهام المجدولة، ومخازن الملفات — مطابقة للقاعدة الحية | Supabase Postgres |
| `supabase/db/migrations/` | ملفات التغييرات الأصلية (للتاريخ فقط) | — |
| `supabase/tests/` | اختبارات الخادم الآلية | جهاز المطوّر |
| `app/` | تطبيق المكاتب (واجهة واحدة: HTML + CSS + JS) — مطابق للنسخة الحية (تحقق md5) | يُحفظ في جدول `app_sources` وتقدّمه دالة `app` |
| `pwa/` | غلاف التطبيق القابل للتثبيت على الجوال + عامل الإشعارات `sw.js` | Netlify (maqsad-sa.netlify.app) |
| `site/` | موقع maqsadapp.com (مولّد صفحات ثابتة بلغة Python) | Netlify |
| `tools/deploy/` | أداة نشر واجهة التطبيق عبر SQL | — |
| `docs/` | المفاتيح (أسماء فقط) وطريقة النشر | — |
| `archive/` | أصل دوال قديمة أُوقفت (للرجوع فقط، لا تُنشر) | — |

## قواعد لا تُكسر

1. **لا مفاتيح ولا كلمات مرور داخل هذا المستودع أبداً.** كل المفاتيح في جدول `app_secrets` داخل Supabase. القائمة (أسماء فقط) في `docs/SECRETS.md`.
2. الملف `supabase/functions/_shared/notify.ts` هو الأصل؛ النسخ داخل `api/` و`wa-webhook/` و`fal-check/` يجب أن تبقى مطابقة له.
3. كل تغيير = التزام (commit) هنا أولاً، ثم نشر. إذا اختلف الإنتاج عن هذا المستودع فالمستودع هو الذي يُصحَّح أولاً.

## الاختبارات

تحتاج: Node 18 أو أحدث، Python 3، و`npm i -g typescript playwright`.

```bash
node supabase/tests/api.test.mjs      # وكذلك wa / wa_sales / push / fal / backup / report / site / tg / login
python3 app/build.py && node app/tests/test5.js   # واجهة التطبيق (Playwright)
python3 site/build.py && node site/test/site.test.js
```

## النشر

التفاصيل خطوة بخطوة في `docs/DEPLOY.md`.
