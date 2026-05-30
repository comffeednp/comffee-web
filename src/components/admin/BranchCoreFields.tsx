import type { Branch } from "@/lib/supabase/types";
import ImageUpload from "@/components/admin/ImageUpload";
import LocationPicker from "@/components/admin/LocationPicker";

interface Props {
  branch?: Branch;
}

/**
 * Shared form fields used by both the New Branch and Edit Branch pages.
 * Server-rendered — relies on `name=` attributes that the parent server
 * action consumes via FormData.
 */
export default function BranchCoreFields({ branch }: Props) {
  return (
    <div className="space-y-6">
      {branch && <input type="hidden" name="id" value={branch.id} />}

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Name" required>
          <input name="name" defaultValue={branch?.name} required className="admin-input" />
        </Field>
        <Field label="Slug (URL)" hint="Lower-case, dash-separated. Auto-generated from name if blank.">
          <input name="slug" defaultValue={branch?.slug} className="admin-input" placeholder="main-station" />
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Field label="Type">
          <select name="type" defaultValue={branch?.type ?? "cafe"} className="admin-input">
            <option value="cafe">Internet cafe</option>
            <option value="playcation">Playcation stay</option>
          </select>
        </Field>
        <Field label="Max guests" hint="Hard capacity limit shown to guests (blank = no limit)">
          <input
            type="number"
            name="max_guests"
            min={1}
            defaultValue={branch?.max_guests ?? ""}
            placeholder="e.g. 6"
            className="admin-input"
          />
        </Field>
        <Field label="Sort order" hint="Lower numbers appear first">
          <input
            type="number"
            name="sort_order"
            defaultValue={branch?.sort_order ?? 999}
            className="admin-input"
          />
        </Field>
      </div>

      {(!branch || branch.type === "playcation") && (
        <Field
          label="Booking cutoff time"
          hint="After this time, today's date is blocked from new bookings. Leave blank to disallow same-day bookings entirely."
        >
          <input
            type="time"
            name="booking_cutoff_time"
            defaultValue={branch?.booking_cutoff_time ?? ""}
            className="admin-input"
          />
        </Field>
      )}

      <Field label="Tagline" hint="One-sentence description shown on cards and the hero">
        <input name="tagline" defaultValue={branch?.tagline ?? ""} className="admin-input" />
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Address">
          <input name="address" defaultValue={branch?.address ?? ""} className="admin-input" />
        </Field>
        <Field label="City">
          <input name="city" defaultValue={branch?.city ?? ""} className="admin-input" />
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Phone">
          <input name="phone" defaultValue={branch?.phone ?? ""} className="admin-input" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={branch?.email ?? ""} className="admin-input" />
        </Field>
      </div>

      <Field label="Location" hint="Click the map to drop a pin. Drag the pin to adjust.">
        <LocationPicker defaultLat={branch?.lat} defaultLng={branch?.lng} />
      </Field>

      <Field label="Hours" hint="Plain text — e.g. ‘Mon-Sun · 8am → 4am’">
        <input name="hours_text" defaultValue={branch?.hours_text ?? ""} className="admin-input" />
      </Field>

      <Field label="Backup front photo" hint="Used only if this branch has NO gallery photos. Normally your FIRST gallery photo (Photos section below) is the front/header image.">
        <ImageUpload
          name="hero_image_url"
          defaultValue={branch?.hero_image_url ?? ""}
          folder="branches"
        />
      </Field>

      <Field label="Description (markdown OK)" hint="Shown in the ‘story’ section of the public branch page">
        <textarea
          name="description_md"
          defaultValue={branch?.description_md ?? ""}
          rows={6}
          className="admin-input resize-y"
        />
      </Field>

      {branch && (
        <Field label="Publish status">
          <label className="inline-flex items-center gap-2 text-cream cursor-pointer">
            <input
              type="checkbox"
              name="is_published"
              defaultChecked={branch.is_published}
              className="h-4 w-4 accent-amber"
            />
            Published (visible on the public site)
          </label>
        </Field>
      )}

      <style>{`
        .admin-input {
          width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-line-bright);
          border-radius: 0.5rem;
          padding: 0.625rem 0.875rem;
          color: var(--color-cream);
          font-family: var(--font-sans);
          font-size: 0.92rem;
          transition: border-color 120ms;
        }
        .admin-input:focus {
          outline: none;
          border-color: var(--color-amber);
          box-shadow: 0 0 0 1px rgba(255,181,71,0.4);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
        // {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </span>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1 text-[0.7rem] text-mocha">{hint}</p>}
    </label>
  );
}
