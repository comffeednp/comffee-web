// Hand-written DB types. When you wire up the Supabase CLI, replace this
// with `supabase gen types typescript`. For now, this is enough for the
// public marketing site + admin CRUD.

export type BranchType = "cafe" | "playcation";
export type AdminRole = "super_admin" | "branch_manager" | "staff";
export type ReservationSource = "website" | "airbnb" | "manual_block";
export type ReservationStatus = "pending_hold" | "confirmed" | "cancelled" | "completed";
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
  description_md: string | null;
  hero_image_url: string | null;
  hours_text: string | null;
  max_guests: number | null;
  booking_cutoff_time: string | null;
  security_deposit_php: number | null;
  checkin_photo_url: string | null;
  checkout_photo_url: string | null;
  is_published: boolean;
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
  is_active: boolean;
  created_at: string;
}

// Convenience: a fully hydrated branch (used by [slug] page)
export interface BranchFull extends Branch {
  amenities: BranchAmenity[];
  photos: BranchPhoto[];
  rates: BranchRate[];
}
