// Game Top-Ups order state machine. Pure — all transitions are enforced server-side; the client is
// never authoritative. See docs/game-topups-design.md.
//
//   draft ──OCR pass──> verified ──paid(webhook)──> pending ──staff claim──> processing ──all lines ✅──> delivered
//     │                                                  │                        │
//     └── OCR retry (ladder)                             └── SLA breach ─> failed ─> refunded (auto)

export const TOPUP_STATUSES = [
  "draft",
  "verified",
  "pending",
  "processing",
  "delivered",
  "failed",
  "refunded",
] as const;

export type TopupStatus = (typeof TOPUP_STATUSES)[number];

const TRANSITIONS: Record<TopupStatus, TopupStatus[]> = {
  draft: ["verified"],
  verified: ["pending"], // paid (webhook only)
  pending: ["processing", "failed", "refunded"],
  processing: ["delivered", "failed", "refunded", "pending"],
  delivered: [],
  failed: ["refunded"],
  refunded: [],
};

export function canTransition(from: TopupStatus, to: TopupStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(s: TopupStatus): boolean {
  return s === "delivered" || s === "refunded";
}

/** An order awaiting / mid fulfilment — eligible to receive Codashop confirmations. */
export function isOpenForFulfilment(s: TopupStatus): boolean {
  return s === "pending" || s === "processing";
}
