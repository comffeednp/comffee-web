"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

/**
 * Server-action form button with a pending state: disables and shows a spinner
 * the moment it's pressed, until the action's redirect re-renders the page.
 * Admin actions (resend confirmation, cancel, manual confirm) take seconds —
 * emails + several DB writes — and a bare <form action> gives zero feedback in
 * that window, which reads as a dead button and invites double-clicks
 * (owner 2026-07-02).
 */
export default function ActionSubmitButton({
  action,
  fields,
  className,
  title,
  pendingLabel,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** Hidden inputs to submit, e.g. { id, reason } */
  fields: Record<string, string>;
  className?: string;
  title: string;
  /** Label shown next to the spinner while the action runs. */
  pendingLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <form action={action} className="inline">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <PendingButton className={className} title={title} pendingLabel={pendingLabel}>
        {children}
      </PendingButton>
    </form>
  );
}

/** Must be a child of the form — useFormStatus reads the nearest parent form. */
function PendingButton({
  className,
  title,
  pendingLabel,
  children,
}: {
  className?: string;
  title: string;
  pendingLabel?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      title={title}
      className={className}
      disabled={pending}
      aria-busy={pending}
      style={pending ? { opacity: 0.55, cursor: "wait" } : undefined}
    >
      {pending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {pendingLabel ?? "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}
