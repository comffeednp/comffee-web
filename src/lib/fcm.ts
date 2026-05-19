/**
 * Firebase Cloud Messaging — server-side push delivery.
 *
 * Uses HTTP v1 API + service-account JWT (no Firebase Admin SDK dep needed).
 * Falls back to a no-op when FCM env vars aren't configured, so the rest of
 * the app keeps working in dev / before push is wired up.
 *
 * Required env vars (set per Firebase project):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY  (multi-line PEM, with \n escapes if env tool requires)
 */

import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ChatConversation, ChatMessage } from "@/lib/chat";

function isConfigured(): boolean {
  return !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
}

interface ServiceAccountJWTHeader {
  alg: "RS256";
  typ: "JWT";
}

function base64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (!isConfigured()) throw new Error("FCM not configured");
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);

  const header: ServiceAccountJWTHeader = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(privateKey);
  const jwt = `${unsigned}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`fcm oauth failed: ${res.status} ${txt}`);
  }
  const tok = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: tok.access_token,
    expiresAt: Date.now() + tok.expires_in * 1000,
  };
  return tok.access_token;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  data?: Record<string, string>;
}

/** Send a push to a single device token. */
export async function sendPushToToken(token: string, payload: PushPayload) {
  if (!isConfigured()) return { skipped: true };
  const accessToken = await getAccessToken();
  const projectId = process.env.FIREBASE_PROJECT_ID!;
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const body = {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: {
        url: payload.url ?? "/admin/chat",
        ...(payload.data ?? {}),
      },
      webpush: {
        fcm_options: { link: payload.url ?? "/admin/chat" },
        notification: {
          icon: "/icon-192.png",
          badge: "/icon-192.png",
        },
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`fcm send failed: ${res.status} ${txt}`);
  }
  return res.json();
}

/** Notify every active admin device about a new customer chat message. */
export async function notifyAdminsOfChat(
  conversation: ChatConversation,
  message: ChatMessage,
) {
  if (!isConfigured()) return;
  const supabase = getSupabaseAdmin();
  const { data: devices } = await supabase
    .from("admin_devices")
    .select("fcm_token, admin_user_id");
  if (!devices || devices.length === 0) return;

  const title = conversation.customer_name
    ? `${conversation.customer_name} on chat`
    : "New customer chat";
  const previewBody =
    message.body.length > 100 ? `${message.body.slice(0, 100)}…` : message.body;

  await Promise.allSettled(
    devices.map((d) =>
      sendPushToToken(d.fcm_token as string, {
        title,
        body: previewBody,
        url: `/admin/chat?conversation=${conversation.id}`,
        data: {
          conversationId: conversation.id,
        },
      }),
    ),
  );
}
