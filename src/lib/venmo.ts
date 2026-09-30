/**
 * Venmo helpers. Venmo usernames are 5–30 letters, numbers, "-" or "_".
 * We store them without the leading "@".
 */
export function cleanVenmoUsername(input: string | null | undefined): string {
  return (input ?? "").trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.|account\.)?venmo\.com\/(u\/)?/i, "").replace(/[/?#].*$/, "");
}

export function isValidVenmoUsername(username: string): boolean {
  return /^[A-Za-z0-9_-]{5,30}$/.test(username);
}

/**
 * Link that opens Venmo (the app on phones, the website elsewhere) ready to pay
 * `username` the given amount with the note filled in.
 */
export function venmoPayLink(username: string, amountCents: number, note: string): string {
  // encodeURIComponent (not URLSearchParams) so spaces become %20, which Venmo shows as spaces.
  const amount = (amountCents / 100).toFixed(2);
  return `https://venmo.com/${encodeURIComponent(username)}?txn=pay&amount=${amount}&note=${encodeURIComponent(note)}`;
}

/** The Venmo profile page (fallback if the pay link doesn't pre-fill on a device). */
export function venmoProfileLink(username: string): string {
  return `https://venmo.com/u/${encodeURIComponent(username)}`;
}
