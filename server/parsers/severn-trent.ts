/**
 * Parser for Severn Trent water bills (PDF).
 *
 * Two formats are in flight:
 *   - Old: numeric account number (e.g. 9260113256), detailed breakdown
 *   - New: A-XXX prefix (e.g. A-D43B6E23), summary-first layout, detail later
 *
 * Both have:
 *   - Annual billing period (typically 1 Apr - 31 Mar)
 *   - Fresh water charge (fixed/standing + rateable-value tariff)
 *   - Wastewater charge (fixed + tariff; sometimes billed on behalf of
 *     Dwr Cymru / Welsh Water for border properties)
 *   - Total annual bill
 *
 * Whichever fields we extract feed into water_invoices. Missing breakdowns
 * just leave those columns null — the total + period are always present.
 */

import type { WaterInvoiceRow } from "./water-types.js";
import { matchAddressToPropertyCode } from "./address-match.js";

interface AccountMap {
  /** account_number → propertyCode */
  [accountNumber: string]: string;
}

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

function parseDateLoose(s: string): string | null {
  const t = s.trim();
  // "01 April 2025" or "1 Apr 2026"
  const m = t.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
  if (!m) return null;
  const monthRaw = m[2].toLowerCase();
  const mm = MONTHS_LONG[monthRaw] ?? MONTHS_SHORT[monthRaw.slice(0, 3)];
  if (!mm) return null;
  return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
}

