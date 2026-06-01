// Hand-written DB types. When you wire up the Supabase CLI, replace this
// with `supabase gen types typescript`. For now, this is enough for the
// public marketing site + admin CRUD.

// 'cafe' = Comffee-brand franchises (Lagro, SJDM) at /branches/<slug>
// 'playcation' = Playcation stays at /branches/<slug> (same listing, different rendering)
// 'partner_cafe' = independent internet cafes on Comffee POS SaaS, listed at /partners/<slug>
//                  ([[comffee-saas-vision]], migration 0032 adds the value to the DB enum).
export type BranchType = "cafe" | "playcation" | "partner_cafe";
export type AdminRole = "super_admin" | "branch_manager" | "staff" | "partner";
export type ReservationSource = "website" | "airbnb" | "manual_block";
export type ReservationStatus = "pending_hold" | "pending_approval" | "confirmed" | "cancelled" | "completed";
export type PaymentStatus = "unpaid" | "pending" | "paid" | "failed" | "refunded";

export interface Branch {
  id: string;
  slug: string;
  name: string;
  type: BranchType;
  tagline: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  lat: number | null;
  lng: number | null;
  geofence_radius_m: number;
  geofence_required: boolean;
  description_md: string | null;
  hero_image_url: string | null;
  hours_text: string | null;
  max_guests: number | null;
  booking_cutoff_time: string | null;
  security_deposit_php: number | null;
  checkin_photo_url: string | null;
  checkout_photo_url: string | null;
  is_published: boolean;
  reservations_enabled: boolean;   // Stage 6: when false, the public page hides the Reserve CTA + the reservation API rejects.
  gcash_qr_url: string | null;     // Stage 7a: partner's static GCash QR image URL (customer scans to pay).
  gcash_qr_path: string | null;    // storage path; useful for replace/delete.
  gcash_type: string | null;       // 'p2p' default; 'business' is TBA.
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BranchAmenity {
  id: string;
  branch_id: string;
  icon: string;
  label: string;
  description: string | null;
  sort_order: number;
}

export interface BranchPhoto {
  id: string;
  branch_id: string;
  storage_path: string;
  public_url: string | null;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export interface BranchRate {
  id: string;
  branch_id: string;
  category: string;
  label: string;
  description: string | null;
  price_php: number;
  unit: string;
  sort_order: number;
  max_pax: number | null;
  max_guests: number | null;
  extra_pax_fee_php: number | null;
  check_in_time: string | null;
  check_out_time: string | null;
}

export interface MenuCategory {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
}

export interface MenuItem {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  base_price_php: number;
  photo_storage_path: string | null;
  is_global: boolean;
  available: boolean;
  sort_order: number;
  created_at: string;
}

export interface SiteSettingRow {
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
}

export interface ContactSubmission {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  branch_id: string | null;
  handled: boolean;
  handled_at: string | null;
  created_at: string;
}

export interface AdminUser {
  id: string;
  auth_user_id: string;
  full_name: string;
  email: string | null;
  role: AdminRole;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Cloud attendance (see migration 0026) ────────────────────────────────────
export type AttendanceStatus = "pending" | "approved" | "rejected" | "disabled";
export type AttendanceClockType = "clock_in" | "clock_out";

export interface BranchStaff {
  id: string;
  branch_id: string;
  auth_user_id: string | null;
  email: string;
  name: string;
  face_descriptor: number[] | null; // 128-d face-api vector
  selfie_url: string | null;
  status: AttendanceStatus;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceBinding {
  id: string;
  staff_id: string;
  device_token: string;
  user_agent: string | null;
  bound_at: string;
  last_seen_at: string | null;
}

export interface AttendanceRecord {
  id: string;
  branch_id: string;
  staff_id: string;
  clock_type: AttendanceClockType;
  recorded_at: string;
  selfie_url: string | null;
  face_match_score: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy_m: number | null;
  distance_m: number | null;
  verified_ip: string | null;
  device_token: string | null;
  covering_for_staff_id: string | null; // a clock-in: the staff this reliever is covering for (else null)
}

// Convenience: a fully hydrated branch (used by [slug] page)
export interface BranchFull extends Branch {
  amenities: BranchAmenity[];
  photos: BranchPhoto[];
  rates: BranchRate[];
}
