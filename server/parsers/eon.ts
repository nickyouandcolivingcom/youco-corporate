/**
 * Parser for E.ON Next monthly energy statements (PDF).
 *
 * Extracts a single invoice (covering both electricity and gas where present)
 * from the statement text. The format is consistent across the statements
 * Nick has uploaded since EON took over 27BLA/B/D in July 2025.
 *
 * Key fields:
 *   - "Your account number: A-XXXXXXXX"
 *   - "Bill reference: NNNNNNNNN"  (used as invoice_number)
 *   - "Electricity23 Nov 2025 - 22 Dec 2025£23.59 DR"
 *   - "Electricity used9.2 kWh @ 21.868p/kWh£2.01"
 *   - "Gas23 Nov 2025 - 22 Dec 2025£68.21 DR"
 *   - "Energy used*1002.9 kWh @ 5.540p/kWh£55.56"  (gas total kWh after volume conversion)
 *   - "VAT @ 5%£X.XX"  (appears twice — once per fuel)
 */

import type { BulkInvoiceRow } from "./types.js";

interface EonAccountMap {
  /** A-XXXXXXXX → propertyCode, e.g. A-F8569CBB → 27BLD */
  [accountNumber: string]: string;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function parseDate(input: string): string | null {
  // "23 Nov 2025" → "2025-11-23"
  const m = input.trim().match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  if (!mm) return null;
  return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
}

function num(v: string | undefined | null): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[£,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

export interface EonParseResult {
  ok: boolean;
  row?: BulkInvoiceRow;
  error?: string;
  /** account number we found, even if mapping failed */
  accountNumber?: string;
}

export function parseEonStatement(
  text: string,
  accountMap: EonAccountMap
): EonParseResult {
  // 1. Account number
  const accMatch = text.match(/account number:\s*(A-[A-Z0-9]+)/i);
  if (!accMatch) {
    return { ok: false, error: "Could not find account number in PDF" };
  }
  const accountNumber = accMatch[1];

  const propertyCode = accountMap[accountNumber];
  if (!propertyCode) {
    return {
      ok: false,
      accountNumber,
      error: `Account ${accountNumber} not in account map — add to energy_accounts table first`,
    };
  }

  // 2. Bill reference (invoice number) — optional but useful
  const refMatch = text.match(/Bill reference:\s*(\S+)/);
  const invoiceNumber = refMatch?.[1] ?? null;

  // 3. Period — take electricity period, fall back to gas if elec absent.
  // Pattern is "Electricity23 Nov 2025 - 22 Dec 2025£23.59 DR"
  // The £NN.NN here is the elec total for the period.
  const elecBlock = text.match(
    /Electricity\s*(\d{1,2}\s+\w{3}\s+\d{4})\s*-\s*(\d{1,2}\s+\w{3}\s+\d{4})£([\d.]+)\s*DR/
  );
  const gasBlock = text.match(
    /Gas\s*(\d{1,2}\s+\w{3}\s+\d{4})\s*-\s*(\d{1,2}\s+\w{3}\s+\d{4})£([\d.]+)\s*DR/
  );

  if (!elecBlock && !gasBlock) {
    return {
      ok: false,
      accountNumber,
      error: "No electricity or gas charges found in PDF",
    };
  }

  // Period: prefer electricity period (if both fuels present they usually match)
  const periodSrc = elecBlock ?? gasBlock!;
  const periodStart = parseDate(periodSrc[1]);
  const periodEnd = parseDate(periodSrc[2]);
  if (!periodStart || !periodEnd) {
    return {
      ok: false,
      accountNumber,
      error: `Could not parse period dates: ${periodSrc[1]} - ${periodSrc[2]}`,
    };
  }

  // 4. Electricity kWh — "Electricity used9.2 kWh @ 21.868p/kWh"
  const elecKwhMatch = text.match(/Electricity used\s*([\d,.]+)\s*kWh\s*@/);
  const electricityKwh = num(elecKwhMatch?.[1]);
  const electricityAmount = num(elecBlock?.[3]);

  // 5. Gas kWh — "Energy used*1002.9 kWh @ 5.540p/kWh"
  const gasKwhMatch = text.match(/Energy used\*?\s*([\d,.]+)\s*kWh\s*@/);
  const gasKwh = num(gasKwhMatch?.[1]);
  const gasAmount = num(gasBlock?.[3]);

  // 6. VAT — appears once per fuel. Sum them.
  const vatMatches = [...text.matchAll(/VAT\s*@\s*\d+%\s*£([\d.]+)/g)];
  const vatAmount = vatMatches.reduce((a, m) => a + (num(m[1]) ?? 0), 0);

  // 7. Total = elec + gas (already includes VAT in EON's per-fuel total)
  const total =
    (electricityAmount ?? 0) + (gasAmount ?? 0);

  if (total === 0) {
    return {
      ok: false,
      accountNumber,
      error: "Computed total is zero — parser likely missed the charges",
    };
  }

  return {
    ok: true,
    accountNumber,
    row: {
      propertyCode,
      supplier: "EON",
      periodStart,
      periodEnd,
      amount: total.toFixed(2),
      electricityKwh: electricityKwh != null ? String(electricityKwh) : null,
      gasKwh: gasKwh != null ? String(gasKwh) : null,
      electricityAmount:
        electricityAmount != null ? electricityAmount.toFixed(2) : null,
      gasAmount: gasAmount != null ? gasAmount.toFixed(2) : null,
      vatAmount: vatAmount > 0 ? vatAmount.toFixed(2) : null,
      invoiceNumber,
      notes: null,
    },
  };
}
