import { Router } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db.js";
import { users } from "@shared/schema";
import { requireAdmin } from "../middleware/auth.js";
import { logAudit } from "../audit.js";

const router = Router();

router.get("/", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.id);
  res.json(rows);
});

const changePasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

router.patch("/:id/password", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const [target] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, id));
  if (!target) return res.status(404).json({ error: "User not found" });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "updated",
    entity: "users",
    entityId: id,
    fieldChanged: "password",
    oldValue: null,
    newValue: "[redacted]",
  });

  res.json({ ok: true });
});

export default router;
