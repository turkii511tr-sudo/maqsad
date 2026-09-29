const OFFICE = { id:'o1', name:'مكتب الأفق العقاري', code:'OFFICE_01', license_no:'1200012345',
  msg_quota:15, debounce_seconds:7, wa_number:'966501112345', wa_provider:'ultramsg' };

const LEADS = [
  { id:'c1', name:'فهد بن سالم', phone:'966501116789', deal_type:'إيجار', property_type:'شقة',
    budget:45000, budget_period:'سنوي', location:'النرجس', rooms:3, status:'qualified',
    mode:'manual', summary:'يبحث عن شقة إيجار في النرجس ٣ غرف بميزانية ٤٥ ألف سنوي.',
    msg_count:4, last_message_at:new Date(Date.now()-35*60000).toISOString() },
  { id:'c2', name:'خالد الدوسري', phone:'966511111111', deal_type:'شراء', property_type:'فيلا',
    budget:1850000, budget_period:null, location:'حطين', rooms:5, status:'qualified',
    mode:'manual', summary:'يريد فيلا في حطين.', msg_count:7,
    last_message_at:new Date(Date.now()-3*3600000).toISOString() },
  { id:'c3', name:'أحمد', phone:'966522222222', deal_type:null, property_type:null,
    budget:null, location:null, rooms:null, status:'inquiry', mode:'auto',
    summary:'استفسار عام.', msg_count:1, last_message_at:new Date().toISOString() },
];

const today = new Date(); const soon = new Date(Date.now()+4*86400000);
const d = x => x.toISOString().slice(0,10);
const PROPS = [
  { id:'p1', title:'شقة النرجس A12', deal_type:'إيجار', property_type:'شقة', district:'النرجس',
    price:42000, rooms:3, state:'available', ad_license_no:'7200034512',
    ad_license_expiry:d(soon), listable:true, block_reason:null },
  { id:'p2', title:'فيلا حطين', deal_type:'شراء', property_type:'فيلا', district:'حطين',
    price:1850000, rooms:5, state:'available', ad_license_no:null,
    ad_license_expiry:null, listable:false, block_reason:'بدون رقم ترخيص إعلان' },
];

const STATUS = { can_edit:true, is_super:true, office_name:OFFICE.name, whatsapp:false,
  wa_number:'966501112345', msg_quota:15, my_phone:'966501116789', openai:true,
  telegram:false, wa_instance:'instance190700', wa_provider:'ultramsg', telegram_chat_id:'',
  errors:[{ kind:'whatsapp_send_failed', detail:{ error:'Wrong token.' }, created_at:new Date().toISOString() }] };

const OFFICES = [
  { id:'o1', code:'OFFICE_01', name:OFFICE.name, license_no:'1200012345', wa_number:'966501112345',
    wa_provider:'ultramsg', wa_instance:'instance190700', active:true, msg_quota:15,
    telegram_chat_id:'', wa_linked:true, leads:3, props:2 },
  { id:'o2', code:'OFFICE_02', name:'مكتب الواحة', license_no:'1200099999', wa_number:null,
    wa_provider:'ultramsg', wa_instance:null, active:true, msg_quota:15,
    telegram_chat_id:null, wa_linked:false, leads:0, props:0 },
];

function reply(action, body) {
  switch (action) {
    case 'bootstrap': return { staff:{name:'تركي',role:'super_admin',phone:'966501116789'},
      is_super:true, office:OFFICE, leads:LEADS, properties:PROPS, status:STATUS, offices:OFFICES };
    case 'leads': return { leads:LEADS };
    case 'properties': return { properties:PROPS };
    case 'settings_status': return STATUS;
    case 'analytics': return { summary:{}, gap:[{ location:'النرجس', property_type:'شقة', deal_type:'إيجار', misses:17 }] };
    case 'offices_list': return { offices:OFFICES };
    case 'backups_status': return { runs:[{ started_at:new Date().toISOString(), ok:true, bytes:46094 }] };
    case 'staff_list': return { staff:[{ id:'s1', name:'سعد', phone:'966500000002', role:'agent', active:true }] };
    case 'lead': return { lead:LEADS.find(l=>l.id===body.id), messages:[
      { direction:'in', body:'السلام عليكم أبي شقة إيجار في النرجس', created_at:new Date(Date.now()-40*60000).toISOString() },
      { direction:'out', body:'الله يعطيك العافية\n\n🏠 شقة النرجس A12\n💰 42,000 ريال', created_at:new Date(Date.now()-39*60000).toISOString() } ] };
    case 'set_mode': return { ok:true, mode:body.mode };
    case 'property_save': return { ok:true };
    case 'office_save': return { ok:true, offices:OFFICES };
    case 'save_settings': return { ok:true };
    case 'test_whatsapp': return { ok:false, to:'966501116789' };
    case 'logout': return { ok:true };
    default: return { ok:true };
  }
}


module.exports = { reply };
