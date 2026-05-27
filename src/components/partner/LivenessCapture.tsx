"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X, ScanFace } from "lucide-react";
import { eyeAspectRatio, headYaw, BLINK_EAR_OPEN, YAW_TURN_MIN, type Pt } from "@/lib/liveness";
import { euclideanDistance } from "@/lib/face-match";

// face-api model weights ship inside the npm package; jsDelivr serves them so we don't
// commit ~13MB of binaries. Self-host under /public/models later if the CDN is a concern.
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

export interface LivenessResult {
  descriptor: number[]; // 128-d, taken from a frontal frame
  selfie: Blob; // representative frontal frame
  frames: Blob[]; // one audit frame per passed challenge
  challenges: string[]; // which challenges were issued (server can sanity-check)
}

type Challenge = "turn" | "turnBack";

interface Props {
  title: string;
  onComplete: (r: LivenessResult) => void;
  onCancel: () => void;
  debug?: boolean;
}

// ── Anti-buddy-punch FLOWCHART (what this does, and what was tried) ──────────────
// Goal: stop someone holding up a PHOTO of an absent co-worker. A still photo can't turn
//   its head on demand, so we require TWO head-turns: to one side, then the OTHER side
//   (the sign of yaw must FLIP between them). Pass only if both happen within the timeout.
//   NOTE: liveness only proves a LIVE person, not WHO it is — identity comes from the
//   separate face-match (live descriptor vs the enrolled one) the /clock route runs every
//   time. A live co-worker passes the turns but fails the face-match.
// Identity lock: the first clean FRONTAL frame locks the descriptor; every later frontal
//   frame must still match it (euclid < CONSISTENCY) — so they can't start as themselves
//   then swap in a co-worker's photo to finish the challenge.
// WHY NOT BLINK: tried first with fixed EAR cutoffs, then a relative per-person open-eye
//   baseline — BOTH failed on the owner's phone. Confirmed hard wall: with eyes FULLY shut,
//   face-api's landmark regression still reported EAR ~0.24+ (open was ~0.28), i.e. it never
//   registers a closed eye on that camera, so NO threshold works. Head-yaw reads cleanly
//   (~0.60 at ~45°), so the blink was replaced by a second opposite head-turn — same
//   anti-photo guarantee, using the one signal this hardware can actually see. EAR is still
//   computed, but ONLY to pick a clean eyes-open frontal frame for the identity lock/selfie.
// Considered & rejected for the free tier: texture/screen-glare detection (needs ML),
//   depth (no sensor on web), challenge-response with server-rendered overlay (complex).
// KNOWN HARD WALL (still open to suggestions): a VIDEO of the co-worker on a 2nd screen,
//   or a forged API request, can still pass — browser liveness is a deterrent, not proof.
//   The audit frames are uploaded so any fraud is reviewable on the POS. Paid SDK = the
//   real fix if this is ever defeated. YAW_TURN_MIN is calibrated to a real phone; verify
//   with the debug readout if cameras/lighting change.
const CONSISTENCY_MAX = 0.55; // same person across frontal frames (pose-tolerant)
const FRONTAL_YAW = 0.12; // |yaw| below this = looking straight enough to trust identity
const TIMEOUT_MS = 30_000;
const TICK_MS = 160;

// Fixed order: "turn" records WHICH way they went; "turnBack" then requires the opposite
// side, so the sequence can't be shuffled (turnBack depends on turn's direction).
function challengeSequence(): Challenge[] {
  return ["turn", "turnBack"];
}

const INSTRUCTION: Record<Challenge, string> = {
  turn: "Turn your head to one side",
  turnBack: "Now turn your head the OTHER way",
};

