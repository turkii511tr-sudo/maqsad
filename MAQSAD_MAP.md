# خريطة مشروع مقصد — MAQSAD_MAP

آخر تحقق: 5b1e24c (+ تغييرات تدقيق المنتج) — 2026-10-02

خريطة ملاحة لـ Claude Code: من أين تبدأ، وما الذي تفتحه، وما الذي لا تحتاج أن تفتحه.
المراجع بالاسم (ملف + دالة/جدول/action)، بلا أرقام أسطر. الكود الفعلي هو الحكم دائماً.

---

## 1. HOW TO USE THIS MAP

1. **حدّد الفرع**: من كلمات المهمة استخدم القاموس (القسم 2) لتعرف الفرع (القسم 3).
2. **ابدأ من نقطة الدخول** المذكورة للفرع (ملف + دالة أو `action`).
3. **تتبّع الاعتماديات المرتبطة بالمشكلة فقط**: الدوال التي تستدعيها نقطة الدخول، والجداول ودوال SQL المذكورة.
4. **توسّع عند سبب تقني فقط**: انتقل لفرع آخر حين يذكره سطر "متى تنتقل"، أو حين يستدعي الكود شيئاً خارج الفرع.
5. **لا فحص كامل بلا حاجة**: `app/src/app.js` (نحو 3200 سطر) و`api/index.ts` و`wa-webhook/index.ts` كبيرة؛ ابحث بـ grep عن اسم الدالة أو `case "..."` بدل القراءة من أولها.
6. **الكود الفعلي هو الحكم**: إن خالفت الخريطةُ الكودَ فالكود هو الصحيح؛ صحّح الخريطة في نفس الـ commit.

---

## 2. قاموس صاحب المشروع

| الكلمة | الفرع | الملف / المكان المسؤول |
| --- | --- | --- |
| العميل / الطلب / المحادثة | B1 محرك واتساب، B3 شاشة العملاء | `wa-webhook/index.ts` (`processIncoming`, `processTurn`) · جدول `customers`, `messages` · `app.js` (`renderLeads`, `openLead`) |
| العميل المؤهل / ينتظر اتصالك | B1، B3 | `wa-webhook/index.ts` (`handoff`) · `app.js` (`isQualified`, `needsCall`, `renderToday`) |
| تصحيح بيانات العميل / حذف العميل | B3 | `api` actions `lead_update`, `lead_delete` · `app.js` (`openLeadEdit`, `askLeadDelete`) |
| الميزانية الغامضة («45») / حد الحماية / محادثة ما تتقدم | B1 | `wa` (`budgetDoubt`, `DAILY_REPLY_CAP`, `STUCK_TURNS`) · عمود `customers.stale_turns` |
| المدينة | B1، B5 | `properties.city` · `customers.city` · `wa` (`cityList`, `inventoryText`) · SQL `match_properties_v2`, `ar_norm` |
| نتيجة الاتصال | B3 | `api` action `lead_outcome` · `app.js` (`outcomeNote`, `outcomeTag`) |
| الوضع اليدوي / التدخل | B1، B3 | `api` action `set_mode` · عمود `customers.mode` |
| إيقاف الرسائل / «ابدأ» | B1 | `wa-webhook/index.ts` (`commandOf`) · `customers.opted_out` |
| المكتب / حالة المكتب / يحتاج إجراء | B4 إدارة المكاتب | جدول `offices` · `api` actions `office_save`, `offices_list` (`wa_linked`) · `app.js` (`officeStatus`, `renderOffices`, `openOffice`) |
| العقار / المخزون | B5 العقارات والمطابقة | جدول `properties` · `api` actions `properties`, `property_save` · `app.js` (`renderStock`, `openProp`, `openPropWizard`) |
| الإعلان / ترخيص الإعلان | B5 | `properties.ad_license_no`, `ad_license_expiry` · view `v_listable_properties` · `api` (`decorate`) |
| المطابقة / عقارات مناسبة | B5 | SQL `match_properties`, `match_customers`, `annual_budget` · `api` action `prop_matches` |
| رخصة فال | B6 رخصة فال | `offices.fal_*` · `api` (`falInfo`, `fal_verify`, `fal_reject`…) · `wa-webhook` (`falState`) · `fal-check/index.ts` |
| الموظف / صاحب المكتب / المدير | B7 الموظفون والصلاحيات | جدول `staff` (role: `super_admin`, `owner`, `agent`) · `api` actions `staff_*` · `app.js` (`staffPanel`) |
| الدخول / البصمة / رمز الدخول | B2 الدخول | `api` (`login_start`, `login_poll`, `pk_*`, `verify_otp`, `staff_code`) · `wa-webhook` (`handleLogin`) · `app.js` (`startWaLogin`, `pkLogin`) |
| التقرير / ملخص الشهر / الأداء | B9 التقارير | `monthly-report/index.ts` · SQL `office_month_stats`, `platform_usage`, `office_summary`, `demand_gap` · `app.js` (`renderMonth`, `loadGap`, `renderUsage`) |
| الإشعار / التنبيه | B8 التنبيهات | `_shared/notify.ts` (`alertOffice`, `pushOffice`, `telegramSend`) · `pwa/sw.js` · `app.js` (`renderNotify`, `nt*`) |
| تيليجرام | B8 | `tg/index.ts` · `api` actions `tg_link`, `tg_status`, `tg_unlink`, `tg_test` |
| طلب الانضمام / التسجيل | B10 الموقع ونماذجه | `join/index.ts` · جدول `signup_requests` · `app.js` (`openSignup`, `renderSignups`) |
| راسلنا | B10 | `contact/index.ts` · جدول `contact_messages` |
| الشروط / الخصوصية / حذف الحساب | B11 الخصوصية | `api` (`TERMS_VERSION`, `terms_accept`, `delete_account_request`, `export`) · SQL `housekeeping` · `site/src/pages/privacy.html`, `terms.html` |
| النسخة الاحتياطية | B12 النسخ الاحتياطي | `backup/index.ts` · جدول `backup_runs` · مخزن `backups` |
| الذكاء الاصطناعي / الرد الآلي | B1 | `wa-webhook` (`systemPrompt`, `askAI`, `callModel`, `maskText`) · مفاتيح `AI_MODEL`, `OPENAI_API_KEY` |
| الرسائل الصوتية | B1 | `wa-webhook` (`handleVoice`, `transcribe`, `voiceEnabled`) · مفتاح `VOICE_OFFICES` |
| التطبيق على الجوال | B13 الواجهة والنشر | `pwa/` · `supabase/functions/app/index.ts` · جدول `app_pages` |
| الموقع maqsadapp.com | B10 | `site/` |
| المفاتيح / الأسرار | مشترك | جدول `app_secrets` · `docs/SECRETS.md` |

