/**
 * Month/year ("period") helpers. Payments are organised by calendar month in the
 * club's configured time zone, e.g. { year: 2026, month: 9 } = September 2026.
 */
export interface Period {
  year: number;
  month: number; // 1-12
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The calendar date (YYYY-MM-DD) of an instant in the given time zone. */
export function zonedDateString(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function periodOfDate(date: Date, timeZone: string): Period {
  return periodOfDateString(zonedDateString(date, timeZone));
}

export function periodOfDateString(ymd: string): Period {
  const [y, m] = ymd.split("-").map(Number);
  return { year: y!, month: m! };
}

export function currentPeriod(timeZone: string, now = new Date()): Period {
  return periodOfDate(now, timeZone);
}

export function addMonths(p: Period, n: number): Period {
  const idx = p.year * 12 + (p.month - 1) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Negative if a < b, 0 if equal, positive if a > b. */
export function comparePeriods(a: Period, b: Period): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export function periodKey(p: Period): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

export function parsePeriodKey(key: string | null | undefined): Period | null {
  if (!key) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2200) return null;
  return { year, month };
}

export function periodLabel(p: Period): string {
  return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
}

export function periodShortLabel(p: Period): string {
  return `${MONTH_NAMES[p.month - 1]!.slice(0, 3)} ${String(p.year).slice(2)}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function firstDayOf(p: Period): string {
  return `${p.year}-${pad(p.month)}-01`;
}

export function lastDayOf(p: Period): string {
  const days = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  return `${p.year}-${pad(p.month)}-${pad(days)}`;
}

/** The due date (YYYY-MM-DD) for a month, given the club's payment due day (1-28). */
export function dueDateOf(p: Period, dueDay: number): string {
  return `${p.year}-${pad(p.month)}-${pad(Math.min(Math.max(dueDay, 1), 28))}`;
}

/** Inclusive list of periods from `from` to `to`, newest first. */
export function periodRange(from: Period, to: Period): Period[] {
  const out: Period[] = [];
  let p = to;
  while (comparePeriods(p, from) >= 0) {
    out.push(p);
    p = addMonths(p, -1);
  }
  return out;
}
