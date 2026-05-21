"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";

interface Props {
  name: string;
  defaultValue?: string | null;
  folder?: string;
  multiple?: boolean;
  autoSubmit?: boolean;
}

export default function ImageUpload({
  name,
  defaultValue,
  folder = "branches",
  multiple = false,
  autoSubmit = false,
}: Props) {
  const [url, setUrl] = useState<string>(defaultValue ?? "");
  // Each preview: objectUrl for immediate display, finalUrl set when upload completes
  const [previews, setPreviews] = useState<{ id: string; objectUrl: string; finalUrl: string | null }[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePick = () => fileRef.current?.click();

  const upload = async (rawFile: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", rawFile, rawFile.name);
    fd.append("folder", folder);
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok || !data.public_url) return null;
    return data.public_url as string;
  };

  const handleFileSingle = async (rawFile: File) => {
    setError(null);
    setUploading(1);
    try {
      const result = await upload(rawFile);
      if (!result) { setError("upload_failed"); return; }
      setUrl(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "compress_failed");
    } finally {
      setUploading(0);
    }
  };

  const handleFilesMulti = (files: FileList) => {
    setError(null);
    const arr = Array.from(files);
    // Create instant previews so the user sees thumbnails immediately
    const newPreviews = arr.map((f) => ({
      id: Math.random().toString(36).slice(2),
      objectUrl: URL.createObjectURL(f),
      finalUrl: null as string | null,
    }));
    setPreviews((prev) => [...prev, ...newPreviews]);
    setUploading((n) => n + arr.length);
    // Upload each file independently so each thumbnail updates as it finishes
    arr.forEach(async (file, i) => {
      const id = newPreviews[i].id;
      try {
        const result = await upload(file);
        if (result) {
          setPreviews((prev) => prev.map((p) => p.id === id ? { ...p, finalUrl: result } : p));
        } else {
          setError("one or more uploads failed");
          setPreviews((prev) => prev.filter((p) => p.id !== id));
        }
      } catch {
        setError("one or more uploads failed");
        setPreviews((prev) => prev.filter((p) => p.id !== id));
      } finally {
        setUploading((n) => n - 1);
      }
    });
  };

  if (multiple) {
    const doneUrls = previews.filter((p) => p.finalUrl).map((p) => p.finalUrl!);
    return (
      <div>
        {/* Hidden inputs for form submission — only finalized uploads */}
        {doneUrls.map((u) => (
          <input key={u} type="hidden" name={name} value={u} />
        ))}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFilesMulti(e.target.files);
            e.target.value = "";
          }}
        />

        {previews.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
            {previews.map((p) => (
              <div key={p.id} className="relative group">
                {p.finalUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.finalUrl} alt="" className="w-full aspect-square object-cover rounded-md border border-line-bright" />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center rounded-md border border-line-bright bg-bg-card">
                    <ImageIcon className="h-8 w-8 text-mocha" />
                  </div>
                )}
                {/* Spinner overlay while still uploading */}
                {p.finalUrl === null && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-md bg-bg/60 backdrop-blur-sm">
                    <Loader2 className="h-5 w-5 animate-spin text-amber" />
                  </div>
                )}
                {/* Remove button once done */}
                {p.finalUrl !== null && (
                  <button
                    type="button"
                    onClick={() => setPreviews((prev) => prev.filter((x) => x.id !== p.id))}
                    className="absolute top-1 right-1 bg-bg/80 backdrop-blur rounded p-0.5 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition"
                    aria-label="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handlePick}
          title={previews.length > 0 ? "Add more photos" : "Upload photos"}
          className="w-full flex items-center justify-center gap-3 px-4 py-6 border border-dashed border-line-bright rounded-lg bg-bg-card hover:border-amber/60 transition"
        >
          {uploading > 0 ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-amber" />
              <span className="font-mono text-xs uppercase tracking-widest text-amber">
                uploading {uploading} file{uploading > 1 ? "s" : ""}…
              </span>
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 text-cream-dim" />
              <span className="font-mono text-xs uppercase tracking-widest text-cream-dim">
                {previews.length > 0 ? "add more photos" : "upload photos"}
              </span>
            </>
          )}
        </button>

        {error && (
          <p className="mt-2 font-mono text-xs text-red-400 flex items-center gap-1.5">
            <X className="h-3 w-3" />{error}
          </p>
        )}
      </div>
    );
  }

  // ── single mode ──────────────────────────────────────────────────────────
  return (
    <div>
      <input type="hidden" name={name} value={url} />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSingle(f); }}
      />

      {url ? (
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="preview" className="h-24 w-32 object-cover rounded-md border border-line-bright" />
          <div className="flex-1 min-w-0 space-y-2">
            <p className="font-mono text-[0.65rem] text-mocha truncate">{url}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePick}
                disabled={uploading > 0}
                title="Replace this image"
                className="font-mono text-[0.65rem] uppercase tracking-widest text-amber hover:underline"
              >
                {uploading > 0 ? "uploading…" : "replace"}
              </button>
              <span className="text-mocha">·</span>
              <button
                type="button"
                onClick={() => { setUrl(""); setError(null); }}
                title="Remove this image"
                className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha hover:text-red-400"
              >
                remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={handlePick}
            disabled={uploading > 0}
            title="Upload an image"
            className="w-full flex items-center justify-center gap-3 px-4 py-6 border border-dashed border-line-bright rounded-lg bg-bg-card hover:border-amber/60 transition disabled:opacity-50"
          >
            {uploading > 0 ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-amber" />
                <span className="font-mono text-xs uppercase tracking-widest text-amber">uploading…</span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 text-cream-dim" />
                <span className="font-mono text-xs uppercase tracking-widest text-cream-dim">upload image</span>
              </>
            )}
          </button>
          <div className="flex items-center gap-3 text-[0.65rem] font-mono text-mocha uppercase tracking-widest">
            <span className="flex-1 h-px bg-line" />
            or paste URL
            <span className="flex-1 h-px bg-line" />
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="w-full bg-bg border border-line-bright rounded-lg px-3 py-2 text-sm font-mono text-cream"
          />
        </div>
      )}

      {error && (
        <p className="mt-2 font-mono text-xs text-red-400 flex items-center gap-1.5">
          <X className="h-3 w-3" />{error}
        </p>
      )}
    </div>
  );
}