---

## 3. BRANCHES

ثلاثة عشر فرعاً مكتشفة من الكود. `api` = `supabase/functions/api/index.ts`، `wa` = `supabase/functions/wa-webhook/index.ts`، `app.js` = `app/src/app.js`.

### B1 — محرك واتساب (تأهيل العملاء)
- **الوظيفة**: يستقبل رسائل العملاء، يفهمها بالذكاء الاصطناعي، يرد، ويسلّم العميل المؤهل للمكتب.
- **نقطة الدخول**: `wa` → `Deno.serve` (GET = تحقق ميتا، POST بتوقيع `x-hub-signature-256` = ميتا عبر `handleMeta`، POST بـ `?k=` = UltraMsg).
- **الدوال الأساسية**: `handleMeta`, `cloudOffice`, `processIncoming`, `processTurn`, `commandOf`, `askAI`, `callModel`, `systemPrompt`, `aiUserPrompt`, `recentHistory`, `officeInventory`/`inventoryText`/`cityList`, `budgetDoubt`/`bareNumbers`, `matchProperties`, `saveCustomer`, `maskText`/`unmask`/`unmaskAI`, `nextQuestion`, `formatProperties`, `handoff`, `sendWhatsApp`, `notifyOffice`, `handleVoice`, `mediaNudge`, `metaSignatureOk`.
- **التسليم للوسيط** (v5.2) بحالة الطلب لا بعدد الرسائل: اكتمال الطلب (`qualified`) · كلمة موظف أو حكم الذكاء (`human`) · طلب معاينة (`human`، route `viewing_handoff`) · مالك يعرض (`owner_offer`) · تعذّر الذكاء (`ai_error`) · حماية فقط (`quota`): `STUCK_TURNS` ردود بلا معلومة جديدة، أو `max(msg_quota, DAILY_REPLY_CAP)` رداً آلياً خلال ٢٤ ساعة. العميل الراجع بطلب مكتمل (`handed_at` + `qualified`) يُسأل «نفس طلبك السابق؟» ولا يُسلّم إلا إذا أكد (`same_request`) أو غيّر. عميل مُسلّم بلا نتيجة اتصال (أو «ما رد») لأكثر من `REOPEN_DAYS` (٣) يرجع للمساعد إذا راسل، مع تنبيه المكتب (حدث `handoff_reopened`)؛ ما يشمل «taken» ولا من سُجّل له تواصل.
- **ما يصل للذكاء**: السياق المسجل + آخر ٨ رسائل (`recentHistory`) + مخزون المكتب المرخّص كأحياء ونطاق أسعار (`v_listable_properties`، فقط إذا فال سارية) + نطاق المدن. كل ذلك يمر بالإخفاء.
- **الجداول / SQL**: `customers`, `messages`, `events`, `offices`, `staff`, `privacy_requests`, view `v_listable_properties` · `ingest_message`, `finish_turn`, `finish_processing`, `match_properties_v2` (ويرجع لـ `match_properties` إذا ما انشرت migration 10), `bump_usage`.
- **تكاملات**: Meta Graph API، UltraMsg (انتقالي)، OpenAI (فهم + تحويل صوت).
- **يعتمد على**: B5 (المطابقة)، B6 (`falState`)، B8 (`notify.ts`)، B2 (`handleLogin` لرسائل الدخول).
- **متى تنتقل**: رسالة «دخول مقصد» ← B2 · عرض العقارات ← B5 · تنبيه المكتب ← B8 · حجب بسبب فال ← B6.
- **الاختبار**: `node supabase/tests/wa.test.mjs` · سلوك المبيعات (الميزانية، المخزون، المدينة، العميل الراجع، التسليم): `node supabase/tests/wa_sales.test.mjs` · جودة الإخفاء: `docs/PRIVACY_EVAL.md` (يدوي حي).
- **النشر**: `supabase functions deploy wa-webhook --no-verify-jwt` مع `notify.ts`، ثم `get_edge_function` ومطابقة حرفية.
- **الخطورة**: **عالية** — يرد على عملاء حقيقيين، ويرسل بيانات للذكاء الاصطناعي (الإخفاء إلزامي)، وأي عطل يوقف عمل كل المكاتب.

