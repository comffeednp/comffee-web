import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAccessToken, isSumsubConfigured } from "@/lib/sumsub";
import { guardMutating } from "@/lib/security";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.string().min(1).max(120),
});

export async function POST(request: Request) {
  if (!isSumsubConfigured()) {
    return NextResponse.json({ error: "sumsub_not_configured" }, { status: 503 });
  }

  const guarded = await guardMutating(request, {
    bucket: "sumsub-token",
    limit: 10,
    windowMs: 10 * 60 * 1000,
    maxBytes: 2048,
  });
  if ("error" in guarded) return guarded.error;

  const parsed = schema.safeParse(guarded.json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }

  try {
    const token = await generateAccessToken(parsed.data.userId, "id-and-liveness");
    return NextResponse.json({ token });
  } catch (e) {
    console.error("sumsub token error", e);
    return NextResponse.json(
      { error: "token_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
