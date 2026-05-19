import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Register an FCM device token for the current admin. The token is sent
 * from the client after Firebase Messaging successfully gets one. We don't
 * actually use Firebase JS SDK on the client in this MVP — admins enable
 * notifications via the browser's native Notification API for now, and
 * once Firebase web push is wired up, the token comes here.
 *
 * If FCM isn't configured, we still record the request so the table is
 * populated and ready when env vars arrive.
 */
export async function POST(request: Request) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: admin } = await supabase
    .from("admin_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { fcmToken?: string; deviceLabel?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // For now, accept any token (or generate a placeholder if missing — the
  // device row is still useful for tracking who has notifications enabled).
  const token =
    body.fcmToken ??
    `pending-${admin.id}-${Date.now().toString(36)}`;

  const adminClient = getSupabaseAdmin();
  const { error } = await adminClient
    .from("admin_devices")
    .upsert(
      {
        admin_user_id: admin.id,
        fcm_token: token,
        device_label: body.deviceLabel ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "fcm_token" },
    );
  if (error) {
    return NextResponse.json({ error: "save_failed", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
