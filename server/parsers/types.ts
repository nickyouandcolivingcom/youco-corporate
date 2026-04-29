/**
 * Shared types for invoice PDF parsers.
 *
 * Each supplier's parser returns the same shape, which feeds straight into
 * the existing bulk-import endpoint without further conversion.
 */

export interface BulkInvoiceRow {
  propertyCode: string;
  supplier: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  electricityKwh: string | null;
  gasKwh: string | null;
  electricityAmount: string | null;
  gasAmount: string | null;
  vatAmount: string | null;
  invoiceNumber: string | null;
  notes: string | null;
}
