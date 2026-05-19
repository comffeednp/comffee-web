import { NextResponse } from "next/server";
import { z } from "zod";
import { validatePromoCode } from "@/lib/promo-codes";
import { guardMutating } from "@/lib/security";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().min(1).max(40),
  amountPhp: z.number().positive(),
  target: z.enum(["order", "reservation"]),
});

export async function POST(request: Request) {
  const guarded = await guardMutating(request, {
    bucket: "promo-validate",
    limit: 10,
    windowMs: 5 * 60 * 1000,
    maxBytes: 4 * 1024,
  });
  if ("error" in guarded) return guarded.error;

  const parsed = schema.safeParse(guarded.json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_or_expired" }, { status: 400 });
  }
  try {
    const result = await validatePromoCode(
      parsed.data.code,
      parsed.data.amountPhp,
      parsed.data.target,
    );
    return NextResponse.json({
      ok: true,
      code: result.promoCode.code,
      description: result.promoCode.description,
      discountPhp: result.discountPhp,
      finalAmountPhp: result.finalAmountPhp,
    });
  } catch {
    // Generic error — never leak which validation step failed.
    // This prevents promo code enumeration via timing/error analysis.
    return NextResponse.json({ error: "invalid_or_expired" }, { status: 400 });
  }
}