### B2 — الدخول والجلسات
- **الوظيفة**: دخول الموظف برسالة واتساب يرسلها بنفسه، أو بالبصمة، أو برمز احتياطي؛ وإدارة الجلسات.
- **نقطة الدخول**: `api` → `handle` → actions العامة: `login_start`, `login_poll`, `pk_login_options`, `pk_login_verify`, `verify_otp`, `redeem`, `admin_tg_code`؛ وفي `wa` → `isLoginMsg` ثم `handleLogin` (ومن رقم المنصة `handlePlatform`).
- **الدوال الأساسية**: `api`: `session`, `newSession`, `loginChannel`, `issueCode`, `audit`, `rpFor`, `clientData`, `parseAuthData`, `verifySig`, `cbor`, `coseToJwk` · actions: `pk_reg_options`, `pk_reg_verify`, `pk_list`, `pk_delete`, `staff_code`, `logout` · `app.js`: `startWaLogin`, `pollLogin`, `pkLogin`, `pkEnroll`, `renderPk`, `issueStaffCode`, `afterLogin`, `logout`, `call` (قائمة `PUBLIC_ACTIONS`).
- **الجداول**: `sessions`, `login_requests`, `passkeys`, `auth_challenges`, `otps`, `login_audit`, `staff`, `offices`.
- **تكاملات**: WebAuthn في المتصفح، واتساب (رقم المنصة أو رقم المكتب)، تيليجرام (`admin_tg_code`).
- **يعتمد عليه**: كل actions التطبيق (عبر `session`).
- **الاختبار**: `node supabase/tests/login.test.mjs` · `node app/tests/v15.test.js`.
- **النشر**: `api` و`wa-webhook` معاً غالباً. بعد أي تغيير في القاعدة: جرّب `login_start` حياً (قاعدة CLAUDE.md).
- **الخطورة**: **عالية** — كسره يقفل كل المكاتب خارج التطبيق؛ مفتاح أجنبي زائد بين `staff` و`offices` يكسره (حسب `docs/DEPLOY.md`).

### B3 — شاشة العملاء في التطبيق
- **الوظيفة**: قائمة العملاء وبطاقة العميل، «ينتظر اتصالك»، تسجيل نتيجة الاتصال، الوضع اليدوي/الآلي.
- **نقطة الدخول**: `app.js` → `renderToday`, `renderLeads`, `openLead`, `openLeadEdit`, `askLeadDelete` (الشاشات `s-today`, `s-leads`) ← `api` actions `bootstrap`, `leads`, `lead`, `lead_outcome`, `set_mode`, `lead_update`, `lead_delete` (صاحب المكتب فقط؛ حذف فعلي، الرسائل تُحذف معه، وإثبات في `privacy_requests`).
- **الدوال**: `app.js`: `isQualified`, `needsCall`, `journey`, `handoffOf`, `outcomeNote`, `leadMatches`, `paintAttn`.
- **الجداول**: `customers`, `messages`, `events`.
- **يعتمد على**: B2 (جلسة)، B1 (يملأ البيانات).
- **الاختبار**: `node app/tests/test4.js` · `node app/tests/v16.test.js` · `node supabase/tests/api.test.mjs`.
- **النشر**: الواجهة ← B13؛ الخادم ← `api`.
- **الخطورة**: متوسطة — يعرض بيانات عملاء شخصية؛ الصلاحية بـ `office_id` داخل `api`.

