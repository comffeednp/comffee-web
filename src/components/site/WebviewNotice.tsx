"use client";

import { useState } from "react";
import { ExternalLink, Copy, Check } from "lucide-react";

/**
 * Shown when the page is opened inside an in-app browser (Messenger/Facebook/Instagram/etc.), where
 * Google blocks OAuth ("Error 403: disallowed_useragent"). Tells the customer how to escape to a real
 * browser and offers a one-tap "Copy link". The server decides whether to render this (UA header);
 * this component handles the copy interaction.
 */
export default function WebviewNotice({ appName }: { appName?: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      return;
    } catch {
      // Clipboard API is often blocked inside in-app browsers → fall back to a temp textarea.
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* give up silently — the instructions still tell them how to open in a browser */
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-amber/40 bg-amber/10 p-4 text-left">
      <p className="flex items-center gap-2 text-sm font-bold text-amber">
        <ExternalLink className="h-4 w-4 shrink-0" />
        Open in your browser to sign in
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-cream-dim">
        You&apos;re viewing this inside {appName ? `${appName}'s` : "an app's"} in-app browser, where
        Google sign-in is blocked. Tap the <span className="font-bold text-cream">⋯</span> menu (top
        corner) and choose <span className="font-bold text-cream">&ldquo;Open in Chrome&rdquo;</span> or{" "}
        <span className="font-bold text-cream">&ldquo;Open in Safari&rdquo;</span> — or just sign in with
        email below.
      </p>
      <button
        type="button"
        onClick={copyLink}
        title="Copy this page's link so you can paste it into Chrome or Safari"
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-line-bright bg-bg-card px-3 py-2 text-xs font-bold text-cream transition hover:border-amber"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-amber" /> Link copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" /> Copy link
          </>
        )}
      </button>
    </div>
  );
}
