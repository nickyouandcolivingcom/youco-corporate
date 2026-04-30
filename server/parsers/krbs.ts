/**
 * Parser for Kent Reliance / OneSavingsBank ("KRBS") mortgage offer
 * letters. Used for 16RC, 10KG, 27BL.
 *
 * Format markers:
 *   - "Reference number: 70038438" or "Our ref: 4001130500"
 *   - "Property address: 16, Richmond Crescent, Vicars Cross, Chester, CH3 5PB"
 *   - "This offer is based on a loan of £288,454.62"
 *   - Date format "05 May 2022" or "21 May 2025"
 *   - ESIS appended for fixed rate %, term, fixed period, reversionary etc.
 */

import { matchAddressToPropertyCode } from "./address-match.js";
import {
  parseDate,
  num,
  extractErcSchedule,
  extractRedemptionFee,
  extractProductFee,
  extractValuationFee,
  extractLegalFee,
} from "./mortgage-helpers.js";
import type { MortgageRow, MortgageParseResult } from "./mortgage-types.js";

export function parseKrbsOffer(
  text: string,
  fallbackPropertyCode?: string
): MortgageParseResult {
  const stripped = text.replace(/\s+/g, " ");

  // Reference / account number
  const refMatch =
    stripped.match(/Reference number:\s*([A-Z0-9-]+)/i) ??
    stripped.match(/Our ref:\s*([A-Z0-9-]+)/i);
  const lenderReference = refMatch?.[1] ?? null;

  // Property address
  const addrMatch = stripped.match(
    /Property address:\s*([^\n]+?)(?=\s{2}|\.|Thank you|Re:|Dear)/i
  );
  const supplyAddress = addrMatch?.[1]?.trim();
  let propertyCode: string | null =
    (supplyAddress && matchAddressToPropertyCode(supplyAddress)) ?? null;
  // 27BL alt — KRBS may write "27 Brook Lane" without flat letter
  if (!propertyCode && /27\s*Brook\s*Lane/i.test(stripped)) propertyCode = "27BL";
  if (!propertyCode && fallbackPropertyCode) propertyCode = fallbackPropertyCode;
  if (!propertyCode) {
    return { ok: false, error: "Could not identify property from KRBS offer letter" };
  }

  // Loan amount: "This offer is based on a loan of £288,454.62"
  const loanMatch =
    stripped.match(/loan of\s*£([\d,]+(?:\.\d{2})?)/i) ??
    stripped.match(/Mortgage Summary[\s\S]{0,200}?£([\d,]+(?:\.\d{2})?)/i);
  const loanAmount = num(loanMatch?.[1]);

  // Valuation: "Property valuation: £615,000.00" or "estimated value: £615,000.00"
  const valMatch =
    stripped.match(/Property valuation:\s*£([\d,]+(?:\.\d{2})?)/i) ??
    stripped.match(/Purchase price[\s\S]{0,40}?£([\d,]+(?:\.\d{2})?)/i);
  const valuation = num(valMatch?.[1]);

  // Term: "Term: 22 years" or "Term: 25 years"
  const termMatch = stripped.match(/Term:\s*(\d+)\s*years/i);
  const termMonths = termMatch ? parseInt(termMatch[1], 10) * 12 : null;

  // Offer date: top-of-letter "05 May 2022"
  const dateMatch = stripped.match(/^[\s\S]{0,200}?(\d{1,2}\s+\w+\s+\d{4})/);
  const offerDate = parseDate(dateMatch?.[1]);

  // Reversionary rate: "currently 6.83%"
  const revMatch = stripped.match(
    /(?:current|reversionary|reverting)[^%]{0,80}?(\d+\.\d{2,3})\s*%/i
  );
  const reversionaryMarginPct = revMatch?.[1] ?? null;

  // Repayment type — KRBS interest-only is common
  const repaymentType = /interest only/i.test(stripped) ? "Interest Only" : null;

  // Borrower entity
  const borrower = /MONOCROM/i.test(stripped) ? "MONOCROM" : "YCO";

  const row: MortgageRow = {
    lender: "Kent Reliance",
    propertyCode,
    borrowerEntity: borrower,
    accountNumber: lenderReference,
    lenderReference,
    offerDate,
    expiryDate: null,
    loanAmount,
    valuation,
    termMonths,
    repaymentType,
    fixedRatePct: null,
    fixedPeriodMonths: null,
    fixedEndDate: null,
    reversionaryMarginPct,
    reversionaryFloorPct: null,
    monthlyPaymentFixed: null,
    ercSchedule: extractErcSchedule(text),
    productFee: extractProductFee(text),
    valuationFee: extractValuationFee(text),
    legalFee: extractLegalFee(text),
    redemptionFee: extractRedemptionFee(text),
    notes: null,
  };

  return { ok: true, row };
}
