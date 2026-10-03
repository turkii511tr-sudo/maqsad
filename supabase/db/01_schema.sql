-- ===== enums =====

create type public.conv_mode as enum ('auto', 'manual');
create type public.lead_status as enum ('inquiry', 'qualified');
create type public.prop_state as enum ('available', 'reserved', 'closed', 'rented', 'sold');

-- ===== sequences =====

create sequence if not exists public.app_sources_hist_id_seq;
create sequence if not exists public.backup_runs_id_seq;
create sequence if not exists public.contact_messages_id_seq;
create sequence if not exists public.events_id_seq;
create sequence if not exists public.login_audit_id_seq;
create sequence if not exists public.messages_id_seq;
create sequence if not exists public.privacy_requests_id_seq;
create sequence if not exists public.signup_requests_id_seq;

-- ===== tables =====

create table public.app_pages (
  slug text not null,
  html text not null,
  updated_at timestamp with time zone not null default now()
);

create table public.app_secrets (
  key text not null,
  value text not null,
  updated_at timestamp with time zone not null default now()
);

create table public.app_sources (
  path text not null,
  content text not null,
  md5 text default md5(content),
  bytes integer default octet_length(content),
  updated_at timestamp with time zone not null default now()
);

create table public.app_sources_hist (
  id bigint not null default nextval('app_sources_hist_id_seq'::regclass),
  path text not null,
  content text not null,
  md5 text default md5(content),
  note text,
  saved_at timestamp with time zone not null default now()
);

create table public.backup_runs (
  id bigint not null default nextval('backup_runs_id_seq'::regclass),
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone,
  ok boolean,
  path text,
  bytes bigint,
  row_counts jsonb,
  error text
);

create table public.contact_messages (
  id bigint not null default nextval('contact_messages_id_seq'::regclass),
  name text not null,
  phone text,
  email text,
  topic text not null,
  message text not null,
  ip_hash text,
  status text not null default 'new'::text,
  created_at timestamp with time zone not null default now(),
  closed_at timestamp with time zone
);

create table public.customers (
  id uuid not null default gen_random_uuid(),
  office_id uuid not null,
  wa_id text not null,
  phone text not null,
  name text,
  deal_type text,
  property_type text,
  budget numeric,
  budget_period text,
  location text,
  rooms integer,
  appointment text,
  status lead_status not null default 'inquiry'::lead_status,
  summary text,
  mode conv_mode not null default 'auto'::conv_mode,
  msg_count integer not null default 0,
  buffer text not null default ''::text,
  recent_ids text[] not null default '{}'::text[],
  locked_until timestamp with time zone,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  manual_pinged_at timestamp with time zone,
  disclosed_at timestamp with time zone,
  opted_out boolean not null default false,
  opted_out_at timestamp with time zone,
  handoff_reason text,
  handed_at timestamp with time zone,
  outcome text,
  outcome_at timestamp with time zone,
  first_outcome_at timestamp with time zone,
  outcome_by uuid,
  city text,
  stale_turns integer not null default 0,
  assigned_to uuid,
  assigned_at timestamp with time zone
);

create table public.events (
  id bigint not null default nextval('events_id_seq'::regclass),
  office_id uuid,
  level text not null default 'info'::text,
  kind text not null,
  detail jsonb,
  created_at timestamp with time zone not null default now()
);

create table public.fal_checks (
  id bigint generated always as identity not null,
  office_id uuid not null,
  license_no text not null,
  result text not null,
  holder_name text,
  expires_on date,
  proof_path text,
  checks jsonb not null default '{}'::jsonb,
  note text,
  checked_by uuid,
  checked_at timestamp with time zone not null default now()
);

create table public.login_audit (
  id bigint not null default nextval('login_audit_id_seq'::regclass),
  phone text not null,
  staff_id uuid,
  ok boolean not null,
  reason text,
  ip text,
  created_at timestamp with time zone not null default now()
);

