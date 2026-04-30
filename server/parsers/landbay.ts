/**
 * Parser for Landbay Partners Limited mortgage offer letters.
 * Used for 84DD, 26BLA, 26BLB, 26BLC.
 *
 * Format markers (from text-extractable PDFs like 26BLA):
 *   - "70060243 Case|" + "09/01/2024 Date produced"
 *   - "Applicant name: MONOCROM LIMITED"
 *   - "Security: Flat A, 26 Brook Lane, Chester, CH22AP"
 *   - "This offer will expire on 08/04/2024"
 *   - "This offer is based on a mortgage of £130,050.00"
 *   - "Valuation of the property: £170,000.00"
 *   - "Term: 23 years"
 *   - "Repayment method: Interest Only"
 *   - "A fixed rate which is 5.75% for 60 months ... reverting ... to 3.49% above Bank Rate"
 *   - "deemed not to go below a floor of 0.10%"
 *   - "current reversionary rate payable is therefore 8.74%"
 *
 * Older Landbay PDFs (e.g. 84DD) are form-template based and don't extract
 * field values — they yield mostly empty fields, in which case we still
 * return a row with whatever we can find (account ref, property, borrower)
 * and let the user fill in the rest manually.
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

export function parseLandbayOffer(
  text: string,
  fallbackPropertyCode?: string
): MortgageParseResult {
  const stripped = text.replace(/\s+/g, " ");

  // Case ref: "70060243 Case|" or older "Case 70060243"
  const caseMatch =
    stripped.match(/(\d{8})\s*Case/i) ??
    stripped.match(/Case[:\s|]+(\d{8})/i);
  const caseRef = caseMatch?.[1] ?? null;

  // Security/property: "Security: Flat A, 26 Brook Lane, Chester, CH22AP"
  const secMatch = stripped.match(/Security:\s*([^\n]+?)(?:About|Page|This offer|Applicant)/i);
  const securityAddress = secMatch?.[1]?.trim();
  let propertyCode = (securityAddress && matchAddressToPropertyCode(securityAddress)) ?? null;
  if (!propertyCode) propertyCode = matchAddressToPropertyCode(stripped) ?? null;
  if (!propertyCode && fallbackPropertyCode) propertyCode = fallbackPropertyCode;
  if (!propertyCode) {
    return {
      ok: false,
      error: "Could not identify property from Landbay offer (form-template PDF?)",
    };
  }

  // Loan amount: "based on a mortgage of £130,050.00"
  const loanMatch = stripped.match(/(?:mortgage|loan) of\s*£([\d,]+(?:\.\d{2})?)/i);
  const loanAmount = num(loanMatch?.[1]);

  // Valuation: "Valuation of the property: £170,000.00"
  const valMatch = stripped.match(/Valuation of the property:\s*£([\d,]+(?:\.\d{2})?)/i);
  const valuation = num(valMatch?.[1]);

  // Term: "Term: 23 years"
  const termMatch = stripped.match(/Term:\s*(\d+)\s*years/i);
  const termMonths = termMatch ? parseInt(termMatch[1], 10) * 12 : null;

  // Repayment method
  const repaymentType = /Repayment method:\s*Interest Only/i.test(stripped)
    ? "Interest Only"
    : /Repayment method:\s*Repayment/i.test(stripped)
    ? "Repayment"
    : null;

  // Fixed rate + period: "fixed rate which is 5.75% for 60 months"
  const fixedMatch = stripped.match(/fixed rate which is\s*(\d+\.\d{2,3})\s*%\s*for\s*(\d+)\s*months/i);
  const fixedRatePct = fixedMatch?.[1] ?? null;
  const fixedPeriodMonths = fixedMatch ? parseInt(fixedMatch[2], 10) : null;

  // Reversionary margin: "to 3.49% above Bank Rate"
  const revMatch = stripped.match(/(\d+\.\d{2,3})\s*%\s*above\s*Bank\s*Rate/i);
  const reversionaryMarginPct = revMatch?.[1] ?? null;

  // Floor: "deemed not to go below a floor of 0.10%"
  const floorMatch = stripped.match(/floor of\s*(\d+\.\d{1,3})\s*%/i);
  const reversionaryFloorPct = floorMatch?.[1] ?? null;

  // Date produced + expiry
  const dateProducedMatch = stripped.match(/Date produced\s*(\d{1,2}\/\d{1,2}\/\d{4})/i) ??
    stripped.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*Date produced/i);
  const offerDate = parseDate(dateProducedMatch?.[1]);
  const expiryMatch = stripped.match(/will expire on\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const expiryDate = parseDate(expiryMatch?.[1]);

  // Borrower entity — Landbay 26BL flats are MONOCROM
  const borrower = /MONOCROM/i.test(stripped) ? "MONOCROM" : "YCO";

  // Monthly payment (form fields often blank in older Landbay PDFs)
  const mpMatch = stripped.match(/Monthly Payments?[^£]{0,40}?£([\d,]+(?:\.\d{2})?)/i) ??
    stripped.match(/£([\d,]+\.\d{2})\s*Fee Amount/i);
  const monthlyPaymentFixed = num(mpMatch?.[1]);

  // If loan amount is missing this is the form-template case (e.g. 84DD).
  // Still return a row so the user can fill in via UI.
  const notes = !loanAmount
    ? "Landbay offer letter — form fields not extracted; please enter loan amount, rate, dates manually"
    : null;

  const row: MortgageRow = {
    lender: "Landbay",
    propertyCode,
    borrowerEntity: borrower,
    accountNumber: caseRef,
    lenderReference: caseRef,
    offerDate,
    expiryDate,
    loanAmount,
    valuation,
    termMonths,
    repaymentType,
    fixedRatePct,
    fixedPeriodMonths,
    fixedEndDate: null,
    reversionaryMarginPct,
    reversionaryFloorPct,
    monthlyPaymentFixed,
    ercSchedule: extractErcSchedule(text),
    productFee: extractProductFee(text),
    valuationFee: extractValuationFee(text),
    legalFee: extractLegalFee(text),
    redemptionFee: extractRedemptionFee(text),
    notes,
  };

  return { ok: true, row };
}
