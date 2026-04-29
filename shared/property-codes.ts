/**
 * The 16 canonical PROPERTY tracking codes from Xero, used for cost
 * allocation across every module tab (Energy, Water, Broadband, Mortgages,
 * Suppliers etc.).
 *
 * The numeric prefix (#00, #01…) is just Xero's display order — the code
 * itself (CORP, 16RC, 10KG, …) is the stable identifier.
 *
 * Leasehold flat codes (26BLA/B/C, 27BLA/B/C/D) and the communal allocation
 * code (26-27BL) are deliberately included alongside their freehold parents
 * because each leasehold title has its own utility supply, council tax, and
 * cost line.
 */

export interface PropertyCode {
  code: string;
  label: string;
}

export const PROPERTY_CODES: readonly PropertyCode[] = [
  { code: "CORP", label: "CORP — Corporate" },
  { code: "16RC", label: "16RC — 16 Richmond Crescent" },
  { code: "10KG", label: "10KG — 10 Kensington Green" },
  { code: "32LFR", label: "32LFR — 32 Lower Field Road" },
  { code: "84DD", label: "84DD — 84 Dicksons Drive" },
  { code: "4WS", label: "4WS — 4 Walpole Street" },
  { code: "26BL", label: "26BL — 26 Brook Lane (freehold)" },
  { code: "26BLA", label: "26BLA — 26 Brook Lane Flat A" },
  { code: "26BLB", label: "26BLB — 26 Brook Lane Flat B" },
  { code: "26BLC", label: "26BLC — 26 Brook Lane Flat C" },
  { code: "27BL", label: "27BL — 27 Brook Lane (freehold)" },
  { code: "27BLA", label: "27BLA — 27 Brook Lane Flat A" },
  { code: "27BLB", label: "27BLB — 27 Brook Lane Flat B" },
  { code: "27BLC", label: "27BLC — 27 Brook Lane Flat C" },
  { code: "27BLD", label: "27BLD — 27 Brook Lane Flat D" },
  { code: "26-27BL", label: "26-27BL — Brook Lane communal" },
] as const;

export const PROPERTY_CODE_VALUES = PROPERTY_CODES.map((p) => p.code);

export const PROPERTY_CODE_LABEL: Record<string, string> = Object.fromEntries(
  PROPERTY_CODES.map((p) => [p.code, p.label])
);
