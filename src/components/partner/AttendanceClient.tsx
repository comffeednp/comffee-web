"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, LocateFixed, Loader2, CheckCircle2, XCircle, Clock, ScanFace, Receipt, Camera, QrCode } from "lucide-react";
import type { AttendanceStatus } from "@/lib/supabase/types";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import LivenessCapture, { type LivenessResult } from "./LivenessCapture";

// Live in-store payment QR pushed from the POS the moment the cashier picks GCash (or "Send GCash
// QR" on a split). Filtered server-side by RLS (migration 0037) to this signed-in staffer only.
type ActivePaymentQr = {
  id: string;
  nickname: string;
  amount: number | string;
  qr_image_url: string;
  status: string;
  // 5-minute display countdown (owner 2026-05-29). expires_at = mint time + 5 min.
  expires_at?: string | null;
  created_at?: string | null;
  // Green/red photo result written by the POS after it reads each uploaded photo. last_attempt_ok
  // true = confirmed (row also flips to 'received'); false = retake, with the reason. The row stays
  // 'pending' on a red so the QR + Take Photo button remain on screen.
  last_attempt_at?: string | null;
  last_attempt_ok?: boolean | null;
  last_attempt_reason?: string | null;
};

interface Props {
  slug: string;
  branchName: string;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  geofenceRequired: boolean;
  email: string;
  status: AttendanceStatus;
  enrolled: boolean;
}

// Per-phone identifier for device binding. Created once, kept in localStorage; the
// clock route binds it to the staff on first clock and blocks any other phone after.
function getDeviceToken(): string {
  const KEY = "comffee_attendance_device";
  let t = localStorage.getItem(KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(KEY, t);
  }
  return t;
}

// We load the Google Maps JS API by injecting the script once (no extra npm dep).
// A module-level promise dedupes the load across re-mounts / Strict Mode double-run.
// `geometry` library gives spherical.computeDistanceBetween — no hand-rolled haversine.
declare global {
  interface Window {
    google?: typeof google;
    __gmapsLoading?: Promise<void>;
  }
}