function num(s: string | undefined | null): number | null {
  if (!s) return null;
  const v = s.replace(/[£,\s]/g, "");
  if (!v) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export interface SevernTrentParseResult {
  ok: boolean;
  row?: WaterInvoiceRow;
  error?: string;
  accountNumber?: string;
  /** The address-derived property code, used when the account number isn't
   *  yet in the account map. The endpoint can auto-create a water_account
   *  row using this. */
  matchedByAddress?: string;
  supplyAddress?: string;
}

export function parseSevernTrentBill(
  text: string,
  accountMap: AccountMap
): SevernTrentParseResult {
  // Severn Trent's PDFs strip spaces in places. We need both spaced and
  // unspaced patterns.
  const stripped = text.replace(/\s+/g, " ");

  // 1. Account number: either "ACCOUNT NUMBER 9260113256" or
  //    "Account number A-D43B6E23" or "Ref: A-D43B6E23" / "ACCOUNTNUMBER9260113256"
  const accMatch =
    text.match(/ACCOUNTNUMBER\s*([A-Z0-9\-]+)/i) ??
    stripped.match(/Account ?number\s*:?\s*([A-Z0-9\-]+)/i) ??
    stripped.match(/Ref:\s*(A-[A-Z0-9]+)/i);
  if (!accMatch) {
    return { ok: false, error: "Could not find Severn Trent account number" };
  }
  const accountNumber = accMatch[1].trim();

  // Extract the supply address — useful both as fallback property mapping
  // and for storing on the water_account row when auto-creating.
  // Format varies. Try the most common Severn Trent layouts:
  //   - "Supply address\n16 Richmond Crescent\nVicars Cross, Chester, CH3 5PB"
  //   - "SUPPLYADDRESS\n16RICHMONDCRESCENT,\nVICARSCROSS\nCHESTER\nCH35PB"
  //   - "Supply address: 16 Richmond Crescent..."
  // We capture a generous window after the label and use it for fuzzy
  // matching; spaces, commas and case are normalised by the matcher.
  const addrMatch =
    stripped.match(/Supply ?address[:\s]+([\s\S]{5,200}?)(?:Issue|Billing|Page|$)/i) ??
    text.match(/SUPPLYADDRESS\s*([\s\S]{5,200}?)(?:ISSUEDATE|BILLINGPERIOD|Page|$)/i);
  const supplyAddress = addrMatch ? addrMatch[1].replace(/\s+/g, " ").trim() : undefined;

  // Resolve property code: account number map first, address fallback.
  let propertyCode = accountMap[accountNumber];
  let matchedByAddress: string | undefined;
  if (!propertyCode && supplyAddress) {
    const addrCode = matchAddressToPropertyCode(supplyAddress);
    if (addrCode) {
      propertyCode = addrCode;
      matchedByAddress = addrCode;
    }
  }
  if (!propertyCode) {
    return {
      ok: false,
      accountNumber,
      supplyAddress,
      error: supplyAddress
        ? `Could not match account ${accountNumber} or supply address "${supplyAddress}" to a property — add the account to Water → Accounts manually`
        : `Account ${accountNumber} not in account map and no supply address found`,
    };
  }

  // 2. Billing period — "1 Apr 2026 - 31 Mar 2027" or "01April 2025-31March2026"
  // Allow both space-stripped and spaced.
  const periodMatch =
    stripped.match(
      /(\d{1,2}\s+\w+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+\w+\s+\d{4})/
    ) ??
    text.match(
      /(\d{1,2}[A-Za-z]+\d{4})-(\d{1,2}[A-Za-z]+\d{4})/
    );

  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  if (periodMatch) {
    // Need to space-out the unspaced version if it matched the second pattern
    const stretch = (s: string) =>
      s.replace(/(\d+)([A-Za-z]+)(\d+)/, "$1 $2 $3");
    periodStart = parseDateLoose(stretch(periodMatch[1]));
    periodEnd = parseDateLoose(stretch(periodMatch[2]));
  }
  if (!periodStart || !periodEnd) {
    return {
      ok: false,
      accountNumber,
      error: "Could not parse billing period from PDF",
    };
  }

  // 3. Issue date — "Issue date 25 February 2026" or "ISSUE DATE 05 Mar 2025"
  const issueMatch =
    stripped.match(/Issue ?date\s*:?\s*(\d{1,2}\s+\w+\s+\d{4})/i) ??
    text.match(/ISSUEDATE\s*(\d{1,2}[A-Za-z]+\d{4})/i);
  let issueDate: string | null = null;
  if (issueMatch) {
    const raw = issueMatch[1].replace(/(\d+)([A-Za-z]+)(\d+)/, "$1 $2 $3");
    issueDate = parseDateLoose(raw);
  }

  // 4. Total — "Total charges this bill £1,408.27" (new),
  //    "Totalforbillingperiod...£1,271.69" (old), or
  //    "Subtotal for period £1,271.69".
  const totalMatch =
    stripped.match(/Total charges this bill\s*£([\d,]+\.\d{2})/i) ??
    stripped.match(/Total for billing period.*?£([\d,]+\.\d{2})/i) ??
    text.match(/Totalforbillingperiod[^£]*£([\d,]+\.\d{2})/i) ??
    text.match(/Subtotalforperiod\s*£([\d,]+\.\d{2})/i) ??
    stripped.match(/We have charged you\s*£([\d,]+\.\d{2})/i);

  const totalAmount = num(totalMatch?.[1]);
  if (totalAmount === null) {
    return {
      ok: false,
      accountNumber,
      error: "Could not extract total amount",
    };
  }

  // 5. Fresh water + wastewater subtotals (best effort).
  // Old format: "Subtotal£472.61Subtotal£799.08" (two consecutive)
  // New format: separate "Water fixed charge £111.37" + "...£394.66"
  let freshWaterAmount: number | null = null;
  let wastewaterAmount: number | null = null;

  const oldSubtotals = [...text.matchAll(/Subtotal\s*£([\d,]+\.\d{2})/g)];
  if (oldSubtotals.length >= 2) {
    freshWaterAmount = num(oldSubtotals[0][1]);
    wastewaterAmount = num(oldSubtotals[1][1]);
  } else {
    // Try new format: water section + wastewater section
    // Water fixed charge £X + (rateable charge) £Y
    const waterFixedMatch = stripped.match(
      /Water fixed charge\s*£([\d,]+\.\d{2})/i
    );
    const wasteFixedMatch = stripped.match(
      /Wastewater (?:and surface water drainage )?fixed\s*(?:charge[s]?)?\s*£([\d,]+\.\d{2})/i
    );
    // Rateable-value tariff lines occur after each fixed-charge label.
    // Capture all £X.XX amounts in sequence and use position relative to fixed-charge anchors.
    const fixedW = num(waterFixedMatch?.[1]);
    const fixedWW = num(wasteFixedMatch?.[1]);

    // Tariff rows: first occurs after "Water fixed charge", second after "Wastewater"
    // Pattern: "Rateable Value of NNN multiplied by the tariff charge of XXXp ... £Y"
    const tariffMatches = [
      ...stripped.matchAll(
        /tariff charge[^£]*£([\d,]+\.\d{2})/gi
      ),
    ];
    const tariffW = tariffMatches[0] ? num(tariffMatches[0][1]) : null;
    const tariffWW = tariffMatches[1] ? num(tariffMatches[1][1]) : null;

    if (fixedW != null || tariffW != null) {
      freshWaterAmount = (fixedW ?? 0) + (tariffW ?? 0);
    }
    if (fixedWW != null || tariffWW != null) {
      wastewaterAmount = (fixedWW ?? 0) + (tariffWW ?? 0);
    }
  }

  // 6. Standing charge (fresh-water fixed, capture for display).
  // Old format: "Standingcharge£80.25" right after fresh-water tariff.
  // New format: "Water fixed charge £X".
  let standingCharge: number | null = null;
  const standingOld = text.match(/Standingcharge\s*£([\d,]+\.\d{2})/);
  const standingNew = stripped.match(
    /Water fixed charge\s*£([\d,]+\.\d{2})/i
  );
  standingCharge = num(standingOld?.[1] ?? standingNew?.[1] ?? null);

  // 7. Notes about Welsh Water if present
  const isWelshWasteWater = /Dwr Cymru|Welsh Water/i.test(text);
  const notes = isWelshWasteWater
    ? "Wastewater portion billed by Severn Trent on behalf of Dwr Cymru / Welsh Water"
    : null;

  // 8. Invoice number — best guess from filename pattern not available here;
  // bill reference may not appear. Leave null for now (user can fill in).
  const invoiceNumber: string | null = null;

  return {
    ok: true,
    accountNumber,
    matchedByAddress,
    supplyAddress,
    row: {
      propertyCode,
      supplier: "Severn Trent",
      periodStart,
      periodEnd,
      amount: totalAmount.toFixed(2),
      freshWaterAmount: freshWaterAmount != null ? freshWaterAmount.toFixed(2) : null,
      wastewaterAmount: wastewaterAmount != null ? wastewaterAmount.toFixed(2) : null,
      standingChargeAmount: standingCharge != null ? standingCharge.toFixed(2) : null,
      issueDate,
      invoiceNumber,
      notes,
    },
  };
}
