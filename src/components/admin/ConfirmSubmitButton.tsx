"use client";

/**
 * A server-action form button guarded by a native confirm() — used for the
 * request-to-book Accept/Reject controls. Reject triggers an instant refund, so
 * a misclick must not fire it. Accept also passes through a confirm so the owner
 * deliberately commits the booking. Passing the server action down as a prop is
 * supported (server actions are valid client-component props).
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
      <button
        type="submit"
        title={title}
        className={className}
        onClick={(e) => {
          if (!window.confirm(confirmText)) e.preventDefault();
        }}
      >
        {children}
      </button>
    </form>
  );
}
