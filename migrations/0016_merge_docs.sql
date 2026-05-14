-- Consolidates the two-doc setup ("intro" + "energy-routine-maintenance")
-- into a single "Operations Manual" doc. Idempotent: if energy-routine-
-- maintenance has already been folded in, this is a no-op.

UPDATE "docs"
SET
  title = 'Operations Manual',
  category = 'General',
  sort_order = 1,
  body = (
    SELECT
      '# Operations Manual

Routine procedures, checklists, and supplier notes — everything worth
referring back to month-on-month. Admins and contributors can edit any doc.

---

' || COALESCE(
        (SELECT body FROM "docs" WHERE slug = 'energy-routine-maintenance'),
        ''
      )
  ),
  updated_at = now()
WHERE slug = 'intro';

DELETE FROM "docs" WHERE slug = 'energy-routine-maintenance';
