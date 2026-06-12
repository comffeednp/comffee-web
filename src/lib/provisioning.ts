// Self-serve branch provisioning for Partner-Cafe SaaS subscribers.
//
// When a paid cafe (PanCafe/AI tier) submits its details from the POS, this creates — once,
// idempotently — everything that used to be hand-wired per cafe:
//   • a `branches` row on the WEBSITE project (uioeef…), type 'partner_cafe', unique slug,
//     is_published=false (the owner reviews + flips it live; attendance + seating work meanwhile)
//   • a `license_branches` mapping on the CONTROL project (ipcgyt…) so the website-proxy pins the
//     cafe's seating writes to its own branch (the per-tenant write boundary from 2026-06-11)
//
// Two projects, two service keys — same split mintLicenseKey already uses:
//   WEBSITE: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY        (branches)
//   CONTROL: LICENSE_SUPABASE_URL    + LICENSE_SUPABASE_SERVICE_KEY      (licenses, license_branches)
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { slugify } from "@/lib/utils";

// Tiers that get a website branch + seating + attendance. Under the 2026-06-12
// model every PAID tier gets one — seating (₱299) IS the live-seating product,
// pos (₱599) adds attendance clock-in, ai (₱799) everything. 'free' and legacy
// 'basic' (₱199 POS-only) get none. Earlier naming generations stay honoured:
// 2026-06-11 (clockwork/unified) and pre-merge (pancafe/ai). NB: 'pos' was a
// branchless ₱199 id for one unshipped day — harmless to branch it now.
const BRANCHED_TIERS = new Set(["seating", "pos", "ai", "clockwork", "unified", "pancafe"]);

export class ProvisionError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = status;
  }
}

function controlEnv() {
  const url = process.env.LICENSE_SUPABASE_URL;
  const key = process.env.LICENSE_SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new ProvisionError("not_configured", 500, "LICENSE project env missing");
  return { url: url.replace(/\/$/, ""), key };
}

// Thin REST helper for the CONTROL project (service role; bypasses RLS on license_branches).
async function controlRest(path: string, init?: RequestInit) {
  const { url, key } = controlEnv();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new ProvisionError("control_error", 502, `control ${path} -> ${res.status} ${await res.text()}`);
  }
  return res;
}

export interface LicenseRow {
  license_key: string;
  plan: string;
  status: string;
  machine_id: string | null;
  business_name: string | null;
}

// Validate the caller owns this license: it must exist, be active, be a branched tier, and either
// be bound to THIS machine or not yet bound (a leaked key bound elsewhere can't provision).
export async function authorizeProvision(licenseKey: string, machineId: string | null): Promise<LicenseRow> {
  const res = await controlRest(
    `licenses?license_key=eq.${encodeURIComponent(licenseKey)}&select=license_key,plan,status,machine_id,business_name&limit=1`,
  );
  const rows = (await res.json()) as LicenseRow[];
  const lic = rows[0];
  if (!lic) throw new ProvisionError("not_found", 404);
  if (lic.status !== "active") throw new ProvisionError("inactive", 403);
  if (!BRANCHED_TIERS.has(lic.plan)) throw new ProvisionError("no_branch_for_tier", 400);
  if (lic.machine_id && machineId && lic.machine_id !== machineId) {
    throw new ProvisionError("machine_mismatch", 403);
  }
  return lic;
}

export async function getMappedBranchId(licenseKey: string): Promise<string | null> {
  const res = await controlRest(
    `license_branches?license_key=eq.${encodeURIComponent(licenseKey)}&select=branch_id&limit=1`,
  );
  const rows = (await res.json()) as { branch_id: string }[];
  return rows[0]?.branch_id ?? null;
}

// A slug that doesn't collide with an existing branch. slugify() handles the cleaning; we append
// -2, -3, … only on a real collision. Falls back to a short random suffix if the name is empty
// after slugifying (e.g. all-emoji cafe name).
async function uniqueSlug(name: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const base = slugify(name) || `cafe-${Math.random().toString(36).slice(2, 7)}`;
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const { data } = await admin.from("branches").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  // Pathological: 49 collisions. Use a guaranteed-unique suffix.
  return `${base}-${Date.now().toString(36)}`;
}

export interface ProvisionInput {
  licenseKey: string;
  machineId: string | null;
  name: string;
  city?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface ProvisionResult {
  branchId: string;
  slug: string;
  created: boolean;
  isPublished: boolean;
}

export async function provisionBranch(input: ProvisionInput): Promise<ProvisionResult> {
  const lic = await authorizeProvision(input.licenseKey, input.machineId);
  const admin = getSupabaseAdmin();

  const detail = {
    name: input.name,
    city: input.city ?? null,
    address: input.address ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    updated_at: new Date().toISOString(),
  };

  // Already provisioned → update editable details, return the existing branch (idempotent path).
  const existing = await getMappedBranchId(input.licenseKey);
  if (existing) {
    const { data } = await admin
      .from("branches")
      .update(detail)
      .eq("id", existing)
      .select("id, slug, is_published")
      .single();
    return {
      branchId: existing,
      slug: data?.slug ?? "",
      created: false,
      isPublished: !!data?.is_published,
    };
  }

  // First time: create the branch (hidden until owner approves), then claim the mapping.
  const slug = await uniqueSlug(input.name);
  const { data: created, error } = await admin
    .from("branches")
    .insert({
      ...detail,
      slug,
      type: "partner_cafe",
      brand: input.name, // single-branch brand by default; multi-branch owners edit later
      is_published: false,
    })
    .select("id, slug")
    .single();
  if (error || !created) throw new ProvisionError("branch_create_failed", 502, error?.message);

  // Claim the license→branch mapping. PK is license_key, so a racing second call can't double-map.
  await controlRest(`license_branches?on_conflict=license_key`, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ license_key: input.licenseKey, branch_id: created.id }),
  });

  // Confirm we own the mapping; if another call won the race, drop our orphan branch and use theirs.
  const winner = await getMappedBranchId(input.licenseKey);
  if (winner && winner !== created.id) {
    await admin.from("branches").delete().eq("id", created.id);
    const { data } = await admin.from("branches").select("slug, is_published").eq("id", winner).single();
    return { branchId: winner, slug: data?.slug ?? "", created: false, isPublished: !!data?.is_published };
  }

  return { branchId: created.id, slug: created.slug, created: true, isPublished: false };
}
