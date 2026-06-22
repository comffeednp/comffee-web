import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyLookupToken } from "@/lib/lookup-token";
import { formatPHP, formatDate } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click booking view, served as a PLAIN HTML document from a route handler.
 *
 * Deliberately NOT a React page: no Suspense, no streaming, no loading.tsx
 * fallback, no client hydration. The browser receives the finished HTML in a
 * single response and renders it immediately — so it can never get stuck on a
 * "loading" splash the way the React-streamed /lookup and /b page did.
 */
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function html(inner: string): Response {
  const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your booking · Comffee</title>
<style>
  body{margin:0;background:#0e0b09;color:#f3ece1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;}
  .wrap{max-width:640px;margin:0 auto;padding:48px 20px;}
  .brand{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a7a68;margin-bottom:32px;}
  .dot{color:#ff8a3d;}
  .label{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;letter-spacing:2px;text-transform:uppercase;}
  h1{font-size:34px;font-weight:800;margin:10px 0 6px;color:#fff;}
  .status{font-family:ui-monospace,monospace;font-size:14px;font-weight:700;margin:0 0 28px;}
  .card{border:1px solid #2a241d;background:#15110d;border-radius:16px;overflow:hidden;}
  .row{display:flex;justify-content:space-between;gap:16px;padding:14px 20px;border-top:1px solid #221d17;}
  .row:first-child{border-top:0;}
  .row .k{color:#8a7a68;font-family:ui-monospace,monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;}
  .row .v{text-align:right;}
  .hl{color:#ff8a3d;font-size:20px;font-weight:800;}
  .note{color:#b9ad9c;font-size:14px;line-height:1.6;margin:24px 0;}
  .btns{margin-top:28px;display:flex;flex-wrap:wrap;gap:12px;}
  a.btn{display:inline-block;background:#ff8a3d;color:#0e0b09;font-weight:800;text-decoration:none;padding:13px 24px;border-radius:10px;}
  a.btn2{display:inline-block;border:1px solid #2a241d;color:#b9ad9c;text-decoration:none;padding:13px 24px;border-radius:10px;font-family:ui-monospace,monospace;font-size:13px;text-transform:uppercase;letter-spacing:1px;}
  .id{margin-top:28px;font-family:ui-monospace,monospace;font-size:11px;color:#6b6055;word-break:break-all;}
</style></head>
<body><div class="wrap"><div class="brand">COMFFEE<span class="dot">●</span> drink and play</div>${inner}</div></body></html>`;
  return new Response(doc, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = new URL(request.url).searchParams.get("t");

  if (!verifyLookupToken(id, token)) {
    return html(`<p class="label" style="color:#ff8a3d">// link expired</p>
      <h1>This booking link isn't valid</h1>
      <p class="note">For your security the link may have expired. Look up your booking with your reservation ID and the email you used.</p>
      <div class="btns"><a class="btn" href="https://www.comffee.org/lookup">Look up my booking</a></div>`);
  }

  let r: Record<string, unknown> | null = null;
  try {
    const supabase = getSupabaseAdmin();
    const res = await supabase
      .from("reservations")
      .select("id, status, check_in, check_out, num_guests, total_php, payment_type, balance_php, balance_due_date, balance_paid_at, security_deposit_php, guest_name, branch:branches(name)")
      .eq("id", id)
      .maybeSingle();
    r = res.data as Record<string, unknown> | null;
  } catch {
    r = null;
  }

  if (!r) {
    return html(`<p class="label" style="color:#ff8a3d">// not found</p>
      <h1>We couldn't find that booking</h1>
      <div class="btns"><a class="btn" href="https://www.comffee.org/lookup">Look up my booking</a></div>`);
  }

  const branchRaw = r.branch as { name?: string } | Array<{ name?: string }> | null;
  const branch = Array.isArray(branchRaw) ? branchRaw[0] : branchRaw;
  const branchName = branch?.name ?? "Comffee Playcation";
  const confirmed = r.status === "confirmed";
  const balanceDue =
    r.payment_type === "partial" && Number(r.balance_php ?? 0) > 0 && !r.balance_paid_at
      ? Number(r.balance_php) : 0;
  const row = (k: string, v: string, hl = false) =>
    `<div class="row"><span class="k">${esc(k)}</span><span class="v${hl ? " hl" : ""}">${esc(v)}</span></div>`;

  return html(`<p class="label" style="color:#54d98c">// playcation_booking</p>
    <h1>${esc(branchName)}</h1>
    <p class="status" style="color:${confirmed ? "#54d98c" : "#ff8a3d"}">${confirmed ? "▶ CONFIRMED" : r.status === "pending_hold" ? "◔ HOLD ACTIVE" : "· " + esc(r.status)}</p>
    <div class="card">
      ${row("Guest", String(r.guest_name ?? "—"))}
      ${row("Check-in", formatDate(r.check_in as string))}
      ${row("Check-out", formatDate(r.check_out as string))}
      ${row("Guests", String(r.num_guests ?? 1))}
      ${row("Reservation fee paid", formatPHP(Number(r.total_php ?? 0)), true)}
      ${balanceDue > 0 ? row(`Balance due${r.balance_due_date ? ` (${formatDate(r.balance_due_date as string)})` : ""}`, formatPHP(balanceDue)) : ""}
      ${Number(r.security_deposit_php ?? 0) > 0 ? row("Security deposit", formatPHP(Number(r.security_deposit_php))) : ""}
    </div>
    ${balanceDue > 0 ? `<p class="note">Your dates are locked. Settle the remaining balance anytime from your account${r.balance_due_date ? ` by ${esc(formatDate(r.balance_due_date as string))}` : ""}.</p>` : ""}
    <div class="btns">
      <a class="btn" href="https://www.comffee.org/account">Manage booking</a>
      <a class="btn2" href="https://www.comffee.org">Message us</a>
    </div>
    <p class="id">// id: ${esc(r.id)}</p>`);
}
