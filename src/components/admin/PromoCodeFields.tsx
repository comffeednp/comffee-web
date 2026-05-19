interface PromoCode {
  id?: string;
  code?: string;
  description?: string | null;
  discount_type?: string;
  discount_value?: number;
  applies_to?: string;
  min_amount_php?: number | null;
  max_uses?: number | null;
  valid_from?: string | null;
  valid_until?: string | null;
  is_active?: boolean;
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PromoCodeFields({ promo }: { promo?: PromoCode }) {
  return (
    <div className="space-y-6">
      {promo?.id && <input type="hidden" name="id" value={promo.id} />}

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="code *" hint="Stored uppercase. Example: COFFEE10">
          <input
            name="code"
            defaultValue={promo?.code ?? ""}
            required
            className="form-input uppercase"
            placeholder="COFFEE10"
          />
        </Field>
        <Field label="applies to">
          <select
            name="applies_to"
            defaultValue={promo?.applies_to ?? "both"}
            className="form-input"
          >
            <option value="both">Both</option>
            <option value="order">Menu orders only</option>
            <option value="reservation">Playcation bookings only</option>
          </select>
        </Field>
      </div>

      <Field label="description / creator notes" hint="Internal use — log the creator's name/handle here for collab tracking (e.g. '@creator_name — 20% off, valid 30 days')">
        <input
          name="description"
          defaultValue={promo?.description ?? ""}
          className="form-input"
          placeholder="e.g. @creator_name collab — 20% off Playcation"
        />
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="discount type">
          <select
            name="discount_type"
            defaultValue={promo?.discount_type ?? "percent"}
            className="form-input"
          >
            <option value="percent">Percent off</option>
            <option value="fixed">Fixed peso amount off</option>
          </select>
        </Field>
        <Field label="discount value *" hint="A number — 10 = 10% or ₱10 depending on type">
          <input
            name="discount_value"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={promo?.discount_value ?? 0}
            className="form-input"
          />
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="minimum order amount (₱)">
          <input
            name="min_amount_php"
            type="number"
            step="0.01"
            min="0"
            defaultValue={promo?.min_amount_php ?? ""}
            className="form-input"
          />
        </Field>
        <Field label="max uses (blank = unlimited)">
          <input
            name="max_uses"
            type="number"
            min="0"
            defaultValue={promo?.max_uses ?? ""}
            className="form-input"
          />
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="valid from">
          <input
            name="valid_from"
            type="datetime-local"
            defaultValue={toLocalInput(promo?.valid_from)}
            className="form-input"
          />
        </Field>
        <Field label="valid until">
          <input
            name="valid_until"
            type="datetime-local"
            defaultValue={toLocalInput(promo?.valid_until)}
            className="form-input"
          />
        </Field>
      </div>

      <Field label="active">
        <label className="inline-flex items-center gap-2 text-cream cursor-pointer">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={promo?.is_active ?? true}
            className="h-4 w-4 accent-amber"
          />
          Active (customers can apply this code)
        </label>
      </Field>

      <style>{`
        .form-input {
          width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-line-bright);
          border-radius: 0.5rem;
          padding: 0.625rem 0.875rem;
          color: var(--color-cream);
          font-family: var(--font-mono);
          font-size: 0.9rem;
          color-scheme: dark;
        }
        .form-input:focus {
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
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
        // {label}
      </span>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1 text-[0.7rem] text-mocha">{hint}</p>}
    </label>
  );
}
