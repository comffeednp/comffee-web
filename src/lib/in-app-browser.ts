/**
 * In-app (embedded) browser detection.
 *
 * WHY: Google blocks OAuth sign-in inside embedded webviews (Messenger, Facebook, Instagram, etc.)
 * with "Error 403: disallowed_useragent" ("Use secure browsers" policy). Most Comffee traffic arrives
 * via Messenger links, so a customer who taps a booking link inside Messenger hits a Google wall and
 * cannot sign in. We detect these in-app browsers to (a) warn the user to open the page in a real
 * browser, and (b) surface an email sign-in that works inside the webview.
 *
 * SSR-friendly: pass the `user-agent` request header on the server (no client flash). A matching client
 * helper (`isInAppBrowserClient`) is provided for client components that only have `navigator`.
 */

export type InAppBrowser = { inApp: boolean; name?: string };

// Ordered most-specific → generic. Names are user-facing (shown in the banner).
const PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/FBAN|FBAV|FB_IAB|FBIOS|Messenger/i, "Facebook / Messenger"],
  [/Instagram/i, "Instagram"],
  [/\bLine\//i, "LINE"],
  [/BytedanceWebview|musical_ly|TikTok/i, "TikTok"],
  [/Snapchat/i, "Snapchat"],
  [/Twitter|\bX11\b.*Mobile/i, "X (Twitter)"],
  [/\bGSA\//i, "Google app"],
];

/** Detect an embedded in-app browser from a User-Agent string (server or client). */
export function isInAppBrowser(ua: string | null | undefined): InAppBrowser {
  if (!ua) return { inApp: false };
  for (const [re, name] of PATTERNS) {
    if (re.test(ua)) return { inApp: true, name };
  }
  return { inApp: false };
}

/** Client-side convenience: reads navigator.userAgent. Returns {inApp:false} during SSR. */
export function isInAppBrowserClient(): InAppBrowser {
  if (typeof navigator === "undefined") return { inApp: false };
  return isInAppBrowser(navigator.userAgent);
}