function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__gmapsLoading) return window.__gmapsLoading;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  window.__gmapsLoading = new Promise<void>((resolve, reject) => {
    if (!key) {
      reject(new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"));
      return;
    }
    const s = document.createElement("script");
    // NO &loading=async — with it, google.maps.LatLng/Map aren't ready on script load (you'd have
    // to importLibrary). The classic load makes them available synchronously, which this code uses.
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return window.__gmapsLoading;
}

type Phase = "loading" | "ready" | "error";

// Live shift timer: ms → "1:23:45" (h:mm:ss) or "23:45" (m:ss) under an hour.
function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export default function AttendanceClient({
  branchName,
  lat,
  lng,
  radiusM,
  geofenceRequired,
  slug,
  email,
  status: initialStatus,
  enrolled: initialEnrolled,
}: Props) {
  // Live status/enrolled (start from the server's first read, then kept fresh by polling so
  // a POS-admin approval flips the page to clock-in WITHOUT a manual reload).
  const [status, setStatus] = useState<AttendanceStatus>(initialStatus);
  const [enrolled, setEnrolled] = useState(initialEnrolled);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const branchLatLngRef = useRef<google.maps.LatLng | null>(null);
  const watchIdRef = useRef<number | null>(null);
  // Latest GPS reading, kept for the clock POST (server re-checks the geofence).
  const lastPosRef = useRef<{ lat: number; lng: number; acc: number } | null>(null);

  const [phase, setPhase] = useState<Phase>("loading");
  const [errMsg, setErrMsg] = useState<string>("");
  const [distance, setDistance] = useState<number | null>(null);
  const [inside, setInside] = useState(false);
  const [gpsError, setGpsError] = useState<string>("");
  const [locating, setLocating] = useState(false);
  // Show the "Allow location" button (the location request is tapped, not silent — a
  // user-gesture prompt is far more reliable on mobile and lets us detect a prior block).
  const [needPermission, setNeedPermission] = useState(false);
  // Permission was previously BLOCKED → the browser won't pop the prompt again; the staffer
  // must re-enable it in phone/browser settings. We show platform-specific steps (a website
  // CANNOT open the per-site permission screen itself — browsers forbid it for security).
  const [blocked, setBlocked] = useState(false);
  // Raw GPS line for the debug overlay (?debug) — to confirm the phone is actually
  // returning a fix when the blue dot doesn't show.
  const [gpsDebug, setGpsDebug] = useState<string>("waiting");

  // Clock state for the button + live timer. clockType = the last record's direction;
  // 'clock_in' means they're currently ON shift → button says "Clock Out" + a running timer
  // counting up from clockAt. Otherwise the button says "Clock In".
  const [clockType, setClockType] = useState<string | null>(null);
  const [clockAt, setClockAt] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const isClockedIn = clockType === "clock_in";
  // Whether THIS phone is the registered one. null = still checking; "this" = ok to clock;
  // "other" = a different phone is registered (blocked); "none" = must register this phone.
  const [deviceState, setDeviceState] = useState<"this" | "other" | "none" | null>(null);
  // Reliever: optional "covering for an absent co-worker" on clock-in. coworkers fills from the
  // status poll (approved staff only); coveringFor = the picked staff id ("" = not covering anyone).
  const [coworkers, setCoworkers] = useState<{ id: string; name: string }[]>([]);
  const [coveringFor, setCoveringFor] = useState<string>("");

  // ── Live in-store GCash payment QR (Chunk C) ────────────────────────────────────────────────
  // staffId / branchId arrive from the status route; we need both to scope the Realtime channel.
  // activeQr is set the instant the POS writes a row scoped to this staffer (or null when the row
  // flips to received/cancelled, or when this staffer steps outside the geofence / clocks out).
  const [staffId, setStaffId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [activeQr, setActiveQr] = useState<ActivePaymentQr | null>(null);
  // Online payment (GCash) receipt upload — a working cashier sends receipt photos from here; the
  // POS is pushed each one and records it against their open shift.
  const receiptInputRef = useRef<HTMLInputElement>(null);
  // Second camera input for the full-screen QR card's "Take Photo of Receipt" button. Both inputs
  // are now camera-only (capture="environment" → rear camera straight away; owner 2026-05-29: no
  // gallery, no bulk). They stay SEPARATE only because they're mounted in different places — this
  // one lives inside the QR card (shown only while a QR is active), receiptInputRef lives in the
  // always-clocked-in panel — so each button clicks an input that is guaranteed to be on the page.
  const receiptCameraInputRef = useRef<HTMLInputElement>(null);
  // What the NEXT upload is: kind (gcash / cash_movement) + movement type. Refs (not state) so the
  // file input's onChange reads the value set synchronously when the button was tapped (no stale closure).
  const uploadKindRef = useRef<"gcash" | "cash_movement">("gcash");
  const uploadTypeRef = useRef<"drop" | "pickup" | "expense" | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptMsg, setReceiptMsg] = useState<string>("");
  // Green/red feedback for the QR-flow photo (owner 2026-05-29). "reading" = photo sent, waiting on
  // the till to read it; "rejected" = the till couldn't confirm it (photoReason says why, retake);
  // "idle" = nothing pending (or confirmed — the GREEN card takes over on status 'received').
  const [photoPhase, setPhotoPhase] = useState<"idle" | "reading" | "rejected">("idle");
  const [photoReason, setPhotoReason] = useState<string>("");
  // The last_attempt_at value we've already reacted to — so we show each NEW till verdict exactly
  // once and don't re-fire on unrelated row updates (the timer ticks, etc.).
  const seenAttemptRef = useRef<string | null>(null);
  // Which upload button is currently working ("gcash" | "drop" | "pickup" | "expense") → that button
  // shows a spinner so the tap feels responsive; the others disable.
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  // Cash move (drop/pickup/expense) entered + approved HERE, then pulled into the POS (0031_cash_moves).
  // Replaces the in-POS cash buttons: worker fills amount/reason(+optional photo) → "Request code"
  // emails the owner a 6-digit code → worker types it → approved → POS downloads + records it.
  const cashPhotoInputRef = useRef<HTMLInputElement>(null);
  const [cashType, setCashType] = useState<"drop" | "pickup" | "expense" | null>(null);
  const [cashStep, setCashStep] = useState<"form" | "code">("form");
  const [cashAmount, setCashAmount] = useState("");
  const [cashReason, setCashReason] = useState("");
  const [cashPhoto, setCashPhoto] = useState<File | null>(null);
  const [cashMoveId, setCashMoveId] = useState<string | null>(null);
  const [cashCode, setCashCode] = useState("");
  const [cashBusy, setCashBusy] = useState(false);
  const [cashMsg, setCashMsg] = useState("");

  // Detect the phone so the "blocked" help shows the right steps (iOS vs Android differ, and
  // only Android lets a page open the OS location-settings screen via an intent: URL).
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);

  // Ask for the phone's location. Called from the "Allow location" tap.
  // WHY getCurrentPosition first (not straight to watchPosition): on iOS Safari — and more
  // reliably across Chrome/Brave/Firefox/Edge too — a one-shot getCurrentPosition fired inside a
  // user gesture is what actually pops the native Allow/Deny dialog. watchPosition alone often
  // does NOT show the prompt on iOS Safari (the bug the owner hit: site set to "Ask", no popup).
  // After the first fix we start watchPosition for live in/out updates as they move.
  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsError("This device has no GPS / location support.");
      setNeedPermission(false);
      setLocating(false);
      return;
    }
    setNeedPermission(false);
    setBlocked(false);
    setGpsError("");
    setLocating(true);

    const applyPosition = (pos: GeolocationPosition) => {
      setLocating(false);
      setGpsError("");
      lastPosRef.current = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy,
      };
      setGpsDebug(
        `${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)} ±${Math.round(pos.coords.accuracy)}m`,
      );
      const g = window.google;
      if (!g || !mapRef.current || !branchLatLngRef.current) return;
      const here = new g.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
      if (userMarkerRef.current) {
        userMarkerRef.current.setPosition(here);
      } else {
        userMarkerRef.current = new g.maps.Marker({
          position: here,
          map: mapRef.current,
          title: "You are here",
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#2563eb",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
      }
      const d = g.maps.geometry.spherical.computeDistanceBetween(branchLatLngRef.current, here);
      setDistance(d);
      setInside(d <= radiusM);
    };

    const onError = (err: GeolocationPositionError) => {
      setLocating(false);
      setGpsDebug(`err code=${err.code} ${err.message}`);
      if (err.code === err.PERMISSION_DENIED) {
        setNeedPermission(true);
        setBlocked(true); // remembered "Block" → won't re-prompt; show platform steps + retry
      } else {
        setGpsError("Couldn't get your location. Move to an open area and tap Allow location again.");
        setNeedPermission(true);
      }
    };

    const opts: PositionOptions = { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 };
    // One-shot fires the prompt; on success keep a live watch going.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPosition(pos);
        if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = navigator.geolocation.watchPosition(applyPosition, onError, opts);
      },
      onError,
      opts,
    );
  }, [radiusM]);

  // Auto-detect the POS-admin approval: while still "pending", re-check the live status every
  // few seconds so the page flips to the clock-in flow on its own — no manual reload. Stops as
  // soon as it's no longer pending (approved/rejected/disabled).
  // Poll the live status the WHOLE time the page is open (not only while pending) so BOTH an
  // admin approval AND an admin device-reset are reflected on their own — no manual reload.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/partners/${slug}/attendance/status?device=${encodeURIComponent(getDeviceToken())}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (data?.ok) {
          setStatus(data.status as AttendanceStatus);
          setEnrolled(data.enrolled);
          setDeviceState(data.deviceState ?? "none");
          setCoworkers(data.coworkers ?? []);
          setStaffId(data.staffId ?? null);
          setBranchId(data.branchId ?? null);
        }
      } catch {
        /* transient network blip — the next tick retries */
      }
    }, 6000);
    return () => clearInterval(id);
  }, [slug]);

  // On load, read the current clock state so the button is right immediately (Clock In vs
  // Clock Out + the running timer) — e.g. if they clocked in earlier and reopened the page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/partners/${slug}/attendance/status?device=${encodeURIComponent(getDeviceToken())}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (!cancelled && data?.ok) {
          setClockType(data.lastClockType ?? null);
          setClockAt(data.lastClockAt ?? null);
          setDeviceState(data.deviceState ?? "none");
          setCoworkers(data.coworkers ?? []);
          setStaffId(data.staffId ?? null);
          setBranchId(data.branchId ?? null);
        }
      } catch {
        /* ignore — button just defaults to Clock In */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Tick once a second WHILE clocked in so the shift timer counts up live.
  useEffect(() => {
    if (!isClockedIn) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isClockedIn]);

  // ── Live in-store GCash payment QR (Chunk C, 2026-05-29) ────────────────────────────────────
  // The cashier picks GCash on the POS → POS writes a row to pos_active_payment_qrs (with their
  // cashier_staff_id = this signed-in user). Supabase Realtime pushes the INSERT down here within
  // ~1 second; we set it as activeQr and the full-screen card below reveals. The three guards
  // (clocked in / inside geofence / is the open shift's cashier) are enforced two ways:
  //
  //   1. POS-side: only writes a row when the open shift's cashier matches a real branch_staff
  //      link (cloud_staff_id). A co-worker who isn't running the till never has a row written.
  //   2. RLS (migration 0037): authenticated user only sees rows where cashier_staff_id matches
  //      their own branch_staff entry (by email). A clocked-in co-worker can subscribe, but the
  //      server filters every row out — they receive nothing.
  //
  // Geofence + clocked-in are render-time gates (below in the JSX): if you step outside the cafe
  // or clock out, the card hides instantly without unsubscribing — so re-entering / re-clocking
  // shows it again the moment you do.
  //
  // We also do a one-time SELECT on (re)connect to catch any row that was inserted BEFORE the
  // channel was subscribed (e.g., page reload mid-payment).
  useEffect(() => {
    if (!staffId || !branchId || !isClockedIn) return;
    let cancelled = false;
    let supabase;
    try {
      supabase = getSupabaseBrowser();
    } catch {
      return;
    }

    // Initial fetch — covers the page-reload case where a pending QR already exists.
    supabase
      .from("pos_active_payment_qrs")
      .select("id, nickname, amount, qr_image_url, status, expires_at, created_at, last_attempt_at, last_attempt_ok, last_attempt_reason")
      .eq("cashier_staff_id", staffId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }: { data: ActivePaymentQr[] | null }) => {
        if (cancelled) return;
        if (data && data[0]) setActiveQr(data[0]);
      });

    const channel = supabase
      .channel(`pos_qrs:${staffId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pos_active_payment_qrs",
          filter: `cashier_staff_id=eq.${staffId}`,
        },
        (payload: { eventType: string; new: ActivePaymentQr | null; old: ActivePaymentQr | null }) => {
          if (cancelled) return;
          const row = payload.new;
          if (payload.eventType === "DELETE") {
            setActiveQr((cur) => (cur && payload.old && cur.id === payload.old.id ? null : cur));
            return;
          }
          if (!row) return;
          if (row.status === "received") {
            // Confirmed — show the GREEN card for a beat so the cashier sees it landed, then hide.
            setActiveQr(row);
            setTimeout(() => {
              if (cancelled) return;
              setActiveQr((cur) => (cur && cur.id === row.id ? null : cur));
            }, 2600);
          } else if (row.status === "pending") {
            // Includes a fresh last_attempt_* on a RED so the card can show the retake reason.
            setActiveQr(row);
          } else {
            // cancelled / expired → hide immediately.
            setActiveQr((cur) => (cur && cur.id === row.id ? null : cur));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [staffId, branchId, isClockedIn]);

  // A new QR (or the QR going away) → clear the local photo feedback AND reset the verdict marker to
  // this QR's own last_attempt (null for a fresh one). Resetting matters: it stops a prior QR's
  // marker from carrying over, and lets a pre-existing verdict on a page-reload QR still show. The
  // verdict effect below then fires only for a genuinely NEW verdict on THIS QR.
  useEffect(() => {
    setPhotoPhase("idle");
    setPhotoReason("");
    seenAttemptRef.current = null;
  }, [activeQr?.id]);

  // React to each NEW till verdict on the active QR. ok=false → show the retake reason (the row
  // stays 'pending', so the QR + Take Photo button remain). ok=true → the row also flips to
  // 'received' and the GREEN card takes over, so just drop the "reading" spinner.
  useEffect(() => {
    const at = activeQr?.last_attempt_at ?? null;
    if (!at || seenAttemptRef.current === at) return;
    seenAttemptRef.current = at;
    if (activeQr?.last_attempt_ok === false) {
      setPhotoPhase("rejected");
      setPhotoReason(activeQr?.last_attempt_reason || "Couldn't read it — take the photo again.");
    } else {
      setPhotoPhase("idle");
    }
  }, [activeQr?.last_attempt_at, activeQr?.last_attempt_ok, activeQr?.last_attempt_reason]);

  // Safety net: "Reading…" should never spin forever. If the till hasn't sent a verdict within 25s
  // (it normally takes 2–6s), drop back to a retake prompt so the cashier is never stuck staring at
  // a spinner with a disabled button. A late GREEN still wins — it shows via the row's 'received'
  // status (the green card), independent of this local phase.
  useEffect(() => {
    if (photoPhase !== "reading") return;
    const t = setTimeout(() => {
      setPhotoPhase("rejected");
      setPhotoReason("Taking longer than usual — take the photo again.");
    }, 25000);
    return () => clearTimeout(t);
  }, [photoPhase]);

  // Liveness overlay + clock/enroll action state.
  const [capture, setCapture] = useState<null | "enroll" | "clock">(null);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string>("");
  const debug = typeof window !== "undefined" && window.location.search.includes("debug");

  const ERROR_TEXT: Record<string, string> = {
    device_mismatch: "This account is bound to another phone. Ask your admin to reset it.",
    face_mismatch: "Face didn't match your enrolled photo.",
    outside_geofence: "You're outside the branch area.",
    not_approved: "Your account isn't approved yet.",
    not_enrolled: "Enroll your face first.",
    no_location: "Location required — enable GPS.",
    rate_limited: "Too many attempts — wait a minute.",
  };

  async function handleEnroll(r: LivenessResult) {
    setCapture(null);
    setBusy(true);
    setActionMsg("");
    try {
      const fd = new FormData();
      fd.append("selfie", r.selfie, "selfie.jpg");
      fd.append("descriptor", JSON.stringify(r.descriptor));
      fd.append("deviceToken", getDeviceToken()); // bind THIS phone at enrollment
      const res = await fetch(`/api/partners/${slug}/attendance/enroll`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionMsg(ERROR_TEXT[data.error] ?? "Enrollment failed — try again.");
      } else {
        setActionMsg("Face verified — this phone is now registered.");
        setEnrolled(true); // flip in place — no reload; polling watches for admin approval
        setDeviceState("this"); // enrolling binds THIS phone
      }
    } catch {
      setActionMsg("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClock(r: LivenessResult) {
    setCapture(null);
    setBusy(true);
    setActionMsg("");
    try {
      const fd = new FormData();
      fd.append("selfie", r.selfie, "selfie.jpg");
      fd.append("descriptor", JSON.stringify(r.descriptor));
      fd.append("challenges", JSON.stringify(r.challenges));
      fd.append("deviceToken", getDeviceToken());
      if (coveringFor) fd.append("coveringFor", coveringFor); // reliever: who they're covering for
      if (lastPosRef.current) {
        fd.append("lat", String(lastPosRef.current.lat));
        fd.append("lng", String(lastPosRef.current.lng));
        fd.append("accuracy", String(lastPosRef.current.acc));
      }
      const res = await fetch(`/api/partners/${slug}/attendance/clock`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionMsg(ERROR_TEXT[data.error] ?? "Clock-in failed — try again.");
      } else {
        setActionMsg(data.clock_type === "clock_in" ? "Clocked IN ✓" : "Clocked OUT ✓");
        // Flip the button + start/stop the timer immediately.
        setClockType(data.clock_type);
        setClockAt(data.clock_type === "clock_in" ? new Date().toISOString() : null);
        setNowTs(Date.now());
        setCoveringFor(""); // clear the reliever pick after a successful clock
      }
    } catch {
      setActionMsg("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  // Online payment (GCash) receipt upload. Each chosen photo goes to the cloud; the POS is pushed it
  // via Realtime, downloads it, OCRs + dedups, and adds it to this cashier's open shift — then deletes
  // the cloud copy. Multi-photo: a gallery pick of several uploads them one after another.
  // Phone camera photos are 3–6 MB; sending them raw over the cafe's weak uplink is what made
  // "Uploading…" hang. Downscale to <=1920px long edge + re-encode JPEG ~0.85 IN THE BROWSER before
  // sending — cuts size ~10x while keeping a GCash receipt's text crisp for the POS's Google-Vision
  // read. Falls back to the original file if the canvas path fails or doesn't actually shrink it.
  async function shrinkImageForUpload(file: File): Promise<Blob> {
    if (!file.type.startsWith("image/")) return file;
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const maxDim = 1920;
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        return file;
      }
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85),
      );
      // Only use it if we actually made it smaller (a screenshot may already be tiny).
      return blob && blob.size < file.size ? blob : file;
    } catch {
      return file; // never block the upload on a compression hiccup
    }
  }

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const kind = uploadKindRef.current;
    const movementType = uploadTypeRef.current;
    const label = kind === "cash_movement" ? `${movementType ?? "cash"} photo` : "receipt";
    setReceiptBusy(true);
    setUploadingKey(kind === "cash_movement" ? (movementType ?? "cash") : "gcash");
    setReceiptMsg(`Uploading ${files.length}…`);
    let ok = 0;
    for (const f of files) {
      try {
        const blob = await shrinkImageForUpload(f);
        const fd = new FormData();
        fd.append("image", blob, "photo.jpg");
        fd.append("kind", kind);
        if (kind === "cash_movement" && movementType) fd.append("movementType", movementType);
        const res = await fetch(`/api/partners/${slug}/payment-receipts`, { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok && data.ok) ok++;
      } catch {
        /* keep going — report the count at the end */
      }
    }
    setReceiptBusy(false);
    setUploadingKey(null);
    // GCash receipt for the live QR flow → flip to "reading": the till pulls + reads the photo (a
    // couple seconds) and writes back GREEN (confirmed) or RED (retake, with reason). For a cash
    // movement / bulk receipt there's no live QR to confirm, so keep the plain sent message.
    if (kind === "gcash" && ok > 0) {
      setPhotoPhase("reading");
      setPhotoReason("");
    }
    setReceiptMsg(
      ok === files.length
        ? `✓ ${ok} ${label}${ok === 1 ? "" : "s"} sent — your POS will record ${ok === 1 ? "it" : "them"}.`
        : `${ok}/${files.length} sent — please retry the rest.`,
    );
  }

  // ---- Website cash move: open the form for a type, then request a code, then verify it. ----
  function openCashForm(t: "drop" | "pickup" | "expense") {
    setCashType(t);
    setCashStep("form");
    setCashAmount("");
    setCashReason("");
    setCashPhoto(null);
    setCashMoveId(null);
    setCashCode("");
    setCashMsg("");
  }
  function resetCashForm() {
    setCashType(null);
    setCashBusy(false);
    setCashMsg("");
  }
  function cashErr(code: string): string {
    switch (code) {
      case "not_approved":
        return "Your account isn't approved yet.";
      case "email_failed":
        return "Couldn't email the code to the owner — try again.";
      case "bad_amount":
        return "Enter a valid amount.";
      case "reason_too_short":
        return "Expense reason must be at least 5 characters.";
      case "rate_limited":
        return "Too many tries — please wait a bit.";
      default:
        return "Couldn't send — please try again.";
    }
  }
  // Step 1: send the move + email the owner the code. Photo is optional (a drop has no receipt) and
  // shrunk first (same fast path as receipts). On success we move to the code step.
  async function submitCashMove() {
    if (!cashType) return;
    const amt = Number(cashAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setCashMsg("Enter a valid amount.");
      return;
    }
    const reason = cashReason.trim();
    if (!reason) {
      setCashMsg("Reason is required.");
      return;
    }
    if (cashType === "expense" && reason.length < 5) {
      setCashMsg("Expense reason must be at least 5 characters.");
      return;
    }
    setCashBusy(true);
    setCashMsg("Sending approval request…");
    try {
      const fd = new FormData();
      fd.append("type", cashType);
      fd.append("amount", String(amt));
      fd.append("reason", reason);
      if (cashPhoto) fd.append("image", await shrinkImageForUpload(cashPhoto), "photo.jpg");
      const res = await fetch(`/api/partners/${slug}/cash-move/request`, { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.ok) {
        setCashMoveId(data.moveId);
        setCashStep("code");
        setCashMsg("Code emailed to the owner — ask them for it, then enter it below.");
      } else {
        setCashMsg(cashErr(data.error ?? ""));
      }
    } catch {
      setCashMsg("Couldn't send — check your connection and try again.");
    } finally {
      setCashBusy(false);
    }
  }
  // Step 2: verify the owner's code. On success the POS will pull + record it; close the form and show
  // the shared status line. Wrong code stays on this step so they can retry.
  async function verifyCashMove() {
    if (!cashMoveId) return;
    const t = cashType;
    const code = cashCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setCashMsg("Enter the 6-digit code.");
      return;
    }
    setCashBusy(true);
    setCashMsg("Checking code…");
    try {
      const res = await fetch(`/api/partners/${slug}/cash-move/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moveId: cashMoveId, code }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setCashType(null);
        setCashStep("form");
        setCashMsg("");
        setReceiptMsg(`✓ ${t} approved — your POS will record it.`);
      } else if (data.error === "bad_code") {
        setCashMsg("Wrong code. Check with the owner and try again.");
      } else if (data.error === "already_used") {
        setCashMsg("This request was already used — start a new one.");
      } else {
        setCashMsg(cashErr(data.error ?? ""));
      }
    } catch {
      setCashMsg("Couldn't check — try again.");
    } finally {
      setCashBusy(false);
    }
  }

  // No coords configured for this branch → can't geofence. Tell the owner to set it
  // in the POS admin geofence box; bail before trying to render a map.
  const hasCoords = typeof lat === "number" && typeof lng === "number";

  useEffect(() => {
    if (!hasCoords) {
      setPhase("error");
      setErrMsg("This branch has no location set yet. Set it in the POS admin first.");
      return;
    }

    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapDivRef.current) return;
        const g = window.google!;
        const center = new g.maps.LatLng(lat!, lng!);
        branchLatLngRef.current = center;

        const map = new g.maps.Map(mapDivRef.current, {
          center,
          zoom: 17,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        mapRef.current = map;

        // Branch marker + the geofence radius circle.
        new g.maps.Marker({ position: center, map, title: branchName });
        new g.maps.Circle({
          map,
          center,
          radius: radiusM,
          strokeColor: "#c98a2a",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: "#c98a2a",
          fillOpacity: 0.12,
        });

        setPhase("ready");
        // If location was already granted on this phone, start silently; otherwise show the
        // "Allow location" button so a TAP triggers the allow/deny popup (reliable on mobile),
        // and detect a prior block up front.
        if (navigator.permissions?.query) {
          navigator.permissions
            .query({ name: "geolocation" as PermissionName })
            .then((st) => {
              if (cancelled) return;
              if (st.state === "granted") requestLocation();
              else {
                setNeedPermission(true);
                if (st.state === "denied") setBlocked(true);
              }
            })
            .catch(() => {
              if (!cancelled) setNeedPermission(true);
            });
        } else {
          setNeedPermission(true);
        }
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setPhase("error");
        setErrMsg(e.message);
      });

    return () => {
      cancelled = true;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The three guards for revealing the live GCash QR. POS already enforces "is the open shift's
  // cashier" before writing the row. We add clocked-in + inside-geofence here. If geofenceRequired
  // is OFF for this branch, the inside check is skipped (matches the existing clock-in policy).
  const qrGuardsPass = !!activeQr && isClockedIn && (geofenceRequired ? inside : true);

  // 5-minute QR countdown — DISPLAY ONLY. The real 5-min rule is enforced on the receipt's printed
  // time in the POS, so a late photo of an in-window payment still confirms. At 0 the QR greys out
  // (no new customer scans it) but the Take Photo button stays for the grace window (owner choice
  // 2026-05-29). qrConfirmed flips on when the POS confirms → the GREEN card shows.
  const qrConfirmed = activeQr?.status === "received";
  const qrExpiresMs = activeQr?.expires_at ? Date.parse(activeQr.expires_at) : NaN;
  const qrRemainMs = Number.isNaN(qrExpiresMs) ? null : qrExpiresMs - nowTs;
  const qrExpired = qrRemainMs != null && qrRemainMs <= 0;
  const fmtCountdown = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div className="relative">
      {/* The map fills the viewport; the site Footer (from the layout) sits below. */}
      <div ref={mapDivRef} className="h-[100svh] w-full bg-bg-soft" />

      {/* ── LIVE GCASH PAYMENT QR (redesigned 2026-05-29) ──────────────────────────────────────
          Full-screen takeover that appears the instant the POS mints a QR for this cashier (INSERT
          via Supabase Realtime). The cashier shows it to the customer, then photographs the GCash
          success screen with the rear camera. The POS reads the photo (amount + paid-to-this-cafe
          + within the 5-min window) and writes back a GREEN (confirmed) or RED (retake) result,
          which the card shows live. 5-minute countdown is display-only; a late photo of an in-window
          payment still confirms because the POS goes by the receipt's printed time. */}
      {qrGuardsPass && activeQr && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-[min(94vw,26rem)] rounded-2xl bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.6)]">
            {qrConfirmed ? (
              /* GREEN — confirmed. Shows for ~2.6s (realtime handler), then the card hides. */
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <CheckCircle2 className="h-16 w-16 text-green-600" />
                <div className="text-2xl font-extrabold text-green-700">Paid — confirmed!</div>
                <div className="text-sm font-semibold text-stone-600">
                  ₱{Number(activeQr.amount).toFixed(2)} received. You can ring up the next customer.
                </div>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-center gap-2 text-stone-600">
                  <QrCode className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Show this to the customer</span>
                </div>
                {/* The QR image — greys out + dims once the 5-min timer hits 0 (display only). */}
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeQr.qr_image_url}
                    alt="GCash payment QR"
                    className={`mx-auto block h-auto w-full max-w-[20rem] rounded-lg bg-white transition ${qrExpired ? "opacity-25 grayscale" : ""}`}
                  />
                  {qrExpired && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded-full bg-stone-800/85 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
                        QR expired
                      </span>
                    </div>
                  )}
                </div>

                {/* Amount + 5-minute countdown. */}
                <div className="mt-4 flex items-end justify-center gap-4 text-center">
                  <div>
                    <div className="text-[0.7rem] font-bold uppercase tracking-widest text-stone-500">Amount</div>
                    <div className="font-display text-4xl font-extrabold text-amber-700">
                      ₱{Number(activeQr.amount).toFixed(2)}
                    </div>
                  </div>
                  {qrRemainMs != null && (
                    <div>
                      <div className="text-[0.7rem] font-bold uppercase tracking-widest text-stone-500">
                        {qrExpired ? "Window" : "Time left"}
                      </div>
                      <div className={`font-mono text-2xl font-extrabold ${qrExpired ? "text-stone-400" : "text-stone-700"}`}>
                        {qrExpired ? "0:00" : fmtCountdown(qrRemainMs)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Required next step. Camera-only input → rear camera opens straight away. */}
                <div className="mt-4 rounded-xl border-2 border-dashed border-amber-500 bg-amber-50 p-3 text-center">
                  <div className="mb-2 text-[0.65rem] font-bold uppercase tracking-widest text-amber-700">
                    Required next step
                  </div>
                  <input
                    ref={receiptCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleReceiptUpload}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      uploadKindRef.current = "gcash"
                      uploadTypeRef.current = null
                      receiptCameraInputRef.current?.click()
                    }}
                    disabled={receiptBusy || photoPhase === "reading"}
                    title="Take a photo of the customer's GCash success screen"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-3 text-sm font-bold text-white shadow transition hover:bg-amber-700 disabled:opacity-60"
                  >
                    <Camera className="h-4 w-4" />
                    {receiptBusy ? "Sending…" : photoPhase === "rejected" ? "Take Photo Again" : "Take Photo of Receipt"}
                  </button>

                  {/* Live result of the last photo. */}
                  {photoPhase === "reading" ? (
                    <div className="mt-2 flex items-center justify-center gap-2 text-[0.75rem] font-semibold text-amber-900">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Reading your photo…
                    </div>
                  ) : photoPhase === "rejected" ? (
                    <div className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-[0.75rem] font-semibold leading-snug text-red-700">
                      ✗ {photoReason}
                    </div>
                  ) : (
                    <div className="mt-2 text-[0.7rem] leading-snug text-amber-900">
                      After the customer pays, photograph their GCash success screen. It confirms the
                      order automatically once the amount, time and reference are read.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {phase === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-soft">
          <div className="flex items-center gap-3 text-cream-dim">
            <Loader2 className="h-5 w-5 animate-spin text-amber" />
            Loading map…
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-soft p-6 text-center">
          <div className="max-w-sm">
            <XCircle className="mx-auto h-8 w-8 text-red-400" />
            <p className="mt-3 text-cream">{errMsg}</p>
          </div>
        </div>
      )}

      {/* Bottom-right clock-in widget */}
      {phase === "ready" && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(92vw,22rem)] rounded-2xl border border-line-bright bg-bg-elev/95 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-amber" />
            <span className="font-display text-sm font-bold text-cream">{branchName}</span>
          </div>
          <p className="mt-0.5 truncate text-[0.7rem] text-mocha" title={email}>
            {email}
          </p>

          {/* Location — shown in EVERY stage. If permission hasn't been granted yet, show an
              "Allow location" button so a TAP triggers the browser's allow/deny popup (reliable
              on phones); otherwise show the live status. */}
          {status !== "rejected" && status !== "disabled" && (
            <div className="mt-3">
              {needPermission ? (
                <div className="flex flex-col gap-2">
                  {blocked ? (
                    <div className="rounded-lg bg-bg-card px-3 py-2.5 text-[0.78rem] leading-relaxed text-cream-dim">
                      <p className="font-bold text-red-400">Location is blocked on this phone.</p>
                      {isIOS ? (
                        <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
                          <li>Open <b>Settings → Privacy &amp; Security → Location Services</b> — turn it ON.</li>
                          <li>In that list find <b>Safari</b> → set to <b>While Using</b>.</li>
                          <li>Back here, tap <b>aA</b> in the address bar → <b>Website Settings → Location → Allow</b>.</li>
                          <li>Reload this page, then tap <b>Allow location</b>.</li>
                        </ol>
                      ) : (
                        <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
                          <li>Tap the <b>lock / tune icon</b> at the left of the address bar → <b>Permissions → Location → Allow</b>.</li>
                          <li>Make sure the phone&apos;s <b>Location</b> is ON (swipe down from the top).</li>
                          <li>Reload this page, then tap <b>Allow location</b>.</li>
                        </ol>
                      )}
                    </div>
                  ) : (
                    gpsError && <span className="text-sm text-red-400">{gpsError}</span>
                  )}
                  {blocked && isAndroid && (
                    <a
                      href="intent:#Intent;action=android.settings.LOCATION_SOURCE_SETTINGS;end"
                      title="Open your phone's location settings"
                      className="flex items-center justify-center gap-2 rounded-xl border border-line-bright px-4 py-2.5 text-sm font-semibold text-cream transition hover:bg-bg-card"
                    >
                      Open phone location settings
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={requestLocation}
                    title="Allow this page to use your location"
                    className="flex items-center justify-center gap-2 rounded-xl bg-amber px-4 py-2.5 text-sm font-bold text-bg transition hover:brightness-110"
                  >
                    <LocateFixed className="h-4 w-4" /> {blocked ? "I've enabled it — try again" : "Allow location"}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  {locating ? (
                    <span className="flex items-center gap-2 text-cream-dim">
                      <Loader2 className="h-4 w-4 animate-spin text-amber" /> Finding your location…
                    </span>
                  ) : gpsError ? (
                    <span className="text-red-400">{gpsError}</span>
                  ) : distance === null ? (
                    <span className="text-cream-dim">Waiting for your location…</span>
                  ) : inside ? (
                    <span className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> You&apos;re inside the area
                      <span className="text-cream-dim">({Math.round(distance)} m)</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-amber">
                      <LocateFixed className="h-4 w-4" /> Too far
                      <span className="text-cream-dim">
                        ({Math.round(distance)} m / {radiusM} m)
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          {debug && (
            <p className="mt-1 font-mono text-[0.65rem] text-mocha">gps: {gpsDebug}</p>
          )}

          {/* Rejected / disabled → dead end, approval is managed on the POS admin. */}
          {status === "rejected" || status === "disabled" ? (
            <div className="mt-3 rounded-lg bg-bg-card px-3 py-2 text-sm text-cream-dim">
              {status === "rejected"
                ? "Access denied — ask your admin."
                : "This account is disabled."}
            </div>
          ) : !enrolled ? (
            // Not enrolled yet (pending OR approved). Let them enroll now so the face
            // is ready; clocking still waits for approval.
            <div className="mt-3">
              <div className="rounded-lg bg-bg-card px-3 py-2 text-sm text-cream-dim">
                {status === "pending"
                  ? "Enroll your face now. Clocking unlocks once an admin approves you on the POS."
                  : "Approved — enroll your face to start clocking."}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setCapture("enroll")}
                title="Enroll your face"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber px-4 py-3 text-sm font-bold text-bg transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
                Enroll my face
              </button>
            </div>
          ) : status === "pending" ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-bg-card px-3 py-2 text-sm text-cream-dim">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber" />
              Face enrolled. Waiting for admin approval — this unlocks automatically once
              you&apos;re approved.
            </div>
          ) : deviceState === "other" ? (
            // A DIFFERENT phone is registered to this account → block this one (one phone per
            // staff). Admin resets the device on the POS to move it to this phone.
            <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-400">
              This account is registered to another phone. To use this phone, ask your admin to
              reset your device on the POS — then verify your face here to register it.
            </div>
          ) : deviceState === "none" ? (
            // No phone registered yet (new, or admin just reset) → must verify face on THIS
            // phone to register it before clocking. This is what makes "Reset device" force a
            // fresh registration instead of silently re-binding on the next clock-in.
            <div className="mt-3">
              <div className="rounded-lg bg-bg-card px-3 py-2 text-sm text-cream-dim">
                Register this phone to start clocking — verify your face once to lock your account
                to this phone.
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setCapture("enroll")}
                title="Register this phone"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber px-4 py-3 text-sm font-bold text-bg transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
                Register this phone
              </button>
            </div>
          ) : (
            // deviceState "this" (this phone is registered) → the real clock flow, gated by the
            // geofence. Only BLOCK when the branch requires it; advisory = clock anywhere.
            <>
              {/* Live shift timer — shows while clocked in, counting up from clock-in time. */}
              {isClockedIn && clockAt && (
                <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-emerald-400">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs font-semibold">On shift</span>
                  <span className="font-mono text-lg font-bold tabular-nums">
                    {fmtElapsed(nowTs - new Date(clockAt).getTime())}
                  </span>
                </div>
              )}
              {/* Reliever picker — only when clocking IN and the server says this is a real reliever
                  case (you have no shift today AND a scheduled co-worker is absent). coworkers holds
                  exactly those absent people; if empty the button never shows. */}
              {!isClockedIn && coworkers.length > 0 && (
                <div className="mt-3">
                  <label className="text-[0.7rem] text-mocha">
                    Covering for an absent co-worker?
                  </label>
                  <select
                    value={coveringFor}
                    onChange={(e) => setCoveringFor(e.target.value)}
                    title="Pick the absent co-worker whose shift you're covering"
                    className="mt-1 w-full rounded-xl border border-line-bright bg-bg-card px-3 py-2.5 text-sm text-cream"
                  >
                    <option value="">— Select the person you&apos;re covering —</option>
                    {coworkers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                disabled={(geofenceRequired && !inside) || busy}
                title={
                  geofenceRequired && !inside
                    ? `Move within the branch area to ${isClockedIn ? "clock out" : "clock in"}`
                    : isClockedIn
                      ? "Clock out — end your shift"
                      : "Clock in — start your shift"
                }
                onClick={() => setCapture("clock")}
                className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${
                  (!geofenceRequired || inside) && !busy
                    ? isClockedIn
                      ? "bg-red-500 text-white hover:brightness-110"
                      : "bg-amber text-bg hover:brightness-110"
                    : "cursor-not-allowed bg-line text-cream-dim"
                }`}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                {isClockedIn ? "Clock Out" : "Clock In"}
              </button>

              {/* Clear, visible reason you can't clock (phones don't show the hover tooltip). */}
              {!geofenceRequired ? (
                <p className="mt-2 text-center text-[0.7rem] text-mocha">
                  Location check is advisory for this branch.
                </p>
              ) : inside ? null : distance !== null ? (
                <p className="mt-2 rounded-lg bg-amber/10 px-3 py-2 text-center text-xs font-semibold text-amber">
                  You can&apos;t clock in or out from here — you&apos;re about {Math.round(distance)} m
                  from the branch. Move within {radiusM} m to enable it.
                </p>
              ) : (
                <p className="mt-2 text-center text-xs text-cream-dim">
                  Turn on location above to clock in or out.
                </p>
              )}

              {/* Online payment (GCash) receipts + cash moves — shown ONLY while the staffer is
                  currently clocked in (on shift). A clocked-out / off-shift worker must not add
                  receipts or cash moves to a shift; the server routes enforce this too. */}
              {isClockedIn ? (
              <div className="mt-3 border-t border-line pt-3">
                {/* Camera-only (owner 2026-05-29: "no more bulk uploads or from gallery"). capture
                    forces the rear camera; no `multiple` — one live shot at a time. */}
                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleReceiptUpload}
                />
                <button
                  type="button"
                  disabled={receiptBusy}
                  onClick={() => { uploadKindRef.current = "gcash"; uploadTypeRef.current = null; receiptInputRef.current?.click(); }}
                  title="Upload a GCash / online payment receipt"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber px-4 py-2.5 text-sm font-bold text-bg transition hover:brightness-110 active:brightness-95 disabled:opacity-60"
                >
                  {uploadingKey === "gcash" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                  Online Payment Receipts
                </button>
                {/* Cash move: enter the type + amount + reason (+ optional photo) here, get the owner's
                    code, and the POS pulls + records it. Replaces the in-POS cash buttons. Compact so
                    the map stays visible. */}
                <div className="mt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 text-[0.7rem] text-mocha">Cash move:</span>
                    {(["drop", "pickup", "expense"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        disabled={cashBusy}
                        onClick={() => openCashForm(t)}
                        title={`Record a cash ${t}`}
                        className={`flex-1 rounded-lg px-2 py-1.5 text-[0.7rem] font-bold capitalize transition active:brightness-95 disabled:opacity-60 ${
                          cashType === t
                            ? "bg-amber text-bg"
                            : "border border-line-bright bg-bg-card text-cream hover:bg-bg-elev"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {cashType && cashStep === "form" && (
                    <div className="mt-2 rounded-xl border border-line-bright bg-bg-card p-3">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={cashAmount}
                        onChange={(e) => setCashAmount(e.target.value)}
                        placeholder="Amount ₱"
                        className="mb-2 w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-cream outline-none"
                      />
                      <input
                        type="text"
                        value={cashReason}
                        onChange={(e) => setCashReason(e.target.value)}
                        placeholder={
                          cashType === "expense"
                            ? "Reason (e.g. Supplies — min 5 chars)"
                            : "Reason (e.g. Bank deposit)"
                        }
                        className="mb-2 w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-cream outline-none"
                      />
                      {/* Camera-only too (owner 2026-05-29: no gallery anywhere). */}
                      <input
                        ref={cashPhotoInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => setCashPhoto(e.target.files?.[0] ?? null)}
                      />
                      <button
                        type="button"
                        onClick={() => cashPhotoInputRef.current?.click()}
                        title="Add a photo (optional)"
                        className="flex items-center gap-1.5 rounded-lg border border-line-bright px-2.5 py-1.5 text-[0.7rem] font-semibold text-cream hover:bg-bg-elev"
                      >
                        <Camera className="h-3.5 w-3.5" /> {cashPhoto ? "Photo added ✓" : "Add photo (optional)"}
                      </button>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={resetCashForm}
                          disabled={cashBusy}
                          title="Cancel this cash move"
                          className="flex-1 rounded-lg border border-line-bright px-2 py-2 text-[0.7rem] font-semibold text-cream disabled:opacity-60"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={submitCashMove}
                          disabled={cashBusy}
                          title="Email the owner an approval code"
                          className="flex flex-[2] items-center justify-center gap-1 rounded-lg bg-amber px-2 py-2 text-[0.7rem] font-bold text-bg active:brightness-95 disabled:opacity-60"
                        >
                          {cashBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Request approval code
                        </button>
                      </div>
                    </div>
                  )}

                  {cashType && cashStep === "code" && (
                    <div className="mt-2 rounded-xl border border-line-bright bg-bg-card p-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={cashCode}
                        onChange={(e) => setCashCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="6-digit code"
                        className="mb-2 w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-center text-lg tracking-[0.4em] text-cream outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={resetCashForm}
                          disabled={cashBusy}
                          title="Cancel this cash move"
                          className="flex-1 rounded-lg border border-line-bright px-2 py-2 text-[0.7rem] font-semibold text-cream disabled:opacity-60"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={verifyCashMove}
                          disabled={cashBusy}
                          title="Approve with the owner's code"
                          className="flex flex-[2] items-center justify-center gap-1 rounded-lg bg-amber px-2 py-2 text-[0.7rem] font-bold text-bg active:brightness-95 disabled:opacity-60"
                        >
                          {cashBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Approve
                        </button>
                      </div>
                    </div>
                  )}

                  {cashMsg && (
                    <p className="mt-1.5 text-center text-[0.7rem] text-cream-dim">{cashMsg}</p>
                  )}
                </div>
                {receiptMsg && (
                  <p className="mt-1.5 text-center text-[0.7rem] text-cream-dim">{receiptMsg}</p>
                )}
              </div>
              ) : (
                <p className="mt-3 border-t border-line pt-3 text-center text-xs text-cream-dim">
                  Clock in to upload payment receipts or record cash moves.
                </p>
              )}
            </>
          )}

          {actionMsg && (
            <p className="mt-3 text-center text-sm font-semibold text-cream">{actionMsg}</p>
          )}
        </div>
      )}

      {/* Liveness overlay — runs the blink + head-turn challenge, then enroll/clock. */}
      {capture === "enroll" && (
        <LivenessCapture
          title="Enroll your face"
          debug={debug}
          onCancel={() => setCapture(null)}
          onComplete={handleEnroll}
        />
      )}
      {capture === "clock" && (
        <LivenessCapture
          title="Face check to clock in / out"
          debug={debug}
          onCancel={() => setCapture(null)}
          onComplete={handleClock}
        />
      )}
    </div>
  );
}