create table public.messages (
  id bigint not null default nextval('messages_id_seq'::regclass),
  office_id uuid not null,
  customer_id uuid,
  direction text not null,
  body text,
  mode conv_mode,
  wa_msg_id text,
  created_at timestamp with time zone not null default now()
);

create table public.offices (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  license_no text not null,
  sector text not null default 'عقار'::text,
  wa_provider text not null default 'cloud'::text,
  wa_instance text,
  wa_token text,
  wa_number text,
  telegram_chat_id text,
  msg_quota integer not null default 15,
  debounce_seconds integer not null default 7,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  wa_instance_key text default lower(regexp_replace(COALESCE(wa_instance, ''::text), '^instance'::text, ''::text, 'i'::text)),
  tg_link_code text,
  fal_status text not null default 'pending'::text,
  fal_expires_on date,
  fal_holder_name text,
  fal_proof_path text,
  fal_verified_at timestamp with time zone,
  fal_verified_by uuid,
  fal_note text,
  fal_reminded integer,
  notify_telegram boolean not null default true,
  notify_push boolean not null default true,
  fal_signup_proof text,
  fal_request jsonb,
  onboarded_at timestamp with time zone,
  onboarding jsonb not null default '{}'::jsonb,
  terms_version text,
  terms_accepted_at timestamp with time zone,
  terms_accepted_by uuid
);

create table public.otps (
  phone text not null,
  code_hash text not null,
  expires_at timestamp with time zone not null,
  attempts integer not null default 0,
  sent_at timestamp with time zone not null default now()
);

create table public.privacy_requests (
  id bigint not null default nextval('privacy_requests_id_seq'::regclass),
  office_id uuid,
  staff_id uuid,
  kind text not null,
  status text not null default 'open'::text,
  detail jsonb,
  created_at timestamp with time zone not null default now(),
  closed_at timestamp with time zone
);

create table public.properties (
  id uuid not null default gen_random_uuid(),
  office_id uuid not null,
  title text not null,
  deal_type text not null default 'إيجار'::text,
  property_type text not null,
  district text not null,
  city text not null default 'الرياض'::text,
  price numeric not null,
  rooms integer,
  state prop_state not null default 'available'::prop_state,
  ad_license_no text,
  ad_license_expiry date,
  images text[] not null default '{}'::text[],
  notes text,
  created_at timestamp with time zone not null default now(),
  details jsonb not null default '{}'::jsonb
);

create table public.push_subs (
  id bigint generated always as identity not null,
  office_id uuid not null,
  staff_id uuid,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device text,
  fails integer not null default 0,
  created_at timestamp with time zone not null default now(),
  last_ok_at timestamp with time zone
);

create table public.sessions (
  token_hash text not null,
  staff_id uuid not null,
  expires_at timestamp with time zone not null,
  last_seen timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  kind text not null default 'session'::text,
  used_at timestamp with time zone
);

create table public.signup_requests (
  id bigint not null default nextval('signup_requests_id_seq'::regclass),
  office_name text not null,
  contact_name text not null,
  phone text not null,
  city text,
  fal_license text,
  agents text,
  note text,
  ip_hash text,
  status text not null default 'new'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  fal_proof_path text
);

create table public.staff (
  id uuid not null default gen_random_uuid(),
  office_id uuid not null,
  name text not null,
  phone text not null,
  role text not null default 'agent'::text,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  last_login_at timestamp with time zone
);

create table public.usage_daily (
  office_id uuid not null,
  day date not null,
  ai_calls integer not null default 0,
  ai_in_tokens bigint not null default 0,
  ai_cached_tokens bigint not null default 0,
  ai_out_tokens bigint not null default 0,
  ai_errors integer not null default 0,
  wa_out integer not null default 0,
  wa_failed integer not null default 0,
  otp_platform integer not null default 0,
  otp_office integer not null default 0
);

-- ===== constraints =====

