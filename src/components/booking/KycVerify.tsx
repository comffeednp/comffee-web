"use client";

import { useRef, useState } from "react";
import { Camera, Upload, Check, RefreshCw } from "lucide-react";
import {
  prepareKycDocument,
  prepareKycSelfie,
  SUBMIT_TOTAL_BUDGET_BYTES,
  uploadErrorMessage,
  uploadNetworkMessage,
  type PreparedFile,
} from "@/lib/kyc-upload";

export interface KycResult {
  selfieUrl: string;
  idUrl: string;
  billingUrl: string;
  ipAddress: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface Props {
  memberId: string;
  onComplete: (result: KycResult) => void;
  onFail: (msg: string) => void;
}

type SubStep = "selfie" | "id" | "billing" | "submitting";

interface Captured {
  selfie: File | null;
  id: File | null;
  billing: File | null;
}

function CameraCapture({ label, hint, accept, onCapture, prepare, facingMode = "environment" }: {
  label: string;
  hint: string;
  /** File-input accept attribute — selfie is image-only, docs also allow PDF. */
  accept: string;
  onCapture: (file: File) => void;
  /** Compress / validate the raw capture BEFORE it counts as captured. */
  prepare: (file: File) => Promise<PreparedFile>;
  facingMode?: "user" | "environment";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"choose" | "camera" | "processing" | "preview">("choose");
  const [preview, setPreview] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startCamera = async () => {
    setCaptureError(null);
    setMode("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCaptureError("Camera not available here — use Upload file instead.");
      setMode("choose");
    }
  };

  // Compress/validate first; only a file that survived `prepare` (i.e. one the
  // server and the platform payload cap will accept) ever counts as captured.
  const finalize = async (raw: File) => {
    setCaptureError(null);
    setMode("processing");
    const result = await prepare(raw);
    if ("error" in result) {
      setCaptureError(result.error);
      setMode("choose");
      return;
    }
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(result.file);
    });
    setMode("preview");
    onCapture(result.file);
  };

  const snap = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return;
      stopCamera();
      void finalize(new File([blob], "capture.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file after a failed prepare.
    e.target.value = "";
    if (!file) return;
    void finalize(file);
  };

  const retake = () => {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setMode("choose");
    stopCamera();
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha">{label}</p>
        <p className="mt-1 text-sm text-cream-dim">{hint}</p>
      </div>

      {mode === "choose" && (
        <div className="border border-line-bright rounded-xl p-5 bg-bg space-y-3">
          {captureError && (
            <p className="font-mono text-xs text-red-400">// {captureError}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={startCamera}
              title="Open camera to take a photo"
              className="flex items-center gap-2 key-cap"
            >
              <Camera className="h-3.5 w-3.5" />
              Take photo
            </button>
            <label className="flex items-center gap-2 key-cap cursor-pointer">
              <Upload className="h-3.5 w-3.5" />
              Upload file
              <input type="file" accept={accept} className="sr-only" onChange={handleFileUpload} />
            </label>
          </div>
        </div>
      )}

      {mode === "processing" && (
        <div className="border border-line-bright rounded-xl p-5 bg-bg">
          <p className="font-mono text-xs text-cream-dim animate-pulse">// preparing photo…</p>
        </div>
      )}

      {mode === "camera" && (
        <div className="border border-line-bright rounded-xl overflow-hidden bg-bg">
          <video ref={videoRef} autoPlay playsInline className="w-full max-h-64 object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="p-3 flex gap-3">
            <button type="button" onClick={snap} title="Take this photo" className="key-cap key-cap-primary flex-1">
              <Camera className="h-3.5 w-3.5" />
              Capture
            </button>
            <button type="button" onClick={() => { stopCamera(); setMode("choose"); }} title="Cancel and go back" className="key-cap">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "preview" && preview && (
        <div className="border border-line-bright rounded-xl overflow-hidden bg-bg">
          <img src={preview} alt="captured" className="w-full max-h-48 object-cover" />
          <div className="p-3 flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-mono text-xs text-phosphor">
              <Check className="h-3.5 w-3.5" /> Captured
            </span>
            <button type="button" onClick={retake} title="Retake this photo" className="flex items-center gap-1.5 font-mono text-xs text-cream-dim hover:text-amber transition">
              <RefreshCw className="h-3 w-3" /> Retake
            </button>
          </div>
        </div>
      )}

      {mode !== "camera" && <canvas ref={canvasRef} className="hidden" />}
    </div>
  );
}

export default function KycVerify({ memberId, onComplete, onFail }: Props) {
  const [subStep, setSubStep] = useState<SubStep>("selfie");
  const [captured, setCaptured] = useState<Captured>({ selfie: null, id: null, billing: null });
  const [error, setError] = useState<string | null>(null);

  const update = (key: keyof Captured, file: File) =>
    setCaptured((prev) => ({ ...prev, [key]: file }));

  const canAdvanceSelfie = !!captured.selfie;
  const canAdvanceId = !!captured.id;
  const canAdvanceBilling = !!captured.billing;

  const handleSubmit = async () => {
    if (!captured.selfie || !captured.id || !captured.billing) return;

    // Pre-flight: Vercel rejects request bodies over 4.5 MB before our route
    // runs, with a non-JSON error page. Never send a request that is doomed —
    // point the guest at the biggest document instead.
    const files: Array<{ step: Exclude<SubStep, "submitting">; file: File }> = [
      { step: "selfie", file: captured.selfie },
      { step: "id", file: captured.id },
      { step: "billing", file: captured.billing },
    ];
    const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0);
    if (totalBytes > SUBMIT_TOTAL_BUDGET_BYTES) {
      const biggest = files.reduce((a, b) => (b.file.size > a.file.size ? b : a));
      setError(`Your documents are too large to send together — retake the ${biggest.step === "id" ? "ID" : biggest.step} using “Take photo”, or upload a smaller image.`);
      setSubStep(biggest.step);
      return;
    }

    setSubStep("submitting");
    setError(null);

    let latitude: number | null = null;
    let longitude: number | null = null;
    try {
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => { latitude = pos.coords.latitude; longitude = pos.coords.longitude; resolve(); },
          () => resolve(),
          { timeout: 5000 },
        );
      });
    } catch {}

    const form = new FormData();
    form.append("memberId", memberId);
    form.append("selfie", captured.selfie);
    form.append("id_doc", captured.id);
    form.append("billing_doc", captured.billing);
    if (latitude != null) form.append("latitude", String(latitude));
    if (longitude != null) form.append("longitude", String(longitude));

    try {
      const res = await fetch("/api/kyc/submit", {
        method: "POST",
        body: form,
        // A hung mobile connection should surface a retry message, not spin
        // forever. 120s covers a ~3 MB upload on slow data + server checks.
        signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(120_000) : undefined,
      });
      // Platform-level failures (Vercel 413/5xx pages) are NOT JSON — parse
      // defensively so they get a real message instead of a thrown parse error.
      let data: {
        ok?: boolean; error?: string; failedStep?: SubStep; retry_after_seconds?: number;
        selfieUrl?: string; idUrl?: string; billingUrl?: string;
        ipAddress?: string | null; latitude?: number | null; longitude?: number | null;
      } | null = null;
      try {
        data = await res.json();
      } catch {}
      if (!res.ok || !data?.ok) {
        setError(uploadErrorMessage(res.status, data));
        setSubStep(data?.failedStep ?? "billing");
        return;
      }
      onComplete({
        selfieUrl: data.selfieUrl!,
        idUrl: data.idUrl!,
        billingUrl: data.billingUrl!,
        ipAddress: data.ipAddress ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      });
    } catch (e) {
      setError(uploadNetworkMessage(e));
      setSubStep("billing");
    }
  };

