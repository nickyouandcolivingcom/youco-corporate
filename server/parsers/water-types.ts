/**
 * Shared shape for water-bill parsers. Mirrors the columns on
 * water_invoices so parsed rows feed straight into the bulk-import path.
 */

export interface WaterInvoiceRow {
  propertyCode: string;
  supplier: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  freshWaterAmount: string | null;
  wastewaterAmount: string | null;
  standingChargeAmount: string | null;
  issueDate: string | null;
  invoiceNumber: string | null;
  notes: string | null;
}
