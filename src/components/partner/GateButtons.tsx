"use client";

// Pending-aware buttons for the attendance sign-in screens. The sign-in / switch-account
// buttons submit SERVER ACTIONS (Google OAuth redirect, sign-out) which take a round-trip —
// without feedback the page looks frozen ("feels like the site crashed"). These show a
// spinner + disable on press so it's obvious something is happening.
import { useFormStatus } from "react-dom";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export function SubmitButton({
  children,
  pendingText,
  className,
  title,
}: {
  children: React.ReactNode;
  pendingText: string;
  className: string;
  title: string;
}) {
  // useFormStatus reads the pending state of the parent <form>'s action. Must be rendered
  // INSIDE the form (it is, in page.tsx).
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      aria-busy={pending}
      className={`${className} disabled:cursor-wait disabled:opacity-70`}
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {pendingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

// "Continue" is a navigation link (to ?go=1) which also reloads + boots the map — show a
// spinner on tap so it doesn't feel dead during that load.
export function LoadingLink({
  href,
  children,
  pendingText,
  className,
  title,
}: {
  href: string;
  children: React.ReactNode;
  pendingText: string;
  className: string;
  title: string;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <a
      href={href}
      title={title}
      aria-busy={loading}
      onClick={() => setLoading(true)}
      className={`${className} ${loading ? "pointer-events-none cursor-wait opacity-70" : ""}`}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {pendingText}
        </span>
      ) : (
        children
      )}
    </a>
  );
}
