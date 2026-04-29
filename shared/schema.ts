import {
  pgTable,
  serial,
  text,
  timestamp,
  pgEnum,
  integer,
  numeric,
  date,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { PROPERTY_CODE_VALUES } from "./property-codes.js";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["admin", "contributor", "viewer"]);

export const auditActionEnum = pgEnum("audit_action", [
  "created",
  "updated",
  "deleted",
]);

export const FUEL_TYPES = ["Electricity", "Gas", "Dual"] as const;
export const READING_FUEL_TYPES = ["Electricity", "Gas"] as const;
export const ENERGY_STATUSES = ["Active", "Closed", "Disputed"] as const;
export const INVOICE_SOURCES = ["manual", "csv_import", "api", "ocr"] as const;
export const READING_SOURCES = ["octopus_api", "manual"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];
export type ReadingFuelType = (typeof READING_FUEL_TYPES)[number];
export type EnergyStatus = (typeof ENERGY_STATUSES)[number];
export type InvoiceSource = (typeof INVOICE_SOURCES)[number];
export type ReadingSource = (typeof READING_SOURCES)[number];

// ─── Tables ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  action: auditActionEnum("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  fieldChanged: text("field_changed"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  timestamp: timestamp("timestamp", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  property: text("property").notNull().default("ALL"),
  accountNumber: text("account_number"),
  addressPostcode: text("address_postcode"),
  contactPhone: text("contact_phone"),
  email: text("email"),
  youcoContact: text("youco_contact"),
  hyperlink: text("hyperlink"),
  notes: text("notes"),
  paymentMethod: text("payment_method"),
  paymentDay: integer("payment_day"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portfolioProperties = pgTable("portfolio_properties", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  postcode: text("postcode"),
  ownershipEntity: text("ownership_entity").notNull().default("YCO"),
  beneficialSharePct: numeric("beneficial_share_pct", { precision: 5, scale: 2 }),
  purchaseDate: date("purchase_date"),
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
  capitalCosts: numeric("capital_costs", { precision: 12, scale: 2 }),
  currentValueRics: numeric("current_value_rics", { precision: 12, scale: 2 }),
  currentValueLatent: numeric("current_value_latent", { precision: 12, scale: 2 }),
  grossAnnualRent: numeric("gross_annual_rent", { precision: 12, scale: 2 }),
  lettingUnits: text("letting_units"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const energyAccounts = pgTable("energy_accounts", {
  id: serial("id").primaryKey(),
  supplier: text("supplier").notNull(),
  propertyCode: text("property_code").notNull(),
  accountNumber: text("account_number"),
  fuelType: text("fuel_type").notNull().default("Electricity"),
  mpan: text("mpan"),
  mprn: text("mprn"),
  electricityMeterSerial: text("electricity_meter_serial"),
  gasMeterSerial: text("gas_meter_serial"),
  tariffName: text("tariff_name"),
  tariffCode: text("tariff_code"),
  unitRatePence: numeric("unit_rate_pence", { precision: 8, scale: 4 }),
  standingChargePence: numeric("standing_charge_pence", { precision: 8, scale: 4 }),
  contractEndDate: date("contract_end_date"),
  lastReadingValue: numeric("last_reading_value", { precision: 12, scale: 2 }),
  lastReadingDate: date("last_reading_date"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  paymentMethod: text("payment_method"),
  paymentDay: integer("payment_day"),
  status: text("status").notNull().default("Active"),
  disputeNotes: text("dispute_notes"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const energyInvoices = pgTable("energy_invoices", {
  id: serial("id").primaryKey(),
  energyAccountId: integer("energy_account_id"),
  propertyCode: text("property_code").notNull(),
  supplier: text("supplier").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  kwh: numeric("kwh", { precision: 12, scale: 2 }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  invoiceNumber: text("invoice_number"),
  source: text("source").notNull().default("manual"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const energyReadings = pgTable(
  "energy_readings",
  {
    id: serial("id").primaryKey(),
    energyAccountId: integer("energy_account_id").notNull(),
    fuelType: text("fuel_type").notNull().default("Electricity"),
    readingDate: date("reading_date").notNull(),
    kwh: numeric("kwh", { precision: 12, scale: 4 }).notNull(),
    costPence: numeric("cost_pence", { precision: 12, scale: 2 }),
    source: text("source").notNull().default("octopus_api"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountFuelDateUnique: unique("energy_readings_account_fuel_date_uniq").on(
      table.energyAccountId,
      table.fuelType,
      table.readingDate
    ),
  })
);

// ─── Zod schemas (insert) ─────────────────────────────────────────────────────

export const insertUserSchema = createInsertSchema(users, {
  username: z.string().min(1),
  passwordHash: z.string().min(1),
  role: z.enum(["admin", "contributor", "viewer"]).default("viewer"),
}).omit({ id: true, createdAt: true });

export const insertSupplierSchema = createInsertSchema(suppliers, {
  name: z.string().min(1),
  property: z.string().min(1).default("ALL"),
  paymentMethod: z.string().nullable().optional(),
  paymentDay: z.number().int().min(1).max(31).nullable().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertPortfolioPropertySchema = createInsertSchema(portfolioProperties, {
  address: z.string().min(1),
  ownershipEntity: z.enum(["YCO", "MONOCROM"]).default("YCO"),
  postcode: z.string().nullable().optional(),
  beneficialSharePct: z.string().nullable().optional(),
  purchaseDate: z.string().nullable().optional(),
  purchasePrice: z.string().nullable().optional(),
  capitalCosts: z.string().nullable().optional(),
  currentValueRics: z.string().nullable().optional(),
  currentValueLatent: z.string().nullable().optional(),
  grossAnnualRent: z.string().nullable().optional(),
  lettingUnits: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertEnergyAccountSchema = createInsertSchema(energyAccounts, {
  supplier: z.string().min(1),
  propertyCode: z.enum(PROPERTY_CODE_VALUES as [string, ...string[]]),
  fuelType: z.enum(FUEL_TYPES).default("Electricity"),
  status: z.enum(ENERGY_STATUSES).default("Active"),
  accountNumber: z.string().nullable().optional(),
  mpan: z.string().nullable().optional(),
  mprn: z.string().nullable().optional(),
  electricityMeterSerial: z.string().nullable().optional(),
  gasMeterSerial: z.string().nullable().optional(),
  tariffName: z.string().nullable().optional(),
  tariffCode: z.string().nullable().optional(),
  unitRatePence: z.string().nullable().optional(),
  standingChargePence: z.string().nullable().optional(),
  contractEndDate: z.string().nullable().optional(),
  lastReadingValue: z.string().nullable().optional(),
  lastReadingDate: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  paymentDay: z.number().int().min(1).max(31).nullable().optional(),
  disputeNotes: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true, lastSyncAt: true });

export const insertEnergyInvoiceSchema = createInsertSchema(energyInvoices, {
  propertyCode: z.enum(PROPERTY_CODE_VALUES as [string, ...string[]]),
  supplier: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  amount: z.string().min(1),
  kwh: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  source: z.enum(INVOICE_SOURCES).default("manual"),
  notes: z.string().nullable().optional(),
  energyAccountId: z.number().int().nullable().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertAuditLogSchema = createInsertSchema(auditLog).omit({
  id: true,
  timestamp: true,
});

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;

export type PortfolioProperty = typeof portfolioProperties.$inferSelect;
export type InsertPortfolioProperty = z.infer<typeof insertPortfolioPropertySchema>;

export type EnergyAccount = typeof energyAccounts.$inferSelect;
export type InsertEnergyAccount = z.infer<typeof insertEnergyAccountSchema>;

export type EnergyInvoice = typeof energyInvoices.$inferSelect;
export type InsertEnergyInvoice = z.infer<typeof insertEnergyInvoiceSchema>;

export type EnergyReading = typeof energyReadings.$inferSelect;

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