alter table public.app_pages add constraint app_pages_pkey PRIMARY KEY (slug);
alter table public.app_secrets add constraint app_secrets_pkey PRIMARY KEY (key);
alter table public.app_sources add constraint app_sources_pkey PRIMARY KEY (path);
alter table public.app_sources_hist add constraint app_sources_hist_pkey PRIMARY KEY (id);
alter table public.backup_runs add constraint backup_runs_pkey PRIMARY KEY (id);
alter table public.contact_messages add constraint contact_messages_pkey PRIMARY KEY (id);
alter table public.customers add constraint customers_pkey PRIMARY KEY (id);
alter table public.events add constraint events_pkey PRIMARY KEY (id);
alter table public.fal_checks add constraint fal_checks_pkey PRIMARY KEY (id);
alter table public.login_audit add constraint login_audit_pkey PRIMARY KEY (id);
alter table public.messages add constraint messages_pkey PRIMARY KEY (id);
alter table public.offices add constraint offices_pkey PRIMARY KEY (id);
alter table public.otps add constraint otps_pkey PRIMARY KEY (phone);
alter table public.privacy_requests add constraint privacy_requests_pkey PRIMARY KEY (id);
alter table public.properties add constraint properties_pkey PRIMARY KEY (id);
alter table public.push_subs add constraint push_subs_pkey PRIMARY KEY (id);
alter table public.sessions add constraint sessions_pkey PRIMARY KEY (token_hash);
alter table public.signup_requests add constraint signup_requests_pkey PRIMARY KEY (id);
alter table public.staff add constraint staff_pkey PRIMARY KEY (id);
alter table public.usage_daily add constraint usage_daily_pkey PRIMARY KEY (office_id, day);
alter table public.customers add constraint customers_office_id_wa_id_key UNIQUE (office_id, wa_id);
alter table public.offices add constraint offices_code_key UNIQUE (code);
alter table public.push_subs add constraint push_subs_endpoint_key UNIQUE (endpoint);
alter table public.staff add constraint staff_phone_key UNIQUE (phone);
alter table public.contact_messages add constraint contact_messages_email_check CHECK (((email IS NULL) OR (char_length(email) <= 120)));
alter table public.contact_messages add constraint contact_messages_message_check CHECK (((char_length(message) >= 10) AND (char_length(message) <= 1500)));
alter table public.contact_messages add constraint contact_messages_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 80)));
alter table public.contact_messages add constraint contact_messages_phone_check CHECK ((phone ~ '^9665[0-9]{8}$'::text));
alter table public.contact_messages add constraint contact_messages_status_check CHECK ((status = ANY (ARRAY['new'::text, 'replied'::text, 'closed'::text])));
alter table public.contact_messages add constraint contact_messages_topic_check CHECK ((topic = ANY (ARRAY['general'::text, 'support'::text, 'billing'::text, 'privacy'::text, 'complaint'::text])));
alter table public.contact_messages add constraint contact_reachable CHECK (((phone IS NOT NULL) OR (email IS NOT NULL)));
alter table public.customers add constraint customers_handoff_chk CHECK (((handoff_reason IS NULL) OR (handoff_reason = ANY (ARRAY['qualified'::text, 'human'::text, 'quota'::text, 'owner_offer'::text, 'ai_error'::text, 'taken'::text]))));
alter table public.customers add constraint customers_outcome_chk CHECK (((outcome IS NULL) OR (outcome = ANY (ARRAY['no_answer'::text, 'contacted'::text, 'viewing'::text, 'deal'::text, 'lost'::text]))));
alter table public.events add constraint events_level_check CHECK ((level = ANY (ARRAY['info'::text, 'warn'::text, 'error'::text])));
alter table public.fal_checks add constraint fal_checks_result_check CHECK ((result = ANY (ARRAY['verified'::text, 'rejected'::text])));
alter table public.messages add constraint messages_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text])));
alter table public.offices add constraint offices_fal_status_chk CHECK ((fal_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])));
alter table public.offices add constraint offices_fal_verified_chk CHECK (((fal_status <> 'verified'::text) OR ((fal_expires_on IS NOT NULL) AND (fal_holder_name IS NOT NULL) AND (fal_proof_path IS NOT NULL) AND (fal_verified_at IS NOT NULL))));
alter table public.privacy_requests add constraint privacy_requests_kind_check CHECK ((kind = ANY (ARRAY['export'::text, 'delete_account'::text, 'delete_customer'::text, 'opt_out'::text])));
alter table public.privacy_requests add constraint privacy_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'done'::text, 'rejected'::text])));
alter table public.properties add constraint properties_price_check CHECK ((price >= (0)::numeric));
alter table public.sessions add constraint sessions_kind_chk CHECK ((kind = ANY (ARRAY['session'::text, 'magic'::text])));
alter table public.signup_requests add constraint signup_requests_agents_check CHECK ((agents = ANY (ARRAY['1'::text, '2-5'::text, '6-15'::text, '16+'::text])));
alter table public.signup_requests add constraint signup_requests_city_check CHECK ((char_length(city) <= 40));
alter table public.signup_requests add constraint signup_requests_contact_name_check CHECK (((char_length(contact_name) >= 2) AND (char_length(contact_name) <= 80)));
alter table public.signup_requests add constraint signup_requests_fal_license_check CHECK ((fal_license ~ '^[0-9]{4,20}$'::text));
alter table public.signup_requests add constraint signup_requests_note_check CHECK ((char_length(note) <= 500));
alter table public.signup_requests add constraint signup_requests_office_name_check CHECK (((char_length(office_name) >= 2) AND (char_length(office_name) <= 120)));
alter table public.signup_requests add constraint signup_requests_phone_check CHECK ((phone ~ '^9665[0-9]{8}$'::text));
alter table public.signup_requests add constraint signup_requests_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'converted'::text, 'rejected'::text])));
alter table public.staff add constraint staff_role_chk CHECK ((role = ANY (ARRAY['super_admin'::text, 'owner'::text, 'agent'::text])));
alter table public.customers add constraint customers_office_id_fkey FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE;
alter table public.customers add constraint customers_outcome_by_fkey FOREIGN KEY (outcome_by) REFERENCES staff(id) ON DELETE SET NULL;
alter table public.events add constraint events_office_id_fkey FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE SET NULL;
alter table public.fal_checks add constraint fal_checks_checked_by_fkey FOREIGN KEY (checked_by) REFERENCES staff(id) ON DELETE SET NULL;
alter table public.fal_checks add constraint fal_checks_office_id_fkey FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE;
alter table public.messages add constraint messages_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
alter table public.messages add constraint messages_office_id_fkey FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE;
alter table public.privacy_requests add constraint privacy_requests_office_id_fkey FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE SET NULL;
alter table public.privacy_requests add constraint privacy_requests_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL;
alter table public.properties add constraint properties_office_id_fkey FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE;
alter table public.push_subs add constraint push_subs_office_id_fkey FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE;
alter table public.sessions add constraint sessions_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
alter table public.staff add constraint staff_office_id_fkey FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE;
alter table public.usage_daily add constraint usage_daily_office_id_fkey FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE;

