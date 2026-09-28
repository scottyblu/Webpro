/**
 * Clean up Supabase settings pasted into the hosting dashboard.
 * Common mistakes this forgives: copying the REST URL (".../rest/v1/"),
 * a trailing slash, surrounding spaces or quotes, or leaving off "https://".
 * Safe to use in the browser (no secrets are read here).
 */
function stripQuotes(value: string): string {
  return value.trim().replace(/^["']+|["']+$/g, "").trim();
}

export function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  let value = stripQuotes(raw);
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    return new URL(value).origin; // drops any path such as /rest/v1/
  } catch {
    return value;
  }
}

export function normalizeKey(raw: string | undefined): string | undefined {
  return raw ? stripQuotes(raw).replace(/\s+/g, "") : raw;
}
