import Link from "next/link";
import { requireMember } from "@/lib/auth/require-member";
import { getPublishedBranches } from "@/lib/branches";
import { requestInternetReservationAction } from "../../_actions/reservations";
import { ArrowLeft, Cpu, Power } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewReservationPage({ searchParams }: Props) {
  await requireMember();
  const { error } = await searchParams;
  const branches = await getPublishedBranches("cafe");

  // Default times: tonight 7pm → 11pm
  const today = new Date();
  const start = new Date(today);
  start.setHours(19, 0, 0, 0);
  const end = new Date(today);
  end.setHours(23, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  return (
    <section className="container-edge py-12 max-w-2xl">
      <Link
        href="/account"
        title="Back to your account"
        className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to account
      </Link>

      <div className="mt-6">
        <p className="terminal-label">/reservations/new</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
          Request a station
        </h1>
        <p className="mt-2 text-sm text-cream-dim">
          Tell us when and where. Staff will confirm and start the timer when you arrive — pay onsite.
        </p>
      </div>

      {error && (
        <p className="mt-6 font-mono text-xs text-red-400">// {error.replaceAll("_", " ")}</p>
      )}

      <form action={requestInternetReservationAction} className="mt-10 space-y-6">
        <Field label="branch *">
          <select name="branch_id" required className="form-input">
            <option value="">— pick a branch —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.city ?? "—"})
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="station label *"
          hint="What station do you want? (e.g. ‘PC 1’, ‘Pro rig’, ‘Window seat’)"
        >
          <input
            type="text"
            name="station_label"
            required
            placeholder="PC 1"
            className="form-input"
          />
        </Field>

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="from *">
            <input
              type="datetime-local"
              name="requested_start"
              required
              defaultValue={fmt(start)}
              className="form-input"
            />
          </Field>
          <Field label="until *">
            <input
              type="datetime-local"
              name="requested_end"
              required
              defaultValue={fmt(end)}
              className="form-input"
            />
          </Field>
        </div>

        <Field label="notes">
          <textarea
            name="notes"
            rows={3}
            className="form-input resize-y"
            placeholder="Anything we should know? Game preferences, peripherals, etc."
          />
        </Field>

        <button type="submit" title="Submit station reservation request" className="key-cap key-cap-primary">
          <Power className="h-4 w-4" />
          Submit request
        </button>

        <div className="mt-8 p-5 border border-line rounded-lg bg-bg-soft flex items-start gap-3">
          <Cpu className="h-4 w-4 text-amber mt-0.5 shrink-0" />
          <p className="text-sm text-cream-dim">
            This is a request, not a confirmed booking. Staff will confirm or suggest an alternative slot. You&apos;ll get an in-app status update.
          </p>
        </div>
      </form>

      <style>{`
        .form-input {
          width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-line-bright);
          border-radius: 0.5rem;
          padding: 0.75rem 1rem;
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
    </section>
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
