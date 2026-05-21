import Link from "next/link";
import { Download } from "lucide-react";

interface Props {
  entity:
    | "orders"
    | "bookings"
    | "members"
    | "internet-reservations"
    | "contact-submissions";
  label?: string;
}

/**
 * Server-renderable export link. The endpoint streams a CSV with proper
 * Content-Disposition so the browser triggers a download.
 */
export default function ExportButton({ entity, label = "Export CSV" }: Props) {
  return (
    <Link
      href={`/api/admin/export/${entity}`}
      title={`Download ${label}`}
      className="inline-flex items-center gap-2 border border-line-bright rounded-md px-3 py-2 text-[0.7rem] font-mono uppercase tracking-widest text-cream-dim hover:text-amber hover:border-amber/60 transition no-print"
      prefetch={false}
    >
      <Download className="h-3 w-3" />
      {label}
    </Link>
  );
}
