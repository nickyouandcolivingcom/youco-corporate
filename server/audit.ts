import { db } from "./db.js";
import { auditLog } from "@shared/schema";

interface AuditEntry {
  userId: number;
  userName: string;
  action: "created" | "updated" | "deleted";
  entity: string;
  entityId?: string | number | null;
  fieldChanged?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      userId: entry.userId,
      userName: entry.userName,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId != null ? String(entry.entityId) : null,
      fieldChanged: entry.fieldChanged ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}

export async function logFieldChanges(
  base: Omit<AuditEntry, "action" | "fieldChanged" | "oldValue" | "newValue">,
  changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>
): Promise<void> {
  for (const { field, oldValue, newValue } of changes) {
    const old = oldValue != null ? String(oldValue) : null;
    const next = newValue != null ? String(newValue) : null;
    if (old === next) continue;
    await logAudit({
      ...base,
      action: "updated",
      fieldChanged: field,
      oldValue: old,
      newValue: next,
    });
  }
}