-- ===== indexes =====

CREATE INDEX backup_runs_time ON public.backup_runs USING btree (started_at DESC);
CREATE INDEX contact_messages_created_idx ON public.contact_messages USING btree (created_at DESC);
CREATE INDEX contact_messages_ip_idx ON public.contact_messages USING btree (ip_hash, created_at DESC);
CREATE INDEX customers_office_handed_idx ON public.customers USING btree (office_id, handed_at);
CREATE INDEX customers_office_id_last_message_at_idx ON public.customers USING btree (office_id, last_message_at DESC NULLS LAST);
CREATE INDEX customers_office_id_mode_idx ON public.customers USING btree (office_id, mode);
CREATE INDEX customers_office_id_status_idx ON public.customers USING btree (office_id, status);
CREATE INDEX customers_office_outcome_idx ON public.customers USING btree (office_id, outcome_at);
CREATE INDEX events_office_id_created_at_idx ON public.events USING btree (office_id, created_at DESC);
CREATE INDEX fal_checks_office_idx ON public.fal_checks USING btree (office_id, checked_at DESC);
CREATE INDEX login_audit_phone_time ON public.login_audit USING btree (phone, created_at DESC);
CREATE INDEX messages_customer_id_created_at_idx ON public.messages USING btree (customer_id, created_at DESC);
CREATE INDEX messages_office_created_idx ON public.messages USING btree (office_id, created_at);
CREATE INDEX messages_office_id_created_at_idx ON public.messages USING btree (office_id, created_at DESC);
CREATE UNIQUE INDEX offices_tg_link_code_idx ON public.offices USING btree (tg_link_code) WHERE (tg_link_code IS NOT NULL);
CREATE INDEX offices_wa_instance_key_idx ON public.offices USING btree (wa_instance_key) WHERE active;
CREATE INDEX privacy_requests_office_idx ON public.privacy_requests USING btree (office_id, created_at DESC);
CREATE INDEX properties_office_id_district_idx ON public.properties USING btree (office_id, district);
CREATE INDEX properties_office_id_state_idx ON public.properties USING btree (office_id, state);
CREATE INDEX push_subs_office_idx ON public.push_subs USING btree (office_id);
CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);
CREATE INDEX sessions_kind_idx ON public.sessions USING btree (kind, expires_at);
CREATE INDEX signup_requests_ip_idx ON public.signup_requests USING btree (ip_hash, created_at DESC);
CREATE INDEX signup_requests_phone_idx ON public.signup_requests USING btree (phone, created_at DESC);