### B4 — إدارة المكاتب (لوحة المشغّل)
- **الوظيفة**: إنشاء/تعديل المكاتب، الدخول لمكتب، سجل تعديلات المدير، إعدادات المنصة.
- **نقطة الدخول**: `app.js` → `renderOffices`, `openOffice`, `switchOffice`, `exitOffice`, `renderPlatform` (الشاشات `s-offices`, `s-platform`) ← `api` actions `offices_list`, `office_save`, `admin_log`, `platform_save`, `save_settings`, `test_whatsapp`, `settings_status`.
- **الدوال**: `api`: `officesFor` (`wa_linked` = معرّف + رمز وصول)، `statusFor`, `logAdmin`, `sendWhatsApp` · `app.js`: `officeStatus` (شغّال / يحتاج إجراء بأسبابه / موقوف؛ الشروط والمزود الانتقالي وقرب انتهاء فال ملاحظات لا توقف)، `officeIssues`, `officeMatches`, `renderSettings`, `saveAi`, `loadAdminLog`.
- **UltraMsg في الواجهة**: خيار المزود مخفي للمكتب الجديد، ويظهر فقط لمكتب مربوط عليه حالياً (حتى لا يتحول بالغلط). الدعم في الخادم باقٍ.
- **الجداول**: `offices`, `staff`, `app_secrets`, `events`.
- **يعتمد على**: B2 (دور `super_admin` = `isSuper`)، B6.
- **الاختبار**: `node app/tests/admin.test.js` · `node app/tests/test3.js` · `api.test.mjs`.
- **الخطورة**: **عالية** — يكتب مفاتيح واتساب المكتب و`app_secrets`، وتغيير `license_no` يعيد فال إلى `pending`.

### B5 — العقارات والمطابقة
- **الوظيفة**: مخزون المكتب، إضافة عقار بخطوات، شرط ترخيص الإعلان، مطابقة العملاء بالعقارات.
- **نقطة الدخول**: `app.js` → `renderStock`, `openProp`, `openPropWizard`, `openPropMatches` (الشاشة `s-stock`) ← `api` actions `properties`, `property_save`, `prop_matches`؛ ومن B1 → `processTurn` ← `match_properties`.
- **الدوال**: `api`: `decorate` (يحسب `listable`/`block_reason`)، `property_save` (المدينة إلزامية للجديد، «بيع» ← «شراء») · `app.js`: `propMatches`, `propCities`, `defaultCity`, `cityOptions`, `matchWaText`, `openMatchesPrompt`.
- **الجداول / SQL**: `properties` · view `v_listable_properties` · `match_properties_v2` (فترة الميزانية + المدينة + «بيع»=«شراء» + تطبيع الحي `ar_norm`)، `match_properties` (قديمة، للنسخة المنشورة)، `match_customers`, `annual_budget`.
- **يعتمد على**: B6 (مكتب بلا فال سارية لا تُعرض عقاراته).
- **الاختبار**: `wa.test.mjs`, `wa_sales.test.mjs` (المطابقة في المحادثة) · `node app/tests/v14.test.js`, `v16.test.js` · `api.test.mjs` · SQL محلياً على Postgres (انظر `docs/DEPLOY.md`).
- **النشر**: SQL ← `supabase/db/migrations/` + تحديث `02_functions_jobs.sql`؛ الواجهة ← B13.
- **الخطورة**: متوسطة — خطأ في الـ view يعرض إعلاناً بلا ترخيص (مخالفة نظامية).

### B6 — رخصة فال
- **الوظيفة**: رفع إثبات الرخصة، تحقق المشغّل واعتمادها أو رفضها، التذكير قبل الانتهاء، حجب المساعد.
- **نقطة الدخول**: `api` actions `fal_get`, `fal_verify`, `fal_reject`, `fal_proof`, `fal_request`, `fal_request_close`, `signup_proof` · `fal-check/index.ts` → `Deno.serve` (يومياً عبر cron) · `wa` → `falState`, `isTester`, `falBlockedNotice`.
- **الدوال**: `api`: `falInfo`, `licenseKey`, `parseImage`, `parseUpload`, `putProof`, `putFile` · `fal-check`: `stageOf`, `daysBetween`, `operatorChat`, `tg` · `app.js`: `falOf`, `falTag`, `falPanel`, `falFiles`, `falItems`, `licenseBlocked`, `openFalRequest`, `renderFalRequest`.
- **الجداول / مخازن**: `offices` (`fal_status`, `fal_expires_on`, `fal_proof_path`, `fal_reminded`…) · `fal_checks` · `events` · مخزن `fal-proofs` (خاص).
- **الاختبار**: `node supabase/tests/fal.test.mjs` · `node app/tests/shot-fal.js`.
- **النشر**: `fal-check` مع `notify.ts`؛ cron `maqsad-fal-check`.
- **الخطورة**: **عالية** — قاعدة حمراء (لا مكتب بلا فال).

