/**
 * Parser for Precise Mortgages (Charter Court Financial Services) offer
 * letters. Used for 32LFR.
 *
 * Format markers:
 *   - "Reference: M2000267819"
 *   - "This document was produced for You & Co. Living Limited on 11 November 2021"
 *   - "Mortgage Offer is valid until 01 February 2022"
 *   - "Property : 32 Lowerfield Road, Chester, United Kingdom CH4 7QF"
 *   - "Amount and currency of the loan to be granted: £340,000.00 plus £5,125.00 for fees"
 *   - "Duration of the loan: 25 years"
 *   - "Repayment Type: Interest Only"
 *   - "Rate of Interest is fixed for 60 months ... fixed rate of 4.04%"
 *   - "5.40% above the Bank of England Base Rate"
 *   - "300 monthly payments of £1,161.92"
 */

import { matchAddressToPropertyCode } from "./address-match.js";
import { parseDate, num } from "./mortgage-helpers.js";
import type { MortgageRow, MortgageParseResult } from "./mortgage-types.js";

export function parsePreciseOffer(
  text: string,
  fallbackPropertyCode?: string
): MortgageParseResult {
  const stripped = text.replace(/\s+/g, " ");

  // Reference: M2000267819
  const refMatch = stripped.match(/Reference:\s*([A-Z0-9]+)/i);
  const lenderReference = refMatch?.[1] ?? null;

  // Property: "Property : 32 Lowerfield Road, Chester, United Kingdom CH4 7QF"
  const addrMatch = stripped.match(/Property\s*:\s*([^\n]+?)(?:Tenure|\.|Page)/i);
  let propertyCode = (addrMatch && matchAddressToPropertyCode(addrMatch[1])) ?? null;
  if (!propertyCode) propertyCode = matchAddressToPropertyCode(stripped) ?? null;
  if (!propertyCode && fallbackPropertyCode) propertyCode = fallbackPropertyCode;
  if (!propertyCode) {
    return { ok: false, error: "Could not identify property from Precise offer" };
  }

  // Loan amount: "£340,000.00 plus £5,125.00 for fees" — capture base loan
  const loanMatch =
    stripped.match(/loan to be granted[^£]{0,40}?£([\d,]+(?:\.\d{2})?)/i) ??
    stripped.match(/Amount and currency of the\s*loan[^£]{0,40}?£([\d,]+(?:\.\d{2})?)/i);
  const loanAmount = num(loanMatch?.[1]);

  // Valuation
  const valMatch = stripped.match(
    /(?:Value of the [Pp]roperty|Valuation)[^£]{0,40}?£\s*([\d,]+(?:\.\d{2})?)/i
  );
  const valuation = num(valMatch?.[1]);

  // Duration
  const termMatch = stripped.match(/Duration of the loan:\s*(\d+)\s*years/i);
  const termMonths = termMatch ? parseInt(termMatch[1], 10) * 12 : null;

  // Repayment type
  const repaymentType = /Repayment Type:\s*Interest Only/i.test(stripped)
    ? "Interest Only"
    : /Repayment Type:\s*Repayment/i.test(stripped)
    ? "Repayment"
    : null;

  // Fixed rate + period: "fixed for 60 months ... fixed rate of 4.04%"
  const fixedPeriodMatch = stripped.match(/fixed for\s*(\d+)\s*months/i);
  const fixedPeriodMonths = fixedPeriodMatch ? parseInt(fixedPeriodMatch[1], 10) : null;
  const fixedRateMatch =
    stripped.match(/fixed rate of\s*(\d+\.\d{2,3})\s*%/i) ??
    stripped.match(/(\d+\.\d{2,3})\s*%\s*for\s*\d+\s*months/i);
  const fixedRatePct = fixedRateMatch?.[1] ?? null;

  // Reversionary: "5.40% above the Bank of England Base Rate"
  const revMatch = stripped.match(/(\d+\.\d{2,3})\s*%\s*above\s*the\s*Bank of England Base Rate/i);
  const reversionaryMarginPct = revMatch?.[1] ?? null;

  // Floor
  const floorMatch = stripped.match(/floor of\s*(\d+\.\d{1,3})\s*%/i);
  const reversionaryFloorPct = floorMatch?.[1] ?? null;

  // Offer / expiry dates
  const offerMatch = stripped.match(/produced for[^.]+?on\s*(\d{1,2}\s+\w+\s+\d{4})/i);
  const offerDate = parseDate(offerMatch?.[1]);
  const expiryMatch = stripped.match(/valid until\s*(\d{1,2}\s+\w+\s+\d{4})/i);
  const expiryDate = parseDate(expiryMatch?.[1]);

  // Monthly payment
  const mpMatch = stripped.match(/(\d+)\s*months\s*\d+%[^£]*?£([\d,]+(?:\.\d{2})?)/i);
  const monthlyPaymentFixed = num(mpMatch?.[2]);

  const borrower = /MONOCROM/i.test(stripped) ? "MONOCROM" : "YCO";

  const row: MortgageRow = {
    lender: "Precise",
    propertyCode,
    borrowerEntity: borrower,
    accountNumber: lenderReference,
    lenderReference,
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
    notes: null,
  };

  return { ok: true, row };
}
