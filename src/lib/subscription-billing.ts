// Partner-Cafe SaaS subscription billing helpers (cafe pays Comffee).
// The QR Ph is created with the PLATFORM PayMongo key (process.env.PAYMONGO_SECRET_KEY) via the
// existing createCheckoutSession — NOT a per-branch key and NOT a DIY/EMVCo QR. The license key is
// minted in the SEPARATE LICENSE Supabase project (ipcgyt…), which the POS validates on activation.
import crypto from "node:crypto";

export const SUBSCRIPTION_TIERS = {
  basic: { amountPhp: 199, name: "Basic POS" },
  pancafe: { amountPhp: 499, name: "PanCafe-Integrated" },
  ai: { amountPhp: 699, name: "AI-Integrated" },
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;

/** CMFE-XXXX-XXXX-XXXX, unambiguous alphabet (no 0/O/1/I) — matches the POS license input mask. */
export function makeLicenseKey(): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const grp = () =>
    Array.from(crypto.randomBytes(4))
      .map((b) => A[b % A.length])
      .join("");
  return `CMFE-${grp()}-${grp()}-${grp()}`;
}

/**
 * Mint a license key in the LICENSE project (ipcgyt…) and return it. Called from the PayMongo
 * webhook once a subscription payment is confirmed.
 *
 * REQUIRES (set in comffee-web env / Vercel):
 *   LICENSE_SUPABASE_URL          — the ipcgyt… project URL (already used by the POS)
 *   LICENSE_SUPABASE_SERVICE_KEY  — that project's SERVICE-ROLE key (server-only; never the POS's
 *                                   publishable key — minting must insert, which RLS blocks for anon)
 * AND a `mint_license` RPC in that project (SQL provided separately — adjust the column names to the
 * real licenses table). The RPC should insert a one-month license row for p_plan bound to nothing yet
 * (machine binds on first POS activation) and return void/the key.
 *
 * One month from now is computed here so the RPC stays a simple insert.
 */
export async function mintLicenseKey(opts: {
  tier: SubscriptionTier | string;
  email: string;
  machineId: string | null;
}): Promise<string> {
  const url = process.env.LICENSE_SUPABASE_URL;
  const key = process.env.LICENSE_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("LICENSE_SUPABASE_URL / LICENSE_SUPABASE_SERVICE_KEY not configured");
  }
  const licenseKey = makeLicenseKey();
  const expiresAt = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
  const res = await fetch(`${url}/rest/v1/rpc/mint_license`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      p_license_key: licenseKey,
      p_plan: opts.tier,
      p_email: opts.email,
      p_machine_id: opts.machineId,
      p_expires_at: expiresAt,
    }),
  });
  if (!res.ok) {
    throw new Error(`mint_license RPC failed: ${res.status} ${await res.text()}`);
  }
  return licenseKey;
}