### B7 — الموظفون والصلاحيات
- **الوظيفة**: إضافة/تعديل/حذف موظفين، الأدوار، رمز دخول احتياطي.
- **نقطة الدخول**: `app.js` → `staffPanel` ← `api` actions `staff_list`, `staff_save`, `staff_delete`, `staff_code`.
- **الجداول**: `staff`, `sessions`.
- **الأدوار**: قيد `staff_role_chk` في `01_schema.sql`؛ فحص `isSuper`/`isOwner` داخل `handle`.
- **الاختبار**: `node app/tests/test3.js`, `node app/tests/shot-staff.js` · `api.test.mjs`, `login.test.mjs`.
- **الخطورة**: متوسطة — خطأ في فحص الدور = تصعيد صلاحيات.

### B8 — التنبيهات (تيليجرام + إشعارات الجوال)
- **الوظيفة**: تنبيه المكتب بعميل مؤهل أو حدث مهم على القنوات التي اختارها؛ تنبيه المشغّل.
- **نقطة الدخول**: `_shared/notify.ts` → `alertOffice` · `tg/index.ts` → `Deno.serve` (ربط المجموعات بالرمز، و`operatorLink`) · `api` actions `notify_save`, `tg_link`, `tg_status`, `tg_unlink`, `tg_test`, `push_subscribe`, `push_unsubscribe`, `push_test` · `pwa/sw.js` (أحداث `push`, `notificationclick`).
- **الدوال**: `notify.ts`: `pushOffice`, `telegramSend`, `encryptPush`, `vapidGenerate`, `vapidPublic`, `pushFromText`, `PUSH_HOST` · `api`: `ensureVapid`, `notifyInfo`, `tellOffice`, `tellOperator` · `wa`: `notifyOffice` · `app.js`: `renderNotify`, `ntPushEnable`, `ntPushDisable`, `ntTgLink`, `ntTgPoll`, `ntSavePrefs`.
- **الجداول**: `push_subs`, `offices` (`telegram_chat_id`, `notify_telegram`…), `app_secrets` (`VAPID_KEYS`, `OPERATOR_TG_CHAT`, `OPERATOR_LINK_CODE`).
- **SQL**: `tg_register` (ربط webhook البوت).
- **الاختبار**: `node supabase/tests/push.test.mjs` · `node supabase/tests/tg.test.mjs` · `node app/tests/test5.js`.
- **النشر**: أي تعديل في `notify.ts` يُنسخ إلى `api/`, `wa-webhook/`, `fal-check/` ثم تُنشر الثلاث.
- **الخطورة**: متوسطة — فشل التنبيه يعني عميلاً مؤهلاً لا يُتصل به.

### B9 — التقارير والإحصاءات
- **الوظيفة**: ملخص الشهر لكل مكتب وللمشغّل، أداء المكتب، الفرص الضائعة، تكلفة الاستخدام.
- **نقطة الدخول**: `monthly-report/index.ts` → `Deno.serve` (cron `maqsad-monthly-report`) · `api` actions `month_stats`, `analytics`, `platform_usage`.
- **الدوال**: `app.js`: `renderMonth`, `monthHtml`, `loadGap`, `loadUsage`, `renderUsage`, `priceField`.
- **SQL**: `office_month_stats`, `platform_usage`, `office_summary`, `demand_gap`, `bump_usage` · جدول `usage_daily`, `events`.
- **الاختبار**: `node supabase/tests/report.test.mjs` · `node app/tests/test4.js`.
- **الخطورة**: منخفضة — قراءة فقط، لا يمس العملاء.

### B10 — الموقع ونماذجه (الانضمام وراسلنا)
- **الوظيفة**: موقع maqsadapp.com الثابت، ونموذجا الانضمام (مع صورة فال) وراسلنا؛ ومراجعة الطلبات في التطبيق.
- **نقطة الدخول**: `site/build.py` (يولّد `site/dist/`) · `site/src/assets/site.js` (يرسل النماذج إلى `data-endpoint`، والأساس `api_base` في `site/site.config.json`) · `join/index.ts`, `contact/index.ts` → `Deno.serve` · `app.js` → `openSignup` (`JOIN_API`), `loadSignups`, `renderSignups`, `setSignup` ← `api` actions `signup_list`, `signup_update`, `signup_proof`.
- **الجداول / مخازن**: `signup_requests`, `contact_messages`, `events` · مخزن `fal-proofs` (الثابت `BUCKET` في `join`).
- **الصفحات**: `site/src/pages/` (`index`, `contact`, `privacy`, `terms`, `refund`, `404`) + `site/src/partials/`.
- **الاختبار**: `node supabase/tests/site.test.mjs` · `python3 site/build.py && node site/test/site.test.js` · `node app/tests/test2.js`.
- **النشر**: Netlify (maqsad-site) للموقع؛ `join`/`contact` كدوال.
- **الخطورة**: متوسطة — نماذج عامة بلا دخول (حد لكل IP داخل الدالتين).

