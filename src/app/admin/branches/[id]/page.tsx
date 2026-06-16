import { notFound } from "next/navigation";
import Link from "next/link";
import { requireFullAdmin } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  updateBranchAction,
  deleteBranchAction,
  addAmenityAction,
  updateAmenityAction,
  deleteAmenityAction,
  addRateAction,
  updateRateAction,
  deleteRateAction,
  addPhotosAction,
  deletePhotoAction,
  reorderPhotosAction,
  uploadInstructionPhotosAction,
  deleteInstructionPhotoAction,
} from "../../_actions/branches";
import { listInstructionPhotos } from "@/lib/branch-instructions";
import BranchCoreFields from "@/components/admin/BranchCoreFields";
import ImageUpload from "@/components/admin/ImageUpload";
import AmenitiesList from "@/components/admin/AmenitiesList";
import AddAmenityForm from "@/components/admin/AddAmenityForm";
import RatesList from "@/components/admin/RatesList";
import PendingBranchEditPanel from "@/components/admin/PendingBranchEditPanel";
import BranchPhotosManager from "@/components/admin/BranchPhotosManager";
import BranchBrandForm from "@/components/admin/BranchBrandForm";
import { ArrowLeft, Plus, Save, Trash2, ExternalLink } from "lucide-react";
import { formatPHP } from "@/lib/utils";
import type { Branch, BranchAmenity, BranchPhoto, BranchRate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

// TWO MODES, chosen by branch.type — because the two kinds of branch have two different editing homes:
//
//   • CAFE (internet cafe) → VIEW + APPROVE ONLY. It HAS a POS, and the POS Reservation tab is the
//     single place to edit the public look. Owner 2026-05-30: "the website look should only be edited
//     thru the POS, not the website admin, to avoid duplication." So here we only Approve/Reject the
//     POS's submissions and show a read-only view.
//
//   • PLAYCATION (overnight stay) → FULL EDITOR. It has NO POS, so the website admin IS the only place
//     to manage its public look. Stripping the editor (the 2026-05-30/05-31 "edit on the POS" change)
//     accidentally applied to playcation too and left these venues with no way to edit — owner-reported
//     2026-06-03 ("the details in the admin page is gone"). The editor is restored for this type only.
//
// Connected: the POS submit flow (admin-dashboard.html) feeds the cafe Approve/Reject panel; the public
// branch page reads photos[0] as its header/OG image for both types.

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}

type InstructionPhoto = Awaited<ReturnType<typeof listInstructionPhotos>>[number];
type PCStation = {
  id: string;
  station_name: string;
  is_occupied: boolean;
  pc_tier: string | null;
  last_synced_at: string;
};
type PendingSubmission = {
  id: string;
  submitted_at: string;
  submitted_by: string | null;
  payload: Record<string, unknown>;
};

export default async function BranchAdminPage({ params, searchParams }: Props) {
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
  const pcStations = (stationsRes.data ?? []) as PCStation[];
  const pendingSubmissions = (pendingRes.data ?? []) as PendingSubmission[];

  const isPlaycation = branch.type === "playcation";

  return (
    <section className="container-edge py-12 max-w-5xl">
      <Link href="/admin/branches" className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber" title="Back to all branches">
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

      {ok && (
        <p className="mt-6 font-mono text-xs text-phosphor">// saved at {new Date().toLocaleTimeString()}</p>
      )}
      {error && (
        <p className="mt-6 font-mono text-xs text-red-400">// {error}</p>
      )}

      {/* BRAND GROUPING — website-only, editable here (the POS has no concept of it). Only partner
          cafes use it: branches sharing a brand collapse into one card on /partners. */}
      {branch.type === "partner_cafe" && <BranchBrandForm branch={branch} />}

      {isPlaycation ? (
        <PlaycationEditor
          branch={branch}
          amenities={amenities}
          rates={rates}
          photos={photos}
          instructionPhotos={instructionPhotos}
        />
      ) : (
        <CafeViewApprove
          branch={branch}
          amenities={amenities}
          rates={rates}
          photos={photos}
          pcStations={pcStations}
          pendingSubmissions={pendingSubmissions}
          instructionPhotos={instructionPhotos}
        />
      )}
    </section>
  );
}

/* ============================================================================================
   PLAYCATION — full editor (no POS exists for this type, so the website admin owns the look).
   ============================================================================================ */
