/**
 * Type shim for pdf-parse — the package ships no @types, but its CJS export
 * is straightforward: a default function that takes a Buffer and returns a
 * Promise of an object with a `text` field (plus other metadata we don't use).
 */

declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info?: Record<string, unknown>;
    metadata?: unknown;
    version?: string;
  }
  function pdf(buffer: Buffer | Uint8Array): Promise<PdfParseResult>;
  export = pdf;
}
