// Philippines-only gate. The repo has no IP-geo today; Vercel injects `x-vercel-ip-country` in prod
// (null locally / in dev). We allow PH or unknown (so dev + any header gap don't hard-block); the HARD
// gate is that PayMongo only charges in PHP, so a VPN user still can't actually pay. Order / OCR / pay
// endpoints all re-check this server-side.
export function requestCountry(req: Request): string | null {
  return req.headers.get("x-vercel-ip-country");
}

export function isPhAllowed(req: Request): boolean {
  const c = requestCountry(req);
  return c === null || c === "" || c === "PH";
}
