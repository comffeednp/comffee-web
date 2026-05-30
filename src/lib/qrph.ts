// EMVCo "QR Ph" builder for DIY online-reservation payments — the TypeScript twin of the POS's
// buildDynamicQrphTlv (comffee-pos/main.js ~2069). It MUST stay byte-for-byte identical to the POS:
// a QR built here has to pay into the SAME PayMongo account and carry the SAME amount the POS's
// PayMongo automatch looks for, or a paid booking will never confirm.
//
// PROVEN transform (took a real ₱5 in POS testing): from the owner's STATIC Bookings QR Ph string,
// keep every routing field byte-for-byte, and ONLY (a) flip POI tag 01 from 11/static -> 12/dynamic
// and (b) inject the Transaction Amount tag 54 immediately after the PHP currency tag 53, then
// recompute the CRC (tag 63). String surgery — NOT a parse+rebuild — because a QR Ph payload has
// nested templates (28/62/88) whose sub-fields must survive untouched.

/** CRC-16/CCITT-FALSE over the payload up to and including the "6304" CRC tag id. */
export function crc16CcittFalse(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Build the per-booking dynamic QR Ph string from the branch's stored static Bookings QR.
 * @param baseTlv  the raw EMVCo string of the owner's Bookings QR Ph (branch_payment_config.booking_qr_tlv)
 * @param amountPhp the exact peso total the customer pays (₱10 fee + PC time / top-up)
 * @throws if no QR is configured or the stored QR is not a PHP QR Ph code.
 */
export function buildDynamicQrphTlv(baseTlv: string, amountPhp: number): string {
  if (!baseTlv || typeof baseTlv !== "string" || baseTlv.length < 20)
    throw new Error("This branch has no Bookings QR set up yet.");
  if (!/^0002010102/.test(baseTlv))
    throw new Error("The stored Bookings QR has an unexpected header.");
  const amtStr = Number(amountPhp).toFixed(2);
  const tag54 = "54" + String(amtStr.length).padStart(2, "0") + amtStr;
  let body = baseTlv.replace(/6304[0-9A-Fa-f]{4}$/, ""); // drop the trailing CRC (tag 63)
  if (body === baseTlv) throw new Error("The stored Bookings QR has no CRC tail.");
  body = "000201010212" + body.slice(12); // POI 11 (static) -> 12 (dynamic)
  const injected = body.replace(/5303608/, "5303608" + tag54); // amount right after PHP currency tag 53
  if (injected === body) throw new Error("The stored Bookings QR is not a PHP QR Ph code.");
  const withCrcTag = injected + "6304";
  return withCrcTag + crc16CcittFalse(withCrcTag);
}