### B11 — الخصوصية والشروط ومدد الحفظ
- **الوظيفة**: موافقة صاحب المكتب على الشروط، تصدير البيانات، طلب حذف الحساب، حذف تلقائي بعد المدد.
- **نقطة الدخول**: `api` → `TERMS_VERSION`, actions `terms_accept`, `export`, `delete_account_request`, `onboarding_save` · SQL `housekeeping` (cron `maqsad-housekeeping`) · `wa` (طلب حذف العميل → `privacy_requests`، `deleteOk`, `disclosure`).
- **الدوال**: `app.js`: `termsPending`, `openTerms`, `exportData`, `requestDeletion`, `maybeOnboard`, `openOnboard`.
- **الجداول**: `privacy_requests`, `offices` (`terms_version`, `terms_accepted_at`), وكل الجداول التي ينظفها `housekeeping`.
- **مرتبط**: `site/src/pages/privacy.html`, `terms.html`, `site/site.config.json` (`effective_date`), `docs/PRIVACY_EVAL.md`.
- **الاختبار**: `node app/tests/v14.test.js` · `api.test.mjs`.
- **الخطورة**: **عالية** — التزام نظامي؛ تغيير المدد يلزم تحديث صفحة الخصوصية وشاشة الموافقة.

### B12 — النسخ الاحتياطي
- **الوظيفة**: نسخة يومية للجداول في مخزن خاص، تحقق ذاتي، وتنظيف النسخ القديمة.
- **نقطة الدخول**: `backup/index.ts` → `Deno.serve` (cron `maqsad-backup-daily` عبر `call_edge`) · `api` action `backups_status` · `app.js` → `loadBackups`.
- **الدوال**: `dumpTable`, `verify`, `prune`, `notify`, `operatorChat`.
- **الجداول / مخازن**: `backup_runs` · مخزن `backups` (خاص).
- **الاختبار**: `node supabase/tests/backup.test.mjs`.
- **الخطورة**: متوسطة — فشله صامت إن تعطل تنبيه المشغّل.

### B13 — الواجهة: البناء والتقديم والنشر (app + pwa)
- **الوظيفة**: ملف واجهة واحد يُخزن في القاعدة ويُقدَّم عبر دالة `app`، وغلاف PWA يحمّله.
- **نقطة الدخول**: `app/src/index.html` + `app.css` + `app.js` (بدء التشغيل `boot` ثم `load`، والتنقل `show` و`bind`) · `supabase/functions/app/index.ts` (يقرأ `app_pages` slug `app`) · `pwa/index.html` (يجلب `functions/v1/app`) · `pwa/sw.js`.
- **أدوات**: `app/build.py` (بناء محلي للاختبار) · `tools/deploy/mkpatch.py` (SQL بحارس md5) · SQL `build_app` (يجمع `app_sources` في `app_pages`).
- **الجداول**: `app_sources`, `app_sources_hist`, `app_pages`.
- **الشاشات** (`data-screen` في `index.html`): `s-home`, `s-today`, `s-leads`, `s-stock`, `s-offices`, `s-platform`, `s-signups`, `s-set`؛ شاشات المنصة محمية بـ `PLATFORM_SCREENS` في `show`.
- **الاختبار**: `python3 app/build.py && node app/tests/test5.js` (وباقي `app/tests/*.js`).
- **النشر**: `mkpatch.py` ← `select * from public.build_app();` ؛ `pwa/` يُرفع إلى Netlify (maqsad-sa).
- **الخطورة**: متوسطة — خطأ JS يوقف التطبيق لكل المكاتب، لكن الخادم لا يتأثر.

---

## 4. CRITICAL FLOWS

