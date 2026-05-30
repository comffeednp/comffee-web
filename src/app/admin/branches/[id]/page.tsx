import { notFound } from "next/navigation";
import Link from "next/link";
import { requireFullAdmin } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadInstructionPhotosAction, deleteInstructionPhotoAction } from "../../_actions/branches";
import { listInstructionPhotos } from "@/lib/branch-instructions";
import PCTierEditor from "@/components/admin/PCTierEditor";
import PendingBranchEditPanel from "@/components/admin/PendingBranchEditPanel";
import { ArrowLeft, Plus, Trash2, ExternalLink } from "lucide-react";
import { formatPHP } from "@/lib/utils";
import type { Branch, BranchAmenity, BranchPhoto, BranchRate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

// VIEW + APPROVE ONLY (owner 2026-05-30: "the website look should only be edited thru the POS, not the
// website admin, to avoid duplication"). This page used to be a full editor that DUPLICATED the POS
// Reservation tab's branch-edit form. The public-look editing (core fields, photos, rates, amenities)
// is removed here — those are now POS-only (edit on the POS → Send for approval → Approve below). What
// stays: the Approve/Reject panel for incoming POS submissions; a READ-ONLY view of the current branch;
// and two OPERATIONAL settings the POS does NOT handle (PC-station tiers + private guest instruction
// photos), which would be uneditable anywhere if removed. Connected: the POS submit flow
// (admin-dashboard.html) is the single editing surface; the public page reads photos[0] as the header.

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}

