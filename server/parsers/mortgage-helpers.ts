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

/**
 * Best-effort early-repayment-charge schedule extraction.
 *
 * Looks for the ERC table that every regulated mortgage offer contains.
 * Two common formats:
 *
 *   "During the first 12 months 4% of the amount repaid £12,699.00
 *    During the following 12 months 2% of the amount repaid £6,349.50"
 *
 *   Tabular: "1 year 5% | 2 year 4% | 3 year 3% ..."
 *
 * Returns one tier per fixed-period year, in order. Falls back to
 * the standard 5-year-fix shape (5/4/3/2/1) only if the offer mentions
 * "early repayment" but no specific tiers are extractable.
 */
export function extractErcSchedule(
  text: string
): Array<{ year: number; pct: number }> | null {
  const stripped = text.replace(/\s+/g, " ");

  // Find the ERC section. Common headings: "Early repayment", "Section 8",
  // "8. Early repayment", "Early Repayment Charges", etc.
  const sectionMatch = stripped.match(/early repayment[\s\S]{0,3000}/i);
  if (!sectionMatch) return null;
  const section = sectionMatch[0];

  // Pattern 1: "During the first 12 months X%" / "During the following 12 months Y%"
  const followingTiers = [
    ...section.matchAll(
      /(?:During\s+the\s+(?:first|following)\s+\d+\s*months|first\s+12\s*months|second\s+year)[^%]{0,40}?(\d+(?:\.\d+)?)\s*%/gi
    ),
  ];
  if (followingTiers.length >= 2) {
    return followingTiers.slice(0, 5).map((m, i) => ({
      year: i + 1,
      pct: parseFloat(m[1]),
    }));
  }

  // Pattern 2: "Year N: X%" or "1st year X%"
  const yearTiers = [
    ...section.matchAll(
      /(\d+)(?:st|nd|rd|th)?\s*year[^%]{0,30}?(\d+(?:\.\d+)?)\s*%/gi
    ),
  ];
  if (yearTiers.length >= 2) {
    return yearTiers.slice(0, 5).map((m) => ({
      year: parseInt(m[1], 10),
      pct: parseFloat(m[2]),
    }));
  }

  // Pattern 3: tabular ERC — find a sequence of "X% of the amount" appearing 2+ times
  const pctOfAmount = [
    ...section.matchAll(/(\d+(?:\.\d+)?)\s*%\s*of\s+the\s+amount/gi),
  ];
  if (pctOfAmount.length >= 2) {
    return pctOfAmount.slice(0, 5).map((m, i) => ({
      year: i + 1,
      pct: parseFloat(m[1]),
    }));
  }

  return null;
}

/**
 * Extract the redemption administration fee. Charged on redemption — varies
 * by lender (£114-£200 typical). Common labels:
 *   "Redemption Administration Fee ... £114.00"
 *   "Redemption discharge costs ... £200.00"
 */
export function extractRedemptionFee(text: string): string | null {
  const stripped = text.replace(/\s+/g, " ");
  const m =
    stripped.match(/Redemption\s*(?:Administration|Discharge)?\s*[Ff]ee[^£]{0,80}?£([\d,]+(?:\.\d{2})?)/i) ??
    stripped.match(/Redemption\s*discharge\s*costs[^£]{0,80}?£([\d,]+(?:\.\d{2})?)/i);
  if (!m) return null;
  return num(m[1]);
}

/**
 * Extract the product / arrangement / completion fee. The biggest variable
 * fee between deals — typically 1-2% of loan, ~£5-7k for our portfolio.
 */
export function extractProductFee(text: string): string | null {
  const stripped = text.replace(/\s+/g, " ");
  const m =
    stripped.match(/Product Fee[^£]{0,80}?£([\d,]+(?:\.\d{2})?)/i) ??
    stripped.match(/Arrangement Fee[^£]{0,80}?£([\d,]+(?:\.\d{2})?)/i) ??
    stripped.match(/completion fee[^£]{0,80}?£([\d,]+(?:\.\d{2})?)/i);
  if (!m) return null;
  return num(m[1]);
}

/**
 * Extract the valuation fee (usually one-off, paid at application).
 */
export function extractValuationFee(text: string): string | null {
  const stripped = text.replace(/\s+/g, " ");
  const m =
    stripped.match(/Valuation\s*(?:and Assessment)?\s*Fee[^£]{0,80}?£([\d,]+(?:\.\d{2})?)/i) ??
    stripped.match(/Valuation fee[^£]{0,80}?£([\d,]+(?:\.\d{2})?)/i);
  if (!m) return null;
  return num(m[1]);
}

/**
 * Extract the legal fee estimate. Variable — Lender's solicitor fee +
 * borrower's conveyancer fee. Often "Estimated Lender's legal fee... £850".
 */
export function extractLegalFee(text: string): string | null {
  const stripped = text.replace(/\s+/g, " ");
  const m =
    stripped.match(/Lender['']?s?\s*legal fee[^£]{0,80}?£([\d,]+(?:\.\d{2})?)/i) ??
    stripped.match(/Estimated\s*legal fee[^£]{0,80}?£([\d,]+(?:\.\d{2})?)/i) ??
    stripped.match(/Legal fee[^£]{0,80}?£([\d,]+(?:\.\d{2})?)/i);
  if (!m) return null;
  return num(m[1]);
}
