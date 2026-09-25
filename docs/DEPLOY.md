# طريقة النشر

## ١) دوال الخادم (Supabase Edge Functions)

- كل مجلد داخل `supabase/functions/` دالة مستقلة، وملفها الرئيسي `index.ts`.
- الدوال `api` و`wa-webhook` و`fal-check` تحتاج معها `notify.ts` (نسخة من `_shared/notify.ts`).
- كل الدوال تُنشر مع `verify_jwt = false` (الحماية داخل الكود: رابط سري أو توقيع أو جلسة).
- بسطر الأوامر:

```bash
supabase functions deploy wa-webhook --no-verify-jwt --project-ref dindcejhsaxqwdkxtkcy
```

## ٢) قاعدة البيانات

- مشروع جديد من الصفر: شغّل `supabase/db/01_schema.sql` ثم `supabase/db/02_functions_jobs.sql`.
- بعدها أضف قيم المفاتيح في جدول `app_secrets` (انظر `docs/SECRETS.md`) ثم شغّل `select public.tg_register();` لربط بوت تيليجرام.
- أي تغيير لاحق: ملف جديد في `supabase/db/migrations/` + تحديث الملفين أعلاه.

## ٣) تطبيق المكاتب (app/)

الواجهة تُحفظ في جدول `app_sources` (ثلاثة ملفات: `src/index.html` و`src/app.css` و`src/app.js`)، ثم تُجمّع:

```sql
select * from public.build_app();   -- يعيد الحجم وmd5 للنسخة المنشورة
```

الأداة `tools/deploy/mkpatch.py` تولّد SQL يحدّث الملفات مع حارس md5 (لا يكتب فوق نسخة لم تكن متوقعة).
دالة `app` تقدّم الواجهة، وغلاف `pwa/` يحمّلها ويحفظها في الجهاز.

## ٤) غلاف التطبيق (pwa/) والموقع (site/)

- `pwa/` يُرفع كما هو إلى موقع Netlify الخاص بالتطبيق (maqsad-sa.netlify.app).
- الموقع: `python3 site/build.py` يولّد المجلد `site/dist/`، ثم يُرفع إلى Netlify الخاص بـ maqsadapp.com.
- مسار `/gf/*` في الموقع يمرّر ملفات الخطوط إلى fonts.gstatic.com (معرّف داخل build.py).

## ٥) بعد أي نشر

1. شغّل الاختبارات.
2. التزم (commit) بالتغيير في هذا المستودع مع وصف قصير.
3. تأكد من أن رقم نسخة الدالة ارتفع وأن md5 الواجهة يطابق الملفات.

## ٦) دوال متوقفة تنتظر الحذف من لوحة Supabase

هذه الدوال لم تعد مستخدمة. أُوقفت (ترد 410، وأي طلب بلا توكن يُرفض قبل تشغيلها)، وأصلها محفوظ في `archive/retired-functions/`.
أداة النشر المتاحة لا تحذف الدوال، فاحذفها من لوحة Supabase ← Edge Functions عند الفرصة:

| الدالة | كانت تفعل | أُوقفت |
| --- | --- | --- |
| `fontkit` | أداة خطوط مؤقتة لصور الموقع | ٢٤ سبتمبر ٢٠٢٦ |
| `util-fontcss` | أداة خطوط قديمة | قبل ٢٤ سبتمبر ٢٠٢٦ |
| `publish` | نشر نسخة من الواجهة في مخزن `site` العام | ٢٥ سبتمبر ٢٠٢٦ (والمخزن صار خاصاً) |
| `selfcheck` | فحص الواجهة الأولى | ٢٥ سبتمبر ٢٠٢٦ |
