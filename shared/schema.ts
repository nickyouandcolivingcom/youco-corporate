import {
  pgTable,
  serial,
  text,
  timestamp,
  pgEnum,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["admin", "contributor", "viewer"]);

export const auditActionEnum = pgEnum("audit_action", [
  "created",
  "updated",
  "deleted",
]);

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

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