export default function LivenessCapture({ title, onComplete, onCancel, debug }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faceapiRef = useRef<any>(null);
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const startedAtRef = useRef(0);

  // Challenge progression + evidence (refs so the detection loop isn't re-created).
  const challengesRef = useRef<Challenge[]>([]);
  const stepRef = useRef(0);
  const firstTurnSignRef = useRef(0); // which way the first turn went (+1/-1); turnBack must oppose it
  const lockedDescRef = useRef<number[] | null>(null);
  const framesRef = useRef<Blob[]>([]);
  const selfieRef = useRef<Blob | null>(null);

  const [phase, setPhase] = useState<"loading" | "active" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [instruction, setInstruction] = useState("");
  const [metrics, setMetrics] = useState({ face: false, ear: 0, yaw: 0 });

  const snapshot = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c) return resolve(null);
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d")?.drawImage(v, 0, 0);
      c.toBlob((b) => resolve(b), "image/jpeg", 0.9);
    });
  }, []);

  const fail = useCallback((msg: string) => {
    doneRef.current = true;
    setPhase("error");
    setErrMsg(msg);
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    async function setup() {
      try {
        // Dynamic import keeps face-api (heavy) out of the initial page bundle.
        const faceapi = await import("@vladmandic/face-api");
        faceapiRef.current = faceapi;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        challengesRef.current = challengeSequence();
        stepRef.current = 0;
        startedAtRef.current = Date.now();
        setInstruction(INSTRUCTION[challengesRef.current[0]]);
        setPhase("active");
        interval = setInterval(tick, TICK_MS);
      } catch (e) {
        const msg = (e as Error).message || "";
        fail(
          msg.includes("Permission") || msg.includes("denied")
            ? "Camera access denied — allow the camera and retry."
            : "Couldn't start the camera / load the face models.",
        );
      }
    }

    async function tick() {
      if (doneRef.current || busyRef.current) return;
      if (Date.now() - startedAtRef.current > TIMEOUT_MS) {
        fail("Liveness timed out — please try again.");
        return;
      }
      const faceapi = faceapiRef.current;
      const v = videoRef.current;
      if (!faceapi || !v) return;
      busyRef.current = true;
      try {
        const det = await faceapi
          .detectSingleFace(v, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!det) {
          setMetrics({ face: false, ear: 0, yaw: 0 });
          return;
        }

        const lm = det.landmarks;
        const leftEye = lm.getLeftEye() as Pt[];
        const rightEye = lm.getRightEye() as Pt[];
        const ear = (eyeAspectRatio(leftEye) + eyeAspectRatio(rightEye)) / 2;
        const yaw = headYaw(lm.positions as Pt[]);
        const descriptor = Array.from(det.descriptor as Float32Array);
        const frontal = Math.abs(yaw) < FRONTAL_YAW;

        if (debug) setMetrics({ face: true, ear, yaw });

        // Identity lock + consistency: only judge identity on frontal frames so a head
        // turn doesn't false-reject. First frontal frame locks the face + the selfie.
        if (frontal && ear > BLINK_EAR_OPEN) {
          if (!lockedDescRef.current) {
            lockedDescRef.current = descriptor;
            selfieRef.current = await snapshot();
          } else if (euclideanDistance(descriptor, lockedDescRef.current) > CONSISTENCY_MAX) {
            fail("Face changed during the check — please retry alone.");
            return;
          }
        }

        // Drive the current challenge.
        const current = challengesRef.current[stepRef.current];
        let passed = false;
        if (current === "turn") {
          // First turn: any direction past the threshold. Record WHICH way for turnBack.
          if (Math.abs(yaw) > YAW_TURN_MIN) {
            firstTurnSignRef.current = Math.sign(yaw);
            passed = true;
          }
        } else if (current === "turnBack") {
          // Second turn must be the OPPOSITE side (sign flipped) — a real head sweeps both
          // ways; a photo can't. The pass through center between turns also re-locks identity.
          if (
            firstTurnSignRef.current !== 0 &&
            Math.sign(yaw) === -firstTurnSignRef.current &&
            Math.abs(yaw) > YAW_TURN_MIN
          ) {
            passed = true;
          }
        }

        if (passed) {
          const f = await snapshot();
          if (f) framesRef.current.push(f);
          stepRef.current += 1;

          if (stepRef.current >= challengesRef.current.length) {
            // All challenges done. Need a locked descriptor + selfie (a frontal frame).
            if (!lockedDescRef.current || !selfieRef.current) {
              fail("Couldn't get a clear frontal face — please retry.");
              return;
            }
            doneRef.current = true;
            if (interval) clearInterval(interval);
            onComplete({
              descriptor: lockedDescRef.current,
              selfie: selfieRef.current,
              frames: framesRef.current,
              challenges: challengesRef.current,
            });
            return;
          }
          setInstruction(INSTRUCTION[challengesRef.current[stepRef.current]]);
        }
      } catch {
        // A single failed frame is fine; the next tick retries.
      } finally {
        busyRef.current = false;
      }
    }

    setup();
    return () => {
      doneRef.current = true;
      if (interval) clearInterval(interval);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-bg/95 p-4">
      <button
        type="button"
        onClick={onCancel}
        title="Cancel face check"
        className="absolute right-4 top-4 rounded-full bg-bg-elev p-2 text-cream-dim hover:text-cream"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-2 text-cream">
        <ScanFace className="h-5 w-5 text-amber" />
        <span className="font-display text-sm font-bold">{title}</span>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-2xl border border-line-bright">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-auto w-[min(90vw,22rem)] -scale-x-100 object-cover"
        />
        {phase === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-soft">
            <Loader2 className="h-6 w-6 animate-spin text-amber" />
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {phase === "active" && (
        <p className="mt-4 animate-pulse text-center font-display text-base font-bold text-amber">
          {instruction}
        </p>
      )}
      {phase === "loading" && (
        <p className="mt-4 text-sm text-cream-dim">Loading face check…</p>
      )}
      {phase === "error" && (
        <div className="mt-4 max-w-xs text-center">
          <p className="text-sm text-red-400">{errMsg}</p>
          <button
            type="button"
            onClick={onCancel}
            title="Close and try again"
            className="mt-3 rounded-lg bg-bg-elev px-4 py-2 text-sm text-cream"
          >
            Close
          </button>
        </div>
      )}

      {debug && phase === "active" && (
        <p className="mt-3 font-mono text-[0.7rem] text-mocha">
          face:{metrics.face ? "yes" : "no"} yaw:{metrics.yaw.toFixed(2)}
        </p>
      )}
    </div>
  );
}
