/**
 * Turn a phone number as typed ("(555) 123-4567", "555.123.4567", "+1 555 123 4567")
 * into E.164 ("+15551234567") for sending texts. US numbers are assumed when no
 * country code is given. Returns null when it isn't a usable number.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
