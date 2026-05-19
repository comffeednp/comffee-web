import Link from "next/link";
import { redirect } from "next/navigation";
import { getMemberOptional } from "@/lib/auth/require-member";
import { memberSignupAction, googleSignInAction } from "../_actions/auth";
import { Power, UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function SignupPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const existing = await getMemberOptional();
  if (existing) redirect("/account");

  return (
    <section className="container-edge py-20 md:py-28 flex justify-center">
      <div className="w-full max-w-md">
        <div className="border border-line-bright bg-bg-elev rounded-2xl p-8 shadow-[0_0_0_1px_rgba(255,181,71,0.06),0_20px_48px_rgba(0,0,0,0.7)]">
          <div className="flex items-center gap-2 mb-2">
            <UserPlus className="h-4 w-4 text-amber" />
            <p className="terminal-label">/signup</p>
          </div>
          <h1 className="font-display text-3xl font-bold text-cream tracking-tight">
            Become a member
          </h1>
          <p className="mt-2 text-sm text-cream-dim">
            Reserve internet cafe stations, track your visits, and skip the line.
          </p>

          {/* Google sign-in */}
          <form action={googleSignInAction} className="mt-8">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 border border-line-bright rounded-lg px-4 py-3 font-mono text-sm text-cream hover:border-amber/50 hover:bg-bg-soft transition"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </form>

          <div className="flex items-center gap-3 mt-6 text-[0.65rem] font-mono text-mocha uppercase tracking-widest">
            <span className="flex-1 h-px bg-line" />
            or email
            <span className="flex-1 h-px bg-line" />
          </div>

          <form action={memberSignupAction} className="mt-6 space-y-5">
            <Field label="full name *">
              <input name="full_name" required className="auth-input" autoComplete="name" />
            </Field>
            <Field label="email *">
              <input
                name="email"
                type="email"
                required
                className="auth-input"
                autoComplete="email"
              />
            </Field>
            <Field label="phone">
              <input
                name="phone"
                type="tel"
                className="auth-input"
                placeholder="+63 9XX XXX XXXX"
                autoComplete="tel"
              />
            </Field>
            <Field label="password *" hint="At least 8 characters">
              <input
                name="password"
                type="password"
                required
                minLength={8}
                className="auth-input"
                autoComplete="new-password"
              />
            </Field>

            {error && (
              <p className="font-mono text-xs text-red-400">// {error.replaceAll("_", " ")}</p>
            )}

            <button type="submit" className="key-cap key-cap-primary w-full justify-center">
              <Power className="h-4 w-4" />
              Create account
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-cream-dim">
            Already a member?{" "}
            <Link href="/account/login" className="text-amber hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
      <style>{`
        .auth-input {
          width: 100%;
          background: var(--color-bg-soft);
          border: 1px solid var(--color-line-bright);
          border-radius: 0.5rem;
          padding: 0.75rem 1rem;
          color: var(--color-cream);
          font-family: var(--font-mono);
          font-size: 0.9rem;
          color-scheme: dark;
        }
        .auth-input:focus {
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2045c0-.638-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.717v2.2581h2.9087C16.6582 14.0518 17.64 11.8264 17.64 9.2045z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.4673-.8064 5.9564-2.1818l-2.9087-2.2582c-.8064.54-1.8382.8591-3.0477.8591-2.3427 0-4.3282-1.5818-5.0373-3.7091H.9573v2.3318C2.4382 15.9836 5.4818 18 9 18z" fill="#34A853"/>
      <path d="M3.9627 10.71c-.18-.54-.2827-1.1182-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9573A8.9961 8.9961 0 000 9c0 1.4523.3477 2.8282.9573 4.0418L3.9627 10.71z" fill="#FBBC05"/>
      <path d="M9 3.5791c1.3214 0 2.5077.4545 3.4405 1.3473l2.5814-2.5814C13.4632.8918 11.43 0 9 0 5.4818 0 2.4382 2.0164.9573 4.9582L3.9627 7.29C4.6718 5.1627 6.6573 3.5791 9 3.5791z" fill="#EA4335"/>
    </svg>
  );
}
