/**
 * Phone helpers. Cameroon numbers are written many ways (677123456, 0677 12 34 56, +237 677 12 34 56,
 * 00237677123456). We match on the LAST 9 DIGITS so all of those are the same number.
 */
function digits(v) { return String(v || '').replace(/\D/g, ''); }

/** Last 9 digits, or '' if the number is too short to be a real phone number. */
function last9(v) {
  const d = digits(v);
  return d.length >= 9 ? d.slice(-9) : '';
}

/** E.164 (+237…) for sending. Numbers already carrying a country code (11-15 digits) are kept as they are. */
function toE164(v, defaultCountryCode = '237') {
  let d = digits(v);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9) return `+${defaultCountryCode}${d}`;
  if (d.length === 10 && d.startsWith('0')) return `+${defaultCountryCode}${d.slice(1)}`;
  if (d.length >= 11 && d.length <= 15) return `+${d}`;
  return null;
}

/** 6•••••123 style, for showing "code sent to" without revealing the whole number. */
function mask(v) {
  const d = digits(v);
  if (d.length < 6) return '••••';
  return `${d.slice(0, 1)}${'•'.repeat(Math.max(d.length - 4, 3))}${d.slice(-3)}`;
}

/** wa.me click-to-chat link (works without any API: staff tap it and WhatsApp opens with the text ready). */
function waLink(phone, text) {
  const e = toE164(phone);
  if (!e) return null;
  return `https://wa.me/${e.slice(1)}?text=${encodeURIComponent(text)}`;
}

module.exports = { digits, last9, toE164, mask, waLink };
