-- Store KYC document URLs and location data directly on the reservation
alter table public.reservations
  add column if not exists kyc_selfie_url  text,
  add column if not exists kyc_id_url      text,
  add column if not exists kyc_billing_url text,
  add column if not exists kyc_ip_address  text,
  add column if not exists kyc_latitude    numeric(10, 7),
  add column if not exists kyc_longitude   numeric(10, 7);