  const steps = [
    { key: "selfie", label: "Selfie" },
    { key: "id", label: "ID" },
    { key: "billing", label: "Billing" },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-step indicator */}
      <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-widest">
        {steps.map((s, i) => (
          <span key={s.key} className="flex items-center gap-2">
            {i > 0 && <span className="text-mocha">›</span>}
            <span className={subStep === s.key ? "text-amber" : captured[s.key as keyof Captured] ? "text-phosphor" : "text-mocha"}>
              {captured[s.key as keyof Captured] && <Check className="inline h-3 w-3 mr-1" />}
              {s.label}
            </span>
          </span>
        ))}
      </div>

      {subStep === "selfie" && (
        <div className="space-y-5">
          <CameraCapture
            label="// step_1 · selfie"
            hint="Take a clear photo of your face. Make sure it's well lit and your eyes are visible."
            accept="image/*"
            prepare={prepareKycSelfie}
            onCapture={(f) => { update("selfie", f); setError(null); }}
            facingMode="user"
          />
          {error && <p className="font-mono text-xs text-red-400">// {error}</p>}
          <button
            type="button"
            disabled={!canAdvanceSelfie}
            onClick={() => setSubStep("id")}
            title="Continue to ID document step"
            className="key-cap key-cap-primary disabled:opacity-40"
          >
            Next → ID document
          </button>
        </div>
      )}

      {subStep === "id" && (
        <div className="space-y-5">
          <CameraCapture
            label="// step_2 · government id"
            hint="Take a photo or upload your Philippine government-issued ID — PhilSys, UMID, Driver's License, or Passport."
            accept="image/*,application/pdf"
            prepare={prepareKycDocument}
            onCapture={(f) => { update("id", f); setError(null); }}
          />
          {error && <p className="font-mono text-xs text-red-400">// {error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setSubStep("selfie")} title="Go back to selfie step" className="key-cap font-mono text-xs">← back</button>
            <button
              type="button"
              disabled={!canAdvanceId}
              onClick={() => setSubStep("billing")}
              title="Continue to proof of billing step"
              className="key-cap key-cap-primary disabled:opacity-40"
            >
              Next → Proof of billing
            </button>
          </div>
        </div>
      )}

      {subStep === "billing" && (
        <div className="space-y-5">
          <CameraCapture
            label="// step_3 · proof of billing"
            hint="Take a photo or upload a utility bill (Meralco, Maynilad, Converge, PLDT, Globe) showing your name and address. Must be within the last 3 months."
            accept="image/*,application/pdf"
            prepare={prepareKycDocument}
            onCapture={(f) => { update("billing", f); setError(null); }}
          />
          {error && <p className="font-mono text-xs text-red-400">// {error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setSubStep("id")} title="Go back to ID document step" className="key-cap font-mono text-xs">← back</button>
            <button
              type="button"
              disabled={!canAdvanceBilling}
              onClick={handleSubmit}
              title="Submit all documents for verification"
              className="key-cap key-cap-primary disabled:opacity-40"
            >
              Submit verification
            </button>
          </div>
        </div>
      )}

      {subStep === "submitting" && (
        <div className="py-12 text-center space-y-3">
          <p className="font-mono text-sm text-cream animate-pulse">// uploading documents...</p>
          <p className="font-mono text-xs text-mocha">this can take a minute on a slow connection — keep this page open</p>
        </div>
      )}
    </div>
  );
}