function PlaycationEditor({
  branch,
  amenities,
  rates,
  photos,
  instructionPhotos,
}: {
  branch: Branch;
  amenities: BranchAmenity[];
  rates: BranchRate[];
  photos: BranchPhoto[];
  instructionPhotos: InstructionPhoto[];
}) {
  return (
    <>
      <div className="mt-6 p-4 border border-phosphor/40 bg-phosphor/5 rounded-lg">
        <p className="font-mono text-[0.7rem] uppercase tracking-widest text-phosphor">// edit here</p>
        <p className="mt-2 text-sm text-cream-dim">
          This is a <b>Playcation</b> venue — it has no POS, so its public look (name, photos, rates,
          amenities) is managed right here on the website. Changes go live as soon as you save.
        </p>
      </div>

      {/* CORE FIELDS */}
      <form id="branch-core-form" action={updateBranchAction} className="mt-10 space-y-8">
        <BranchCoreFields branch={branch} />
      </form>

      {/* AMENITIES */}
      <Section id="amenities" title="Amenities" subtitle={`${amenities.length} listed`}>
        <AmenitiesList
          amenities={amenities}
          branchId={branch.id}
          updateAction={updateAmenityAction}
          deleteAction={deleteAmenityAction}
        />
        <AddAmenityForm
          branchId={branch.id}
          nextOrder={amenities.length}
          addAction={addAmenityAction}
        />
      </Section>

      {/* RATES */}
      <Section id="rates" title="Rates" subtitle={`${rates.length} listed`}>
        <RatesList
          rates={rates}
          branchId={branch.id}
          isPlaycation
          updateAction={updateRateAction}
          deleteAction={deleteRateAction}
        />
        <form action={addRateAction} className="mt-5 space-y-3">
          <input type="hidden" name="branch_id" value={branch.id} />
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_2fr_auto]">
            <input name="category" placeholder="category" className="admin-input" defaultValue="playcation" />
            <input name="label" placeholder="Label *" required className="admin-input" />
            <input name="price_php" type="number" step="0.01" placeholder="price" required className="admin-input" />
            <input name="unit" placeholder="unit" defaultValue="night" className="admin-input" />
            <input name="description" placeholder="Description" className="admin-input" />
            <button type="submit" title="Add this rate to the branch" className="key-cap !py-2 !px-3">
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// check-in time (24h, e.g. 14:00)</p>
              <input name="check_in_time" type="text" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="14:00" className="admin-input" />
            </div>
            <div>
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// check-out time (24h, e.g. 12:00)</p>
              <input name="check_out_time" type="text" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="12:00" className="admin-input" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// max pax included in base rate</p>
              <input name="max_pax" type="number" min="1" placeholder="e.g. 2 (blank = no limit)" className="admin-input" />
            </div>
            <div>
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// max guests allowed (hard cap)</p>
              <input name="max_guests" type="number" min="1" placeholder="e.g. 4 (blank = no limit)" className="admin-input" />
            </div>
            <div>
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// extra fee per additional pax (₱)</p>
              <input name="extra_pax_fee_php" type="number" step="0.01" min="0" placeholder="e.g. 300 per extra guest" className="admin-input" />
            </div>
          </div>
        </form>
      </Section>

      {/* PHOTOS */}
      <Section id="photos" title="Photos" subtitle={`${photos.length} in gallery`}>
        {/* Drag-to-reorder gallery. The FIRST photo is the public front/header photo (owner 2026-05-30).
            key on the id-order so a successful save remounts with the canonical server order. */}
        <BranchPhotosManager
          key={photos.map((p) => p.id).join(",")}
          photos={photos}
          branchId={branch.id}
          reorderAction={reorderPhotosAction}
          deleteAction={deletePhotoAction}
        />
        <form action={addPhotosAction} className="mt-5 space-y-3 p-5 border border-line rounded-lg bg-bg">
          <input type="hidden" name="branch_id" value={branch.id} />
          <input type="hidden" name="sort_order_start" value={photos.length} />
          <ImageUpload
            name="public_url"
            folder={`branches/${branch.slug}`}
            multiple
          />
          <button type="submit" title="Upload and add photos to this branch" className="key-cap !py-2 !px-3">
            <Plus className="h-4 w-4" />
            Add photos
          </button>
        </form>
      </Section>

      {/* GUEST INSTRUCTIONS */}
      <Section id="instructions" title="Guest instructions" subtitle="private — sent to confirmed bookings">
        <p className="mb-6 text-sm text-cream-dim">
          Upload the check-in, house-rules, and FAQ sheets for this branch. They&apos;re attached to the booking-confirmation email and shown on the branch page only to guests with a confirmed booking. Door PINs stay private — these are never public. Add as many as you need.
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

      {/* SAVE */}
      <div className="mt-16 pt-10 border-t border-line flex items-center gap-3">
        <button type="submit" form="branch-core-form" title="Save all branch changes" className="key-cap key-cap-primary">
          <Save className="h-4 w-4" />
          Save changes
        </button>
      </div>

      {/* DANGER ZONE */}
      <div className="mt-8 p-6 border border-red-900/50 rounded-xl bg-red-950/10">
        <p className="font-mono text-[0.7rem] uppercase tracking-widest text-red-400">// danger zone</p>
        <p className="mt-3 text-sm text-cream-dim">
          Delete this branch and everything attached (amenities, photos, rates). This is permanent.
        </p>
        <form action={deleteBranchAction} className="mt-4">
          <input type="hidden" name="id" value={branch.id} />
          <button
            type="submit"
            title="Permanently delete this branch and all its data"
            className="inline-flex items-center gap-2 border border-red-700 rounded-md px-4 py-2 text-xs font-mono uppercase tracking-widest text-red-400 hover:bg-red-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete branch
          </button>
        </form>
      </div>

      <style>{`
        .admin-input {
          width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-line-bright);
          border-radius: 0.5rem;
          padding: 0.625rem 0.875rem;
          color: var(--color-cream);
          font-family: var(--font-sans);
          font-size: 0.9rem;
        }
        .admin-input:focus {
          outline: none;
          border-color: var(--color-amber);
          box-shadow: 0 0 0 1px rgba(255,181,71,0.4);
        }
      `}</style>
    </>
  );
}