-- ===== row level security =====

alter table public.app_pages enable row level security;
alter table public.app_secrets enable row level security;
alter table public.app_sources enable row level security;
alter table public.app_sources_hist enable row level security;
alter table public.backup_runs enable row level security;
alter table public.contact_messages enable row level security;
alter table public.customers enable row level security;
alter table public.events enable row level security;
alter table public.fal_checks enable row level security;
alter table public.login_audit enable row level security;
alter table public.messages enable row level security;
alter table public.offices enable row level security;
alter table public.otps enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.properties enable row level security;
alter table public.push_subs enable row level security;
alter table public.sessions enable row level security;
alter table public.signup_requests enable row level security;
alter table public.staff enable row level security;
alter table public.usage_daily enable row level security;

-- ===== table grants =====

grant delete, insert, maintain, references, select, trigger, truncate, update on public.app_pages to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.app_secrets to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.app_sources to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.app_sources_hist to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.backup_runs to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.contact_messages to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.customers to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.events to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.fal_checks to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.login_audit to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.messages to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.offices to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.otps to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.privacy_requests to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.properties to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.push_subs to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.sessions to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.signup_requests to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.staff to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.usage_daily to service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.v_listable_properties to service_role;

create index if not exists events_kind_id_idx on public.events (kind, id desc);
create index if not exists messages_created_idx on public.messages (created_at);

-- ===== v15: الدخول برسالة واتساب من الموظف + البصمة (راجع migrations/08) =====
create table if not exists public.login_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  phone text not null,
  nonce text not null,
  poll_hash text not null,
  channel text not null check (channel in ('platform', 'office')),
  channel_office uuid,
  device text,
  expires_at timestamptz not null,
  verified_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists login_requests_phone_idx on public.login_requests (phone, nonce);

create table if not exists public.passkeys (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  cred_id text not null unique,
  public_key jsonb not null,
  alg integer not null,
  sign_count bigint not null default 0,
  rp_id text not null,
  transports text[],
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists passkeys_staff_idx on public.passkeys (staff_id);

create table if not exists public.auth_challenges (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('reg', 'login')),
  staff_id uuid references public.staff(id) on delete cascade,
  challenge text not null,
  rp_id text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- لا وصول إلا من الخادم (service_role)
alter table public.login_requests enable row level security;
alter table public.passkeys enable row level security;
alter table public.auth_challenges enable row level security;
revoke all on public.login_requests, public.passkeys, public.auth_challenges from public, anon, authenticated;
grant all on public.login_requests, public.passkeys, public.auth_challenges to service_role;

