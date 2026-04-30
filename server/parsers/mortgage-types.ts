/**
 * Shared shape for mortgage offer letter parsers. Mirrors the columns
 * on the mortgages table; any field can be null if the parser can't
 * extract it (the user fills in via UI afterwards).
 */

export interface MortgageRow {
  lender: string;
  propertyCode: string;
  borrowerEntity: "YCO" | "MONOCROM";
  accountNumber: string | null;
  lenderReference: string | null;
  offerDate: string | null;
  expiryDate: string | null;
  loanAmount: string | null;
  valuation: string | null;
  termMonths: number | null;
  repaymentType: string | null;
  fixedRatePct: string | null;
  fixedPeriodMonths: number | null;
  fixedEndDate: string | null;
  reversionaryMarginPct: string | null;
  reversionaryFloorPct: string | null;
  monthlyPaymentFixed: string | null;
  ercSchedule: Array<{ year: number; pct: number }> | null;
  productFee: string | null;
  valuationFee: string | null;
  legalFee: string | null;
  redemptionFee: string | null;
  notes: string | null;
}

export interface MortgageParseResult {
  ok: boolean;
  row?: MortgageRow;
  error?: string;
  detectedFromFilename?: string;
}