export default async function ViewBranchPage({ params, searchParams }: Props) {
  await requireFullAdmin();
  const { id } = await params;
  const { ok, error } = await searchParams;

  const supabase = await getSupabaseServer();
  // Pending POS submissions are read with the FULL-ACCESS connection (service role). The page is
  // already locked to admins (requireFullAdmin above), and branch_edit_submissions' row-security
  // blocks the anon+session connection used for the public-facing tables — so reading the pending
  // list with `supabase` returned ZERO even when rows existed, leaving the approval panel silently
  // empty (owner-reported 2026-05-30). Approve/Reject already use service role too.
  const admin = getSupabaseAdmin();
  const [branchRes, amenitiesRes, ratesRes, photosRes, stationsRes, pendingRes] = await Promise.all([
    supabase.from("branches").select("*").eq("id", id).maybeSingle(),
    supabase.from("branch_amenities").select("*").eq("branch_id", id).order("sort_order"),
    supabase.from("branch_rates").select("*").eq("branch_id", id).order("sort_order"),
    supabase.from("branch_photos").select("*").eq("branch_id", id).order("sort_order"),
    supabase
      .from("pc_stations")
      .select("id, station_name, is_occupied, pc_tier, last_synced_at")
      .eq("branch_id", id)
      .order("station_name"),
    admin
      .from("branch_edit_submissions")
      .select("id, submitted_at, submitted_by, payload")
      .eq("branch_id", id)
      .eq("status", "pending")
      .order("submitted_at", { ascending: false }),
  ]);
  const branch = branchRes.data as Branch | null;
  if (!branch) notFound();

  const instructionPhotos = await listInstructionPhotos(branch.id);

  const amenities = (amenitiesRes.data ?? []) as BranchAmenity[];
  const rates = (ratesRes.data ?? []) as BranchRate[];
  const photos = (photosRes.data ?? []) as BranchPhoto[];
  const pcStations = (stationsRes.data ?? []) as Array<{
    id: string;
    station_name: string;
    is_occupied: boolean;
    pc_tier: string | null;
    last_synced_at: string;
  }>;
  const pendingSubmissions = (pendingRes.data ?? []) as Array<{
    id: string;
    submitted_at: string;
    submitted_by: string | null;
    payload: Record<string, unknown>;
  }>;

  return (
    <section className="container-edge py-12 max-w-5xl">
      <Link href="/admin/branches" className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber">
        <ArrowLeft className="h-3 w-3" />
        All branches
      </Link>

      <div className="mt-6 flex items-start justify-between gap-6">
        <div>
          <p className="terminal-label">/branches/{branch.slug}</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
            {branch.name}
          </h1>
        </div>
        <a
          href={`/branches/${branch.slug}`}
          target="_blank"
          rel="noreferrer"
          title="Open this branch's public page in a new tab"
          className="font-mono text-xs uppercase tracking-widest text-amber hover:underline inline-flex items-center gap-1.5 mt-3"
        >
          View on site <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* VIEW + APPROVE ONLY — editing the public look lives on the POS now. */}
      <div className="mt-6 p-4 border border-amber/40 bg-amber/5 rounded-lg">
        <p className="font-mono text-[0.7rem] uppercase tracking-widest text-amber">// view &amp; approve only</p>
        <p className="mt-2 text-sm text-cream-dim">
          The public look (name, photos, rates, amenities) is edited on the <b>POS</b> — Reservation tab →
          make your changes → <b>Send for approval</b>. Submissions show below for you to Approve or Reject.
          Editing was removed here so there&apos;s only one place to change things.
        </p>
      </div>

      {ok && (
        <p className="mt-6 font-mono text-xs text-phosphor">// saved at {new Date().toLocaleTimeString()}</p>
      )}
      {error && (
        <p className="mt-6 font-mono text-xs text-red-400">// {error}</p>
      )}

      {/* APPROVE / REJECT incoming POS submissions */}
      <div className="mt-6">
        <PendingBranchEditPanel submissions={pendingSubmissions} />
      </div>

      {/* CURRENT INFO — read-only */}
      <Section id="info" title="Current info" subtitle="read-only · edit on POS">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 text-sm">
          <ReadRow label="Name" value={branch.name} />
          <ReadRow label="Type" value={branch.type} />
          <ReadRow label="Tagline" value={branch.tagline} />
          <ReadRow label="Address" value={[branch.address, branch.city].filter(Boolean).join(", ")} />
          <ReadRow label="Phone" value={branch.phone} />
          <ReadRow label="Email" value={branch.email} />
          <ReadRow label="Hours" value={branch.hours_text} />
          <ReadRow label="Published" value={branch.is_published ? "Yes — live on site" : "No — hidden"} />
        </dl>
        {branch.description_md && (
          <div className="mt-5">
            <p className="terminal-label">description</p>
            <p className="mt-1 text-sm text-cream-dim whitespace-pre-wrap">{branch.description_md}</p>
          </div>
        )}
      </Section>

      {/* PHOTOS — read-only (first = front/header) */}
      <Section id="photos" title="Photos" subtitle={`${photos.length} in gallery`}>
        {photos.length === 0 ? (
          <p className="font-mono text-xs text-mocha">// no photos yet — add them on the POS</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((p, i) => (
              <div
                key={p.id}
                className={`relative border rounded-md overflow-hidden bg-bg ${
                  i === 0 ? "border-amber ring-1 ring-amber/50" : "border-line"
                }`}
              >
                {p.public_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.public_url} alt={p.caption ?? ""} className="w-full aspect-[4/3] object-cover" />
                )}
                {i === 0 && (
                  <div className="absolute top-2 left-2 bg-amber text-black font-mono text-[0.6rem] font-bold uppercase tracking-widest px-2 py-1 rounded">
                    ★ Front photo
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* RATES — read-only */}
      <Section id="rates" title="Rates" subtitle={`${rates.length} listed`}>
        {rates.length === 0 ? (
          <p className="font-mono text-xs text-mocha">// no rates yet</p>
        ) : (
          <ul className="space-y-2">
            {rates.map((r) => (
              <li key={r.id} className="border border-line rounded-md bg-bg p-3">
                <div className="text-cream font-medium">{r.label}</div>
                <div className="font-mono text-xs text-mocha">
                  {r.category} · {formatPHP(r.price_php)}/{r.unit}
                  {r.max_pax != null && <> · up to {r.max_pax} pax</>}
                  {r.max_guests != null && <> · max {r.max_guests} guests</>}
                  {branch.type === "playcation" && (r.check_in_time || r.check_out_time) && (
                    <> · {r.check_in_time ?? "—"} → {r.check_out_time ?? "—"}</>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* AMENITIES — read-only */}
      <Section id="amenities" title="Amenities" subtitle={`${amenities.length} listed`}>
        {amenities.length === 0 ? (
          <p className="font-mono text-xs text-mocha">// none listed</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {amenities.map((a) => (
              <li key={a.id} className="border border-line rounded-md bg-bg p-3">
                <div className="text-cream text-sm font-medium">{a.label}</div>
                {a.description && <div className="text-xs text-cream-dim mt-0.5">{a.description}</div>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* PC STATIONS — operational (NOT public look); the POS doesn't set tiers, so kept editable here. */}
      {branch.type === "cafe" && (
        <Section id="pc-stations" title="PC stations" subtitle={`${pcStations.length} synced · operational`}>
          <p className="mb-4 text-sm text-cream-dim">
            Operational setting (not the public look). Tag each station Regular or VIP so the reservation form shows the right rates. Run the <code className="text-amber">pancafe-sync</code> script on the cafe server if no stations appear.
          </p>
          <PCTierEditor branchId={branch.id} stations={pcStations} />
        </Section>
      )}

      {/* GUEST INSTRUCTIONS — operational/private (NOT public look); POS doesn't handle these. */}
      <Section id="instructions" title="Guest instructions" subtitle="private · operational">
        <p className="mb-6 text-sm text-cream-dim">
          Operational setting (not the public look). Upload the check-in, house-rules, and FAQ sheets — attached to the booking-confirmation email and shown only to guests with a confirmed booking. Door PINs stay private.
        </p>

        {instructionPhotos.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 mb-8">
            {instructionPhotos.map((p) => (
              <div key={p.path} className="border border-line-bright bg-bg rounded-xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.signedUrl} alt={p.label} className="w-full h-auto block" />
                <div className="flex items-center justify-between px-3 py-2 gap-2">
                  <span className="font-mono text-[0.65rem] uppercase tracking-widest text-cream-dim truncate">
                    {p.label}
                  </span>
                  <form action={deleteInstructionPhotoAction}>
                    <input type="hidden" name="branch_id" value={branch.id} />
                    <input type="hidden" name="path" value={p.path} />
                    <button type="submit" title={`Remove ${p.label}`} className="text-red-400 hover:text-red-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-8 font-mono text-xs text-mocha">// no instruction photos yet</p>
        )}

        <form action={uploadInstructionPhotosAction} className="space-y-4">
          <input type="hidden" name="branch_id" value={branch.id} />
          <input
            type="file"
            name="files"
            multiple
            accept="image/*,.heic,.heif"
            className="block text-sm text-cream-dim file:mr-4 file:rounded file:border-0 file:bg-amber file:px-4 file:py-2 file:text-bg file:font-mono file:text-xs"
          />
          <button type="submit" title="Upload instruction photos" className="key-cap key-cap-primary">
            <Plus className="h-4 w-4" />
            Upload photos
          </button>
        </form>
      </Section>
    </section>
  );
}

function ReadRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha">{label}</dt>
      <dd className="text-cream-dim mt-0.5 break-words">{value ? value : "—"}</dd>
    </div>
  );
}

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-16 pt-10 border-t border-line">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <p className="terminal-label">{title.toLowerCase()}</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-cream">{title}</h2>
        </div>
        {subtitle && (
          <span className="font-mono text-[0.7rem] text-mocha uppercase tracking-widest">{subtitle}</span>
        )}
      </div>
      {children}
    </section>
  );
}
