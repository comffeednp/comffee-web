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
import PCTierEditor from "@/components/admin/PCTierEditor";
import AmenitiesList from "@/components/admin/AmenitiesList";
import AddAmenityForm from "@/components/admin/AddAmenityForm";
import RatesList from "@/components/admin/RatesList";
import PendingBranchEditPanel from "@/components/admin/PendingBranchEditPanel";
import BranchPhotosManager from "@/components/admin/BranchPhotosManager";
import { ArrowLeft, Plus, Save, Trash2, ExternalLink } from "lucide-react";
import type {
  Branch,
  BranchAmenity,
  BranchPhoto,
  BranchRate,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}

export default async function EditBranchPage({ params, searchParams }: Props) {
  await requireFullAdmin();
  const { id } = await params;
  const { ok, error } = await searchParams;

  const supabase = await getSupabaseServer();
  // Pending POS submissions are read with the FULL-ACCESS connection (service role). The page is
  // already locked to admins (requireFullAdmin above), and branch_edit_submissions' row-security
  // blocks the anon+session connection used for the public-facing tables — so reading the pending
  // list with `supabase` returned ZERO even when rows existed, leaving the approval panel silently
  // empty (owner-reported 2026-05-30: 7 pending in the data, none shown). Approve/Reject already use
  // service role, so seeing the list was the only broken link.
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
    // Stage 4a: pending POS-submitted page edits — admin approves/rejects inline below.
    // Uses `admin` (service role), NOT `supabase` — see note above.
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
  // Stage 4a: pending POS-submitted page edits for this branch (typically zero — only present
  // when an owner pressed "Send for approval" from the POS Reservation tab since the last review).
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

      {/* Stage 4a: pending submissions from the POS Reservation tab — empty when nothing pending. */}
      <div className="mt-6">
        <PendingBranchEditPanel submissions={pendingSubmissions} />
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
          isPlaycation={branch.type === "playcation"}
          updateAction={updateRateAction}
          deleteAction={deleteRateAction}
        />
        <form action={addRateAction} className="mt-5 space-y-3">
          <input type="hidden" name="branch_id" value={branch.id} />
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_2fr_auto]">
            <input name="category" placeholder="category" className="admin-input" defaultValue={branch.type === "playcation" ? "playcation" : "internet"} />
            <input name="label" placeholder="Label *" required className="admin-input" />
            <input name="price_php" type="number" step="0.01" placeholder="price" required className="admin-input" />
            <input name="unit" placeholder="unit" defaultValue={branch.type === "playcation" ? "night" : "hour"} className="admin-input" />
            <input name="description" placeholder="Description" className="admin-input" />
            <button type="submit" title="Add this rate to the branch" className="key-cap !py-2 !px-3">
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
          {/* Check-in/out time = Playcation (overnight stay) only. Internet-cafe rates are hourly, so
              these are hidden for cafe branches (owner 2026-05-30: "cafe ≠ playcation"). */}
          {branch.type === "playcation" && (
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
          )}
          {branch.type === "playcation" && (
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
          )}
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

      {/* PC STATIONS — only show for cafe branches */}
      {branch.type === "cafe" && (
        <Section
          id="pc-stations"
          title="PC stations"
          subtitle={`${pcStations.length} synced from PanCafe`}
        >
          <p className="mb-4 text-sm text-cream-dim">
            Tag each station as Regular or VIP so the reservation form shows the right rates. Run the <code className="text-amber">pancafe-sync</code> script on the cafe server if no stations appear here.
          </p>
          <PCTierEditor branchId={branch.id} stations={pcStations} />
        </Section>
      )}

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
    </section>
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
