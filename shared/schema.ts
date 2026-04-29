import {
  pgTable,
  serial,
  text,
  timestamp,
  pgEnum,
  integer,
  numeric,
  date,
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
export const ENERGY_STATUSES = ["Active", "Closed", "Disputed"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];
export type EnergyStatus = (typeof ENERGY_STATUSES)[number];

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
  tariffName: text("tariff_name"),
  unitRatePence: numeric("unit_rate_pence", { precision: 8, scale: 4 }),
  standingChargePence: numeric("standing_charge_pence", { precision: 8, scale: 4 }),
  contractEndDate: date("contract_end_date"),
  lastReadingValue: numeric("last_reading_value", { precision: 12, scale: 2 }),
  lastReadingDate: date("last_reading_date"),
  paymentMethod: text("payment_method"),
  paymentDay: integer("payment_day"),
  status: text("status").notNull().default("Active"),
  disputeNotes: text("dispute_notes"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  tariffName: z.string().nullable().optional(),
  unitRatePence: z.string().nullable().optional(),
  standingChargePence: z.string().nullable().optional(),
  contractEndDate: z.string().nullable().optional(),
  lastReadingValue: z.string().nullable().optional(),
  lastReadingDate: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  paymentDay: z.number().int().min(1).max(31).nullable().optional(),
  disputeNotes: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
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

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
