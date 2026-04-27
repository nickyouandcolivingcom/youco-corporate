import { Router } from "express";
import { eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { Resend } from "resend";
import { db } from "../db.js";
import { suppliers } from "@shared/schema";
import { requireAuth, requireContributor, requireAdmin } from "../middleware/auth.js";
import { logAudit, logFieldChanges } from "../audit.js";

const router = Router();

// ─── GET /api/suppliers ───────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim() ?? "";

  const rows = search
    ? await db
        .select()
        .from(suppliers)
        .where(
          or(
            ilike(suppliers.name, `%${search}%`),
            ilike(suppliers.property, `%${search}%`),
            ilike(suppliers.youcoContact, `%${search}%`),
            ilike(suppliers.email, `%${search}%`)
          )
        )
        .orderBy(suppliers.name)
    : await db.select().from(suppliers).orderBy(suppliers.name);

  res.json(rows);
});

// ─── POST /api/suppliers/csv-import ──────────────────────────────────────────

const csvRowSchema = z.object({
  name: z.string().min(1),
  property: z.string().default("ALL"),
  accountNumber: z.string().optional().nullable(),
  addressPostcode: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  youcoContact: z.string().optional().nullable(),
  hyperlink: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  paymentMethod: z.string().optional().nullable(),
  paymentDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
});

router.post("/csv-import", requireContributor, async (req, res) => {
  const parsed = z.array(csvRowSchema).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const rows = parsed.data.map((r) => ({
    name: r.name,
    property: r.property || "ALL",
    accountNumber: r.accountNumber ?? null,
    addressPostcode: r.addressPostcode ?? null,
    contactPhone: r.contactPhone ?? null,
    email: r.email ?? null,
    youcoContact: r.youcoContact ?? null,
    hyperlink: r.hyperlink ?? null,
    notes: r.notes ?? null,
    paymentMethod: r.paymentMethod ?? null,
    paymentDay: r.paymentDay ?? null,
    updatedAt: sql`now()`,
  }));

  if (rows.length === 0) return res.json({ inserted: 0 });

  await db.insert(suppliers).values(rows);

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "suppliers",
    entityId: null,
    fieldChanged: null,
    oldValue: null,
    newValue: `CSV import: ${rows.length} rows`,
  });

  res.json({ inserted: rows.length });
});

// ─── POST /api/suppliers/email ────────────────────────────────────────────────

const emailSchema = z.object({
  to: z.array(z.string().email()).min(1, "Select at least one recipient"),
  subject: z.string().min(1),
  body: z.string().min(1),
});

router.post("/email", requireAdmin, async (req, res) => {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "RESEND_API_KEY is not configured" });
  }

  const { to, subject, body } = parsed.data;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "nick@youandcoliving.com";

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `You & Co. Living <${fromEmail}>`,
    to: fromEmail,
    bcc: to,
    subject,
    text: body,
    html: body.replace(/\n/g, "<br>"),
  });

  if (error) {
    console.error("[suppliers/email] Resend error:", error);
    return res.status(500).json({ error: error.message ?? "Email send failed" });
  }

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "supplier_email",
    entityId: null,
    fieldChanged: "subject",
    oldValue: null,
    newValue: subject,
  });

  res.json({ sent: to.length });
});

// ─── POST /api/suppliers ──────────────────────────────────────────────────────

const upsertSchema = z.object({
  name: z.string().min(1),
  property: z.string().default("ALL"),
  accountNumber: z.string().nullable().optional(),
  addressPostcode: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  youcoContact: z.string().nullable().optional(),
  hyperlink: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  paymentDay: z.number().int().min(1).max(31).nullable().optional(),
});

router.post("/", requireContributor, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const [row] = await db
    .insert(suppliers)
    .values({ ...parsed.data, updatedAt: sql`now()` })
    .returning();

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "suppliers",
    entityId: row.id,
    fieldChanged: null,
    oldValue: null,
    newValue: row.name,
  });

  res.status(201).json(row);
});

// ─── PATCH /api/suppliers/:id ─────────────────────────────────────────────────

router.patch("/:id", requireContributor, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const [existing] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const [updated] = await db
    .update(suppliers)
    .set({ ...parsed.data, updatedAt: sql`now()` })
    .where(eq(suppliers.id, id))
    .returning();

  const fields = Object.keys(parsed.data) as Array<keyof typeof parsed.data>;
  await logFieldChanges(
    { userId: req.user!.id, userName: req.user!.username, entity: "suppliers", entityId: id },
    fields.map((f) => ({
      field: f,
      oldValue: existing[f as keyof typeof existing] ?? null,
      newValue: parsed.data[f] ?? null,
    }))
  );

  res.json(updated);
});

// ─── DELETE /api/suppliers/:id ────────────────────────────────────────────────

router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [existing] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  await db.delete(suppliers).where(eq(suppliers.id, id));

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "deleted",
    entity: "suppliers",
    entityId: id,
    fieldChanged: null,
    oldValue: existing.name,
    newValue: null,
  });

  res.json({ deleted: true });
});

export default router;
