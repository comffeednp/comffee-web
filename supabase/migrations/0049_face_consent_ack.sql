-- 0049_face_consent_ack.sql
-- One-time, version-aware acknowledgment that the staffer understands face scan is the ONLY
-- clock-in method (owner decision: no PIN/opt-out). Stored on branch_staff (single record per
-- staff; re-prompt happens only when FACE_CONSENT_VERSION in app code is bumped past the stored
-- value). No separate audit table: there is no version-history requirement and the status poll
-- already reads branch_staff, so this adds zero extra queries. All writes stay service-role only
-- (RLS from 0026 unchanged — clients still cannot write these columns).

alter table public.branch_staff
  add column if not exists face_consent_version  integer,      -- null = never acknowledged
  add column if not exists face_consent_acked_at timestamptz,
  add column if not exists face_consent_acked_ip text;

comment on column public.branch_staff.face_consent_version is
  'Highest face-scan acknowledgment version this staffer has accepted. Compared against FACE_CONSENT_VERSION in app code; a higher app version re-prompts before the next enrollment. null = never acknowledged.';