1. **رسالة عميل (ميتا)**: `wa:Deno.serve` → `wa:metaSignatureOk` → `wa:handleMeta` → `wa:cloudOffice` → `wa:processIncoming` → SQL `ingest_message` → `messages` → `wa:processTurn` → `wa:askAI` → `wa:sendWhatsApp` → SQL `finish_turn` → `customers`.
2. **رسالة عميل (UltraMsg)**: `wa:Deno.serve` (`?k=WEBHOOK_SECRET`) → `offices` (`wa_instance_key`) → `wa:processIncoming` → (كما في 1).
3. **حجب فال**: `wa:processIncoming` → `wa:falState` = blocked → `wa:isTester` → `wa:falBlockedNotice` → `events` (`fal_blocked`) → `notify.ts:alertOffice`.
4. **عميل مؤهل**: `wa:processTurn` → `canList` → `wa:officeInventory` (سياق الذكاء) → `wa:askAI` → `wa:budgetDoubt` → `wa:matchProperties` → SQL `match_properties_v2` → `v_listable_properties` → `wa:handoff("qualified")` → `wa:notifyOffice` → `notify.ts:alertOffice` → `push_subs` / تيليجرام.
5. **عرض مالك**: `wa:processTurn` (`offering`) → `wa:handoff("owner_offer")` → `wa:notifyOffice`.
6. **دخول بواتساب**: `app.js:startWaLogin` → `api:handle` (`login_start`) → `login_requests` → الموظف يرسل «دخول مقصد» → `wa:isLoginMsg` → `wa:handleLogin` → `login_requests` → `app.js:pollLogin` → `api` (`login_poll`) → `api:newSession` → `sessions`.
7. **دخول بالبصمة**: `app.js:pkLogin` → `api` (`pk_login_options`) → `auth_challenges` → `api` (`pk_login_verify`) → `api:verifySig` → `passkeys` → `sessions`.
8. **كل طلب من التطبيق**: `app.js:call` → `api:handle` → `api:session` → `sessions`/`staff`/`offices` → `switch (action)`.
9. **اعتماد فال**: `app.js:falPanel` → `api` (`fal_verify`) → `offices.fal_*` + `fal_checks` + `events` ؛ الرفض `fal_reject`.
10. **تذكير فال اليومي**: cron `maqsad-fal-check` → SQL `call_edge('fal-check')` → `fal-check:Deno.serve` → `stageOf` → `offices.fal_reminded` + `events` → `notify.ts:alertOffice`.
11. **حفظ عقار**: `app.js:openPropWizard` (المدينة إلزامية) → `api` (`property_save`) → `properties` → SQL `match_customers` → `app.js:openMatchesPrompt`.
16. **تصحيح/حذف عميل**: `app.js:openLeadEdit` → `api` (`lead_update`) → `customers` · `app.js:askLeadDelete` → `api` (`lead_delete`) → حذف `customers` (و`messages` بالـ cascade) → `privacy_requests` + `events`.
12. **انضمام مكتب**: `site.js` (`#joinForm`) أو `app.js:openSignup` → `join:Deno.serve` → مخزن `fal-proofs` + `signup_requests` → `join:tell` (تيليجرام المشغّل) → `api` (`signup_list`/`signup_update`).
13. **نشر الواجهة**: `tools/deploy/mkpatch.py` → `app_sources` → SQL `build_app` → `app_pages` → `app:Deno.serve` → `pwa/index.html`.
14. **صيانة يومية**: cron `maqsad-housekeeping` → SQL `housekeeping` → حذف من `sessions`, `otps`, `login_requests`, `auth_challenges`, `login_audit`, `events`, `backup_runs`, `signup_requests`, `contact_messages`… (ونص الرسائل حسب المدة).
15. **نسخة احتياطية**: cron `maqsad-backup-daily` → `call_edge('backup')` → `backup:dumpTable` → مخزن `backups` → `backup:verify` → `backup_runs` → `backup:prune`.

---

## 5. القواعد الحمراء — أين تُطبَّق

| القاعدة (CLAUDE.md) | أين تُطبَّق في الكود | الحالة |
| --- | --- | --- |
| لا مفاتيح ولا `.env` في المستودع | `.gitignore` (يستثني `.env`, `.env.*`, `*.pem`, `*.key`, `secrets*.json`) · `.env.example` أسماء فقط · كل الدوال تقرأ `app_secrets` عبر `secrets()` · `backup.test.mjs` يفحص خلو ملف النسخة من المفاتيح | مطبقة (لا فحص آلي قبل الـ commit) |
| لا يُعرض مكتب بلا رخصة فال | `wa:falState` + `wa:processIncoming` (لا رد ولا حفظ لعملاء مكتب `blocked` إلا المجرّبين `isTester`) · `wa:systemPrompt(licensed)` لا يذكر رقم الرخصة إن لم تكن سارية · `canList` يمنع عرض العقارات عند `expired` · `api:decorate` (`officeBlock`) · `fal-check` يوقف العرض عند الانتهاء | مطبقة |
| لا يُعرض عقار إلا بترخيص إعلان ساري (رقم + تاريخ انتهاء) | `v_listable_properties` (`ad_license_no` غير فارغ + `ad_license_expiry >= current_date`) ← `match_properties` · `api:decorate` (`listable`/`block_reason`). عرض المالك يُسلَّم للوسيط (`owner_offer`) لترخيص إعلانه | مطبقة |
| واتساب الرسمي (Meta) فقط للإطلاق | `wa` يدعم ميتا (`handleMeta`, `metaSignatureOk`) · `api:office_save` يجعل `cloud` هو الافتراضي في الإدخال | **غير مطبقة في الكود**: UltraMsg ما زال مدعوماً في `wa:Deno.serve` و`wa:sendWhatsApp` و`api:sendWhatsApp`، والقيمة الافتراضية لعمود `offices.wa_provider` في `01_schema.sql` هي `ultramsg`. المنع حالياً إجرائي فقط |
| لا إعادة كتابة ولا تغيير بنية | إجرائية (لا يطبقها الكود) | — |
| `notify.ts` الأصل ونسخه مطابقة | لا فحص آلي؛ `push.test.mjs` يختبر `_shared/notify.ts` فقط. تحقق يدوي: `md5sum supabase/functions/*/notify.ts supabase/functions/_shared/notify.ts` (متطابقة عند آخر تحقق) | مطبقة يدوياً |

---

## 6. SHARED DEPENDENCIES

