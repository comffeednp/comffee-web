import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { provisionBranch, ProvisionError } from "@/lib/provisioning";

export const runtime = "nodejs";

// Self-serve branch provisioning, called by the POS after a PanCafe/AI cafe activates and submits
// its details. Creates (once, idempotently) the website branch + the license→branch seating mapping,
// and returns the branch id + slug so the POS can finish local setup (rates, attendance QR).
//
// Auth = possession of a valid, active, branched-tier license bound to the calling machine (checked
// in authorizeProvision against the LICENSE project). No user session — the cafe isn't signed in.
//   -> { branchId, slug, created, isPublished }
const LICENSE_RE = /^CMFE(-[A-Z0-9]{4}){3}$/i;

export async function POST(req: NextRequest) {
  let body: {
    licenseKey?: string;
    machineId?: string;
    name?: string;
    city?: string;
    address?: string;
    lat?: number | string;
    lng?: number | string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const licenseKey = String(body.licenseKey ?? "").trim().toUpperCase();
  const machineId = body.machineId ? String(body.machineId) : null;
  const name = String(body.name ?? "").trim();

  if (!LICENSE_RE.test(licenseKey)) {
    return NextResponse.json({ error: "invalid_license" }, { status: 400 });
  }
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  const rl = checkRateLimit(`provision-branch:${machineId ?? licenseKey}`, 12, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  // Coordinates are optional; accept only sane values, drop anything else to null.
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : v != null ? parseFloat(String(v)) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  let lat = num(body.lat);
  let lng = num(body.lng);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    lat = null;
    lng = null;
  }

  try {
    const result = await provisionBranch({
      licenseKey,
      machineId,
      name,
      city: body.city ? String(body.city).trim().slice(0, 80) : null,
      address: body.address ? String(body.address).trim().slice(0, 200) : null,
      lat,
      lng,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ProvisionError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    console.error("[provision] failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "provision_failed" }, { status: 500 });
  }
}
