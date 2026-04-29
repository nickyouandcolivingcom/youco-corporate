/**
 * Common parsing helpers shared across mortgage lender parsers.
 */

const MONTHS_LONG: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
};
const MONTHS_SHORT: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04",
  may: "05", jun: "06", jul: "07", aug: "08",
  sep: "09", oct: "10", nov: "11", dec: "12",
};

export function parseDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s.trim().replace(/(\d+)(st|nd|rd|th)/i, "$1").replace(/\s+/g, " ");
  // "5 May 2022" / "05 May 2022" / "21 May 2025"
  const m1 = t.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
  if (m1) {
    const mm = MONTHS_LONG[m1[2].toLowerCase()] ?? MONTHS_SHORT[m1[2].slice(0, 3).toLowerCase()];
    if (mm) return `${m1[3]}-${mm}-${m1[1].padStart(2, "0")}`;
  }
  // "09/01/2024" → 2024-01-09 (DD/MM/YYYY)
  const m2 = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    return `${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  }
  // ISO YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return null;
}

export function num(s: string | undefined | null): string | null {
  if (!s) return null;
  const v = s.replace(/[£,\s]/g, "");
  if (!v) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : String(n);
}

/**
 * Compute the fixed_end_date (refinancing date) given offer/completion
 * date + fixed period in months. Used as a fallback when the lender
 * doesn't state the date explicitly.
 */
export function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