- **`supabase/functions/_shared/notify.ts`** — الأصل. ⚠️ نسخ يجب أن تبقى مطابقة حرفياً: `api/notify.ts`, `wa-webhook/notify.ts`, `fal-check/notify.ts`. أي تعديل: عدّل الأصل، انسخه للثلاث، انشر الثلاث، وقارن md5.
- **جدول `app_secrets`** — كل الدوال (`secrets()` مكررة داخل كل دالة، ليست ملفاً مشتركاً). الأسماء في `docs/SECRETS.md`.
- **`WEBHOOK_SECRET`** — يحمي روابط `wa` (UltraMsg)، `tg`، `backup`، `fal-check`، `monthly-report`، ويُستخدم ملحاً في `sha()` لتشفير الجلسات والرموز في `api` و`wa`.
- **مكررة بين الدوال (نسخ منفصلة غير مشتركة)**: `sendWhatsApp` (`api`, `wa`)، `bump` (`api`, `wa`)، `sha`، `riyadhToday`، `operatorChat` (`backup`, `contact`, `join`, `fal-check`, `monthly-report`)، `saudiMobile`/`hashIp`/`toLatin` (`join`, `contact`). تعديل منطق أحدها قد يلزم تعديل نظيره.
- **SQL `call_edge`** — تستدعيه مهام cron لتشغيل `backup`, `fal-check`, `monthly-report`.
- **cron `maqsad-warm`** — يدفئ `api` و`wa-webhook` كل ٤ دقائق.
- **`app.js:call`** — كل نداءات التطبيق للخادم تمر منه (الثابت `API`)، والاستثناء `JOIN_API`.
- **`supabase/tests/harness.mjs`** — قاعدة وهمية و`fetch` وهمي لكل اختبارات الخادم (`makeDb`, `makeFetch`, `loadFunction`).

---

## 7. UNKNOWN / NEEDS VERIFICATION

- **SQL `mint_magic`**: معرّفة في `02_functions_jobs.sql`، ولا يوجد أي مستدعٍ لها في المستودع. action `redeem` في `api` يستهلك جلسات `kind = 'magic'`، لكن مصدر إنشائها غير مؤكد (قد تكون تُستدعى يدوياً أو أصبحت قديمة).
- التحقق من صحة رقم ترخيص الإعلان لدى الهيئة غير موجود (مؤجل).
- **رقم المنصة الرسمي**: `PLATFORM_WA_PHONE_ID`/`PLATFORM_WA_TOKEN`/`PLATFORM_WA_NUMBER` مذكورة في `docs/SECRETS.md` كمخططة وغير موجودة؛ لم يُتحقق من القاعدة الحية (ممنوع في هذه المهمة).
- **مخزن `site` العام** في `02_functions_jobs.sql` (`public = true`)، بينما `docs/DEPLOY.md` يقول إنه صار خاصاً. تعارض بين الملفين يحتاج تحقق من القاعدة الحية.
- **الدوال المتوقفة** (`fontkit`, `util-fontcss`, `publish`, `selfcheck`): حسب `docs/DEPLOY.md` ما زالت منشورة بانتظار الحذف؛ أصل بعضها في `archive/retired-functions/`، و`util-fontcss` بلا أصل في المستودع.
- **`app_pages` ودوال `app`**: ما إذا كانت هناك slugs غير `app` في القاعدة الحية — غير مؤكد.
- **مطابقة الإنتاج**: حتى ٢ أكتوبر ٢٠٢٦ المنشور هو api v15 وwa-webhook v15؛ تغييرات v16/v5.2 وmigration 10 في المستودع فقط بانتظار موافقة النشر.
- **عقارات بمدينة «الرياض» قبل migration 10**: القيمة جاءت من القيمة الافتراضية للعمود لا من اختيار المكتب. لم تُغيَّر (لا تخمين). القيمة الافتراضية للعمود باقية حتى تُنشر `api` v16 (حذفها قبلها يكسر إضافة العقار).

---

## 8. MAP MAINTENANCE RULES

1. أي تغيير في البنية أو إضافة كبيرة (دالة Edge جديدة، جدول، action جديد، شاشة جديدة، cron): حدّث **القسم المتأثر فقط** في نفس الـ commit.
2. حدّث سطر **"آخر تحقق"** أعلى الملف برقم الحفظة وتاريخها عند كل تحديث.
3. لا أرقام أسطر ولا نسخ كود؛ أسماء فقط كما في الكود.
4. قبل الحفظ: كل اسم جديد يُفحص بـ grep؛ ما لم يوجد يُصحح أو يُنقل إلى القسم 7.
5. أي علاقة غير مؤكدة تذهب إلى القسم 7، لا تخمين في الأقسام الأخرى.
6. حين يُحل بند في القسم 7: احذفه وضع المعلومة المؤكدة في قسمها.
7. حافظ على الحد الأقصى (~٤٥٠ سطراً): اختصر بدل أن تضيف.
