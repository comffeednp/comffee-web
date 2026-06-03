// Single source of truth for the face-scan acknowledgment. Imported by the client gate
// (AttendanceClient) AND the server (ack/route.ts + enroll/route.ts) so the version they compare
// can never drift. Bump FACE_CONSENT_VERSION whenever the wording materially changes — every
// staffer is then re-prompted before their NEXT enrollment (one-time per version, not per scan).
export const FACE_CONSENT_VERSION = 1;

// Owner-approved wording (2026-06-04). There is intentionally NO opt-out: face scan is the only
// clock-in method, so this is an ACKNOWLEDGMENT, not optional consent — it must be backed by a
// "face-scan attendance is a condition of employment" line in each cafe's employment contract.
export const FACE_CONSENT = {
  title: "Face-scan attendance — please read",
  body: [
    "To clock in and out, this app scans your face. Your face data is stored securely and used only to confirm it is really you at the start and end of your shift, to compute your pay, and to stop anyone clocking in for someone else.",
    "Face scan is the only way to clock in here — there is no PIN or password alternative, and it is part of your job here.",
    "Your phone's location is checked only at the moment you clock in or out — never at any other time.",
    "This phone will be locked to your account. To use a different phone later, your admin must reset it on the POS.",
    "Your face template is deleted within 30 days after you stop working here; your time records are kept for 3 years, as the law requires.",
    "Under the Data Privacy Act you may ask to see or correct your data, or raise a concern. Contact your admin or comffee.dpo@gmail.com.",
  ],
  acceptLabel: "I understand — continue",
} as const;
