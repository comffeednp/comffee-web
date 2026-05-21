"use client";

import { useRef, useState } from "react";
import { Camera, Upload, Check, RefreshCw } from "lucide-react";

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

function CameraCapture({ label, hint, onCapture }: {
  label: string;
  hint: string;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"choose" | "camera" | "preview">("choose");
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startCamera = async () => {
    setCameraError(null);
    setMode("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCameraError("Camera access denied. Use file upload instead.");
      setMode("choose");
    }
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
      const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      setPreview(url);
      setMode("preview");
      stopCamera();
      onCapture(file);
    }, "image/jpeg", 0.92);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    setMode("preview");
    onCapture(file);
  };

  const retake = () => {
    setPreview(null);
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
          {cameraError && (
            <p className="font-mono text-xs text-red-400">// {cameraError}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={startCamera}
              className="flex items-center gap-2 key-cap"
            >
              <Camera className="h-3.5 w-3.5" />
              Take photo
            </button>
            <label className="flex items-center gap-2 key-cap cursor-pointer">
              <Upload className="h-3.5 w-3.5" />
              Upload file
              <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={handleFileUpload} />
            </label>
          </div>
        </div>
      )}

      {mode === "camera" && (
        <div className="border border-line-bright rounded-xl overflow-hidden bg-bg">
          <video ref={videoRef} autoPlay playsInline className="w-full max-h-64 object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="p-3 flex gap-3">
            <button type="button" onClick={snap} className="key-cap key-cap-primary flex-1">
              <Camera className="h-3.5 w-3.5" />
              Capture
            </button>
            <button type="button" onClick={() => { stopCamera(); setMode("choose"); }} className="key-cap">
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
            <button type="button" onClick={retake} className="flex items-center gap-1.5 font-mono text-xs text-cream-dim hover:text-amber transition">
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
      const res = await fetch("/api/kyc/submit", { method: "POST", body: form });
      const data = await res.json() as {
        ok?: boolean; error?: string;
        selfieUrl?: string; idUrl?: string; billingUrl?: string;
        ipAddress?: string | null; latitude?: number | null; longitude?: number | null;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Upload failed. Please try again.");
        setSubStep("billing");
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
    } catch {
      setError("Network error. Please try again.");
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
            onCapture={(f) => update("selfie", f)}
          />
          <button
            type="button"
            disabled={!canAdvanceSelfie}
            onClick={() => setSubStep("id")}
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
            onCapture={(f) => update("id", f)}
          />
          <div className="flex gap-3">
            <button type="button" onClick={() => setSubStep("selfie")} className="key-cap font-mono text-xs">← back</button>
            <button
              type="button"
              disabled={!canAdvanceId}
              onClick={() => setSubStep("billing")}
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
            onCapture={(f) => update("billing", f)}
          />
          {error && <p className="font-mono text-xs text-red-400">// {error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setSubStep("id")} className="key-cap font-mono text-xs">← back</button>
            <button
              type="button"
              disabled={!canAdvanceBilling}
              onClick={handleSubmit}
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
          <p className="font-mono text-xs text-mocha">capturing location data</p>
        </div>
      )}
    </div>
  );
}
