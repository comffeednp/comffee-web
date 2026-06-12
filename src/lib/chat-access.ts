// Branch-scoped chat authorization — the ONE decision point both branch-chat
// surfaces share (the staff clock-in panel's route and the manager /inbox
// route). A caller may touch a conversation ONLY when it belongs to a branch
// they are authorized for; a conversation with no branch belongs to HQ (the
// owner's /admin/chat) and is never visible to branch staff or managers.
//
// The Supabase client is injected (a minimal query surface) so the refusal
// logic is unit-testable without a live database — see chat-access.test.ts.

// Deliberately untyped query surface: the real SupabaseClient's builder
// generics are too deep for a structural stand-in (TS2589 at every call site),
// and the two queries here are trivial. The unit tests pin the row shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChatAccessDb = { from(table: string): any };

/** Branches this email manages (rows synced up from Clockwork Settings). */
export async function managerBranchIds(db: ChatAccessDb, email: string): Promise<string[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  const { data } = await db
    .from("branch_chat_managers")
    .select("branch_id")
    .eq("email", normalized);
  return ((data ?? []) as { branch_id: string }[]).map((r) => r.branch_id);
}

/** The branch a conversation belongs to (null = HQ conversation or unknown id). */
export async function conversationBranchId(
  db: ChatAccessDb,
  conversationId: string,
): Promise<string | null> {
  const { data } = await db
    .from("chat_conversations")
    .select("branch_id")
    .eq("id", conversationId)
    .maybeSingle();
  return data?.branch_id ?? null;
}

/**
 * The pure decision: branch callers reach ONLY conversations of their own
 * branch(es). No branch on the conversation -> refused (HQ-only). No branches
 * on the caller -> refused (fail closed).
 */
export function canAccessConversation(
  callerBranchIds: string[],
  convBranchId: string | null,
): boolean {
  if (!convBranchId) return false;
  if (!callerBranchIds.length) return false;
  return callerBranchIds.includes(convBranchId);
}

/** Look up + decide in one step — what the routes call before every read/reply. */
export async function canAccessConversationById(
  db: ChatAccessDb,
  callerBranchIds: string[],
  conversationId: string,
): Promise<boolean> {
  if (!callerBranchIds.length) return false; // skip the lookup when it can't pass
  const branchId = await conversationBranchId(db, conversationId);
  return canAccessConversation(callerBranchIds, branchId);
}
