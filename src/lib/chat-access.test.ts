import { describe, expect, it } from "vitest";
import {
  canAccessConversation,
  canAccessConversationById,
  conversationBranchId,
  managerBranchIds,
  type ChatAccessDb,
} from "./chat-access";

// A stub of the two queries chat-access makes, seeded with two cafes' data —
// proving the cross-branch refusals without a live database. Both branch-chat
// routes (staff clock-in + manager /inbox) call these exact helpers before
// every read and every reply.
const BRANCH_A = "aaaaaaaa-0000-0000-0000-000000000001";
const BRANCH_B = "bbbbbbbb-0000-0000-0000-000000000002";
const CONV_A = "conv-a";
const CONV_B = "conv-b";
const CONV_HQ = "conv-hq"; // no branch — the owner's HQ thread

function stubDb(): ChatAccessDb {
  const managers: Record<string, string[]> = {
    "owner-a@gmail.com": [BRANCH_A],
    "owner-b@gmail.com": [BRANCH_B],
    "multi@gmail.com": [BRANCH_A, BRANCH_B],
  };
  const conversations: Record<string, string | null> = {
    [CONV_A]: BRANCH_A,
    [CONV_B]: BRANCH_B,
    [CONV_HQ]: null,
  };
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(_col: string, value: string) {
              const result =
                table === "branch_chat_managers"
                  ? { data: (managers[value] ?? []).map((b) => ({ branch_id: b })) }
                  : { data: null };
              return Object.assign(
                {
                  maybeSingle: async () =>
                    table === "chat_conversations" && value in conversations
                      ? { data: { branch_id: conversations[value] } }
                      : { data: null },
                },
                { then: (resolve: (v: typeof result) => unknown) => resolve(result) },
              ) as never;
            },
          };
        },
      } as never;
    },
  };
}

describe("canAccessConversation (the pure decision)", () => {
  it("allows a caller into their own branch's conversation", () => {
    expect(canAccessConversation([BRANCH_A], BRANCH_A)).toBe(true);
  });
  it("REFUSES another branch's conversation", () => {
    expect(canAccessConversation([BRANCH_A], BRANCH_B)).toBe(false);
  });
  it("REFUSES an HQ conversation (no branch) to any branch caller", () => {
    expect(canAccessConversation([BRANCH_A, BRANCH_B], null)).toBe(false);
  });
  it("REFUSES a caller with no branches at all (fail closed)", () => {
    expect(canAccessConversation([], BRANCH_A)).toBe(false);
  });
  it("allows a multi-branch manager into any of THEIR branches only", () => {
    expect(canAccessConversation([BRANCH_A, BRANCH_B], BRANCH_A)).toBe(true);
    expect(canAccessConversation([BRANCH_A, BRANCH_B], BRANCH_B)).toBe(true);
    expect(canAccessConversation([BRANCH_A, BRANCH_B], "cccccccc-0000-0000-0000-000000000003")).toBe(false);
  });
});

describe("managerBranchIds (the roster lookup)", () => {
  it("returns the branches a manager email covers", async () => {
    expect(await managerBranchIds(stubDb(), "owner-a@gmail.com")).toEqual([BRANCH_A]);
    expect(await managerBranchIds(stubDb(), "multi@gmail.com")).toEqual([BRANCH_A, BRANCH_B]);
  });
  it("normalizes case — Google emails compare lowercased", async () => {
    expect(await managerBranchIds(stubDb(), "  Owner-A@Gmail.com ")).toEqual([BRANCH_A]);
  });
  it("returns nothing for an unknown email or a blank one", async () => {
    expect(await managerBranchIds(stubDb(), "stranger@gmail.com")).toEqual([]);
    expect(await managerBranchIds(stubDb(), "  ")).toEqual([]);
  });
});

describe("canAccessConversationById (what the routes call before every read/reply)", () => {
  it("cafe A's manager reads cafe A's conversation", async () => {
    expect(await canAccessConversationById(stubDb(), [BRANCH_A], CONV_A)).toBe(true);
  });
  it("cafe A's manager is REFUSED cafe B's conversation (crafted id)", async () => {
    expect(await canAccessConversationById(stubDb(), [BRANCH_A], CONV_B)).toBe(false);
  });
  it("cafe B's manager is REFUSED cafe A's conversation", async () => {
    expect(await canAccessConversationById(stubDb(), [BRANCH_B], CONV_A)).toBe(false);
  });
  it("an unknown conversation id is REFUSED (no leak about existence)", async () => {
    expect(await canAccessConversationById(stubDb(), [BRANCH_A], "no-such-conv")).toBe(false);
  });
  it("an HQ conversation is REFUSED to branch callers", async () => {
    expect(await canAccessConversationById(stubDb(), [BRANCH_A, BRANCH_B], CONV_HQ)).toBe(false);
  });
  it("a caller with no branches never even reaches the lookup", async () => {
    expect(await canAccessConversationById(stubDb(), [], CONV_A)).toBe(false);
  });
});
