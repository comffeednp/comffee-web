import Link from "next/link";
import { requireMember } from "@/lib/auth/require-member";
import {
  updateProfileAction,
  changePasswordAction,
  deleteMemberAccountAction,
} from "../_actions/profile";
import { ArrowLeft, Lock, Save, Trash2, User } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ ok?: string; error?: string }>;
}

export default async function ProfilePage({ searchParams }: Props) {
  const member = await requireMember();
  const { ok, error } = await searchParams;

  return (
    <section className="container-edge py-12 max-w-2xl">
      <Link
        href="/account"
        className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to account
      </Link>

      <div className="mt-6">
        <p className="terminal-label">/profile</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
          Your profile
        </h1>
        <p className="mt-2 text-sm text-cream-dim">
          Update your name, phone, and password. Email is locked — contact us if you need to change it.
        </p>
      </div>

      {ok && <p className="mt-4 font-mono text-xs text-phosphor">// {ok.replaceAll("_", " ")}</p>}
      {error && <p className="mt-4 font-mono text-xs text-red-400">// {error.replaceAll("_", " ")}</p>}

      {/* PROFILE */}
      <form
        action={updateProfileAction}
        className="mt-10 p-6 border border-line-bright bg-bg-card rounded-2xl space-y-5"
      >
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-amber" />
          <p className="terminal-label">// account_details</p>
        </div>

        <Field label="full name *">
          <input
            name="full_name"
            required
            defaultValue={member.full_name}
            className="form-input"
          />
        </Field>
        <Field label="email" hint="Email is read-only — contact support to change it">
          <input
            type="email"
            value={member.email ?? ""}
            disabled
            className="form-input opacity-60 cursor-not-allowed"
          />
        </Field>
        <Field label="phone">
          <input
            type="tel"
            name="phone"
            defaultValue={member.phone ?? ""}
            className="form-input"
            placeholder="+63 9XX XXX XXXX"
          />
        </Field>
        <Field label="member number">
          <input
            value={member.member_number ?? "—"}
            disabled
            className="form-input font-mono opacity-60 cursor-not-allowed"
          />
        </Field>

        <button type="submit" className="key-cap key-cap-primary">
          <Save className="h-4 w-4" />
          Save profile
        </button>
      </form>

      {/* PASSWORD */}
      <form
        action={changePasswordAction}
        className="mt-8 p-6 border border-line-bright bg-bg-card rounded-2xl space-y-5"
      >
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-amber" />
          <p className="terminal-label">// change_password</p>
        </div>
        <Field label="current password *">
          <input
            type="password"
            name="current_password"
            required
            className="form-input"
            autoComplete="current-password"
          />
        </Field>
        <Field label="new password *" hint="At least 8 characters">
          <input
            type="password"
            name="new_password"
            required
            minLength={8}
            className="form-input"
            autoComplete="new-password"
          />
        </Field>
        <Field label="confirm new password *">
          <input
            type="password"
            name="confirm_password"
            required
            minLength={8}
            className="form-input"
            autoComplete="new-password"
          />
        </Field>
        <button type="submit" className="key-cap">
          <Lock className="h-4 w-4" />
          Update password
        </button>
      </form>

      {/* DELETE ACCOUNT */}
      <form
        action={deleteMemberAccountAction}
        className="mt-8 p-6 border border-red-900/50 rounded-2xl bg-red-950/10 space-y-4"
      >
        <p className="font-mono text-[0.7rem] uppercase tracking-widest text-red-400">
          // delete_account (permanent)
        </p>
        <p className="text-sm text-cream-dim">
          This deletes your member profile, all your reservation history, and your login. Cannot be undone. Type <span className="font-mono text-red-400">DELETE</span> to confirm.
        </p>
        <input
          name="confirm"
          placeholder="Type DELETE to confirm"
          className="form-input"
          autoComplete="off"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-2 border border-red-700 rounded-md px-4 py-2 text-xs font-mono uppercase tracking-widest text-red-400 hover:bg-red-950/40"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete my account
        </button>
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
