/**
 * Parser for LendInvest BTL mortgage offer letters (4WS).
 *
 * Format markers:
 *   - Account No: 100216013 (in Acceptance section)
 *   - "This document was produced for: You & Co. Living Limited"
 *   - "Offer Date: 11/08/2021"
 *   - "Acceptance Period: 09/11/2021"
 *   - "secured as a first charge ... on the property: 4 Walpole Street, Chester, CH1 4HG"
 *   - "Amount and currency of the loan: £317,475.00"
 *   - "Duration of the loan: 25 years"
 *   - "Repayment type: Interest Only"
 *   - Fixed rate "3.69% fixed from the date of completion until ... second anniversary"
 *   - Reversionary "4.59% + Bank of England Base Rate"
 *   - Monthly "24 payments of £976.24"
 */

import { matchAddressToPropertyCode } from "./address-match.js";
import { parseDate, num } from "./mortgage-helpers.js";
import type { MortgageRow, MortgageParseResult } from "./mortgage-types.js";

export function parseLendInvestOffer(
  text: string,
  fallbackPropertyCode?: string
): MortgageParseResult {
  const stripped = text.replace(/\s+/g, " ");

  // Account number from Acceptance section: "Account No: 100216013"
  const accMatch = stripped.match(/Account No[.:\s]+([A-Z0-9]+)/i);
  const accountNumber = accMatch?.[1] ?? null;

  // Property address from "first charge ... on the property: <address>"
  const addrMatch = stripped.match(
    /(?:first charge|charged|secured)[^:]*?(?:on the property|properties)[^:]*?:\s*([^\n]+?)(?:\.|Page|\d{4}|If)/i
  );
  let propertyCode = (addrMatch && matchAddressToPropertyCode(addrMatch[1])) ?? null;
  if (!propertyCode) {
    propertyCode = matchAddressToPropertyCode(stripped) ?? null;
  }
  if (!propertyCode && fallbackPropertyCode) propertyCode = fallbackPropertyCode;
  if (!propertyCode) {
    return { ok: false, error: "Could not identify property from LendInvest offer" };
  }

  // Loan amount
  const loanMatch =
    stripped.match(/Amount and currency of the\s*loan[^£]{0,40}?£([\d,]+(?:\.\d{2})?)/i) ??
    stripped.match(/loan to be granted[^£]{0,40}?£([\d,]+(?:\.\d{2})?)/i);
  const loanAmount = num(loanMatch?.[1]);

  // Valuation
  const valMatch =
    stripped.match(/Valuation of the Property:\s*£\s*([\d,]+(?:\.\d{2})?)/i) ??
    stripped.match(/Value of the property[^£]{0,40}?£\s*([\d,]+(?:\.\d{2})?)/i);
  const valuation = num(valMatch?.[1]);

  // Duration
  const termMatch = stripped.match(/Duration of the loan:\s*(\d+)\s*years/i);
  const termMonths = termMatch ? parseInt(termMatch[1], 10) * 12 : null;

  // Repayment type
  const repaymentType = /Repayment\s*(?:type|method):\s*Interest Only/i.test(stripped)
    ? "Interest Only"
    : /Repayment\s*(?:type|method):\s*Repayment/i.test(stripped)
    ? "Repayment"
    : null;

  // Fixed rate + period: "3.69% fixed from the date of completion until ... second anniversary"
  // Or "fixed for 60 months from when the loan starts"
  const fixedRateMatch = stripped.match(/(\d+\.\d{2,3})\s*%\s*fixed/i);
  const fixedRatePct = fixedRateMatch?.[1] ?? null;
  const fixedPeriodMatch = stripped.match(
    /fixed (?:rate )?(?:for|period)\s*(?:of\s*)?(\d+)\s*months/i
  );
  const fixedPeriodMonths = fixedPeriodMatch ? parseInt(fixedPeriodMatch[1], 10) : null;

  // Reversionary margin: "4.59% + Bank of England Base Rate"
  const revMatch = stripped.match(/(\d+\.\d{2,3})\s*%\s*\+\s*Bank of England Base Rate/i);
  const reversionaryMarginPct = revMatch?.[1] ?? null;

  // Reversionary floor: "Bank of England Base Rate will not go below a floor of 0.10%"
  const floorMatch = stripped.match(
    /(?:Base Rate|floor|will not go below)[^%]{0,80}?(\d+\.\d{1,3})\s*%/i
  );
  const reversionaryFloorPct = floorMatch?.[1] ?? null;

  // Offer date
  const offerMatch = stripped.match(/Offer Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const offerDate = parseDate(offerMatch?.[1]);

  // Acceptance / expiry
  const expiryMatch = stripped.match(/Acceptance Period[^\d]{0,30}?(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const expiryDate = parseDate(expiryMatch?.[1]);

  // Monthly payment: "You will have 24 payments of £976.24"
  const mpMatch = stripped.match(/payments of £([\d,]+(?:\.\d{2})?)/i);
  const monthlyPaymentFixed = num(mpMatch?.[1]);

  // Borrower entity
  const borrower = /MONOCROM/i.test(stripped) ? "MONOCROM" : "YCO";

  const row: MortgageRow = {
    lender: "LendInvest",
    propertyCode,
    borrowerEntity: borrower,
    accountNumber,
    lenderReference: accountNumber,
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
