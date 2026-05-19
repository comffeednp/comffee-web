import crypto from "crypto";

const BASE_URL = "https://api.sumsub.com";

export function isSumsubConfigured(): boolean {
  return !!(process.env.SUMSUB_APP_TOKEN && process.env.SUMSUB_SECRET_KEY);
}

function sign(secretKey: string, ts: string, method: string, path: string, body: string): string {
  return crypto
    .createHmac("sha256", secretKey)
    .update(ts + method + path + body)
    .digest("hex");
}

export async function generateAccessToken(userId: string, levelName: string): Promise<string> {
  const appToken = process.env.SUMSUB_APP_TOKEN!;
  const secretKey = process.env.SUMSUB_SECRET_KEY!;
  const ts = Math.floor(Date.now() / 1000).toString();
  const method = "POST";
  const path = `/resources/accessTokens?userId=${encodeURIComponent(userId)}&levelName=${encodeURIComponent(levelName)}&ttlInSecs=1800`;

  const sig = sign(secretKey, ts, method, path, "");

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "X-App-Token": appToken,
      "X-App-Access-Ts": ts,
      "X-App-Access-Sig": sig,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sumsub token failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { token: string };
  return data.token;
}

// Sumsub sends X-Payload-Digest: sha256=<hex>
export function verifyWebhookSignature(rawBody: string, digestHeader: string): boolean {
  const secretKey = process.env.SUMSUB_SECRET_KEY;
  if (!secretKey) return false;
  const expected = crypto.createHmac("sha256", secretKey).update(rawBody).digest("hex");
  const received = digestHeader.replace(/^sha256=/, "");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}
