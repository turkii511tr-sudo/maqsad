-- حالات العقار كما يعرضها التطبيق: «مؤجّر» و«مباع» (كانت تفشل عند الحفظ لأن القيمتين غير معرّفتين)
alter type public.prop_state add value if not exists 'rented';
alter type public.prop_state add value if not exists 'sold';