/* ============================================================================================
   CAFE — view + approve only (the POS Reservation tab is the editing surface for internet cafes).
   ============================================================================================ */
function CafeViewApprove({
  branch,
  amenities,
  rates,
  photos,
  pcStations,
  pendingSubmissions,
  instructionPhotos,
}: {
  branch: Branch;
  amenities: BranchAmenity[];
  rates: BranchRate[];
  photos: BranchPhoto[];
  pcStations: PCStation[];
  pendingSubmissions: PendingSubmission[];
  instructionPhotos: InstructionPhoto[];
}) {
  return (
    <>
      {/* VIEW + APPROVE ONLY — editing the public look lives on the POS now. */}
      <div className="mt-6 p-4 border border-amber/40 bg-amber/5 rounded-lg">
        <p className="font-mono text-[0.7rem] uppercase tracking-widest text-amber">// view &amp; approve only</p>
        <p className="mt-2 text-sm text-cream-dim">
          The public look (name, photos, rates, amenities) is edited on the <b>POS</b> — Reservation tab →
          make your changes → <b>Send for approval</b>. Submissions show below for you to Approve or Reject.
          Editing was removed here so there&apos;s only one place to change things.
        </p>
      </div>

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

      {/* PC STATIONS — read-only. Shows each synced station's Regular/VIP tier; tier changes, if ever
          needed, would move to the POS. */}
      <Section id="pc-stations" title="PC stations" subtitle={`${pcStations.length} synced · read-only`}>
        {pcStations.length === 0 ? (
          <p className="font-mono text-xs text-mocha">// no stations synced yet</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pcStations.map((s) => (
              <li key={s.id} className="border border-line rounded-md bg-bg px-3 py-2 flex items-center justify-between">
                <span className="text-cream text-sm font-medium">{s.station_name}</span>
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha">{s.pc_tier ?? "regular"}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* GUEST INSTRUCTIONS — read-only private sheets. Hidden entirely when there are none (e.g. cafe
          branches like Lagro). */}
      {instructionPhotos.length > 0 && (
        <Section id="instructions" title="Guest instructions" subtitle="private · read-only">
          <p className="mb-6 text-sm text-cream-dim">
            Private sheets attached to confirmed bookings (door PINs etc.). Read-only here.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {instructionPhotos.map((p) => (
              <div key={p.path} className="border border-line-bright bg-bg rounded-xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.signedUrl} alt={p.label} className="w-full h-auto block" />
                <div className="px-3 py-2">
                  <span className="font-mono text-[0.65rem] uppercase tracking-widest text-cream-dim truncate">
                    {p.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
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
