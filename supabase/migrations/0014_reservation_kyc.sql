-- Store Sumsub applicant ID and KYC verification status per reservation
alter table public.reservations
  add column if not exists sumsub_applicant_id text,
  add column if not exists kyc_status text not null default 'pending';
