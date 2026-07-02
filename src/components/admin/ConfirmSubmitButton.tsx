"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

/**
 * A server-action form button guarded by a native confirm() — used for the
 * request-to-book Accept/Reject controls. Reject triggers an instant refund, so
 * a misclick must not fire it. Accept also passes through a confirm so the owner
 * deliberately commits the booking. Passing the server action down as a prop is
 * supported (server actions are valid client-component props).
 *
 * Disables with a spinner while the action runs — these actions send emails and
 * hit PayMongo, so the seconds of silence otherwise read as a dead button.
 */
export default function ConfirmSubmitButton({
  action,
  id,
  reason,
  confirmText,
  className,
  title,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  reason?: string;
  confirmText: string;
  className?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      {reason !== undefined && <input type="hidden" name="reason" value={reason} />}
      <GuardedPendingButton confirmText={confirmText} className={className} title={title}>
        {children}
      </GuardedPendingButton>
    </form>
  );
}

/** Must be a child of the form — useFormStatus reads the nearest parent form. */
function GuardedPendingButton({
  confirmText,
  className,
  title,
  children,
}: {
  confirmText: string;
  className?: string;
  title: string;
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
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {pending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Working…
        </>
      ) : (
        children
      )}
    </button>
  );
}
