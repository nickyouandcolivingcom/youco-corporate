/**
 * Multi-PDF invoice importer.
 *
 * Client uploads N PDFs as base64-encoded strings in a single JSON request.
 * Server picks a parser per supplier (currently only EON), runs each PDF,
 * collects results, and returns them as a list ready to feed into the
 * existing /bulk-import endpoint after the user reviews them.
 *
 * Adding a new supplier:
 *   1. Drop a parser file in server/parsers/{supplier}.ts that exports
 *      a function (text, accountMap) => { ok, row?, error?, accountNumber? }
 *   2. Add it to PARSERS below with a `detect` predicate that recognises
 *      the supplier from the PDF text (e.g. distinctive header).
 *   3. Add the supplier's accounts to the energy_accounts table so the
 *      account → property map resolves.
 */

import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import pdfParseLib from "pdf-parse";
import { db } from "../db.js";
import { energyAccounts } from "@shared/schema";
import { requireContributor } from "../middleware/auth.js";
import { parseEonStatement } from "../parsers/eon.js";
import type { BulkInvoiceRow } from "../parsers/types.js";

const router = Router();

interface ParserDefinition {
  supplier: string;
  detect: (text: string) => boolean;
  parse: (
    text: string,
    accountMap: Record<string, string>
  ) => {
    ok: boolean;
    row?: BulkInvoiceRow;
    error?: string;
    accountNumber?: string;
  };
}

const PARSERS: ParserDefinition[] = [
  {
    supplier: "EON",
    detect: (t) => /E\.ON Next Energy Limited/i.test(t),
    parse: parseEonStatement,
  },
  // Add more parsers here as new suppliers come on.
];

const requestSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string(),
        base64: z.string(),
      })
    )
    .min(1),
});

router.post("/", requireContributor, async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  // Build account number → property code map from the energy_accounts table
  // so parsers don't need hard-coded mappings (and so adding new EON
  // accounts via the UI just works).
  const accounts = await db.select().from(energyAccounts);
  const accountMap: Record<string, string> = {};
  for (const a of accounts) {
    if (a.accountNumber) accountMap[a.accountNumber] = a.propertyCode;
  }

  const results: Array<{
    file: string;
    supplier?: string;
    accountNumber?: string;
    propertyCode?: string;
    status: "ok" | "error" | "no_parser";
    row?: BulkInvoiceRow;
    error?: string;
  }> = [];

  for (const f of parsed.data.files) {
    try {
      const buf = Buffer.from(f.base64, "base64");
      const pdf = await pdfParseLib(buf);
      const text = pdf.text;

      const matchedParser = PARSERS.find((p) => p.detect(text));
      if (!matchedParser) {
        results.push({
          file: f.name,
          status: "no_parser",
          error: "No parser matched this PDF (only EON supported currently)",
        });
        continue;
      }

      const out = matchedParser.parse(text, accountMap);
      if (!out.ok) {
        results.push({
          file: f.name,
          supplier: matchedParser.supplier,
          accountNumber: out.accountNumber,
          status: "error",
          error: out.error ?? "Parse failed",
        });
        continue;
      }

      results.push({
        file: f.name,
        supplier: matchedParser.supplier,
        accountNumber: out.accountNumber,
        propertyCode: out.row?.propertyCode,
        status: "ok",
        row: out.row,
      });
    } catch (err) {
      results.push({
        file: f.name,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const okRows = results
    .filter((r) => r.status === "ok" && r.row)
    .map((r) => r.row!) as BulkInvoiceRow[];

  res.json({
    received: parsed.data.files.length,
    parsed: okRows.length,
    failed: results.filter((r) => r.status !== "ok").length,
    results,
    rows: okRows,
  });
});

export default router;
