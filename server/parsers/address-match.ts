/**
 * Best-effort matcher: free-text supply address → property code.
 *
 * Used by the water bill PDF importer to auto-resolve a property when the
 * account number isn't yet in the database. Severn Trent migrated from
 * legacy numeric account numbers to A-XXX style ones — same property, two
 * different references — so address matching avoids re-keying ~22 numbers
 * by hand.
 *
 * Severn Trent PDF text extraction strips whitespace inconsistently
 * ("16 RICHMOND CRESCENT" sometimes comes through as "16RICHMONDCRESCENT").
 * The matcher therefore strips ALL non-alphanumerics from both the input
 * and the patterns before comparing — so spacing and punctuation don't
 * matter.
 */

/** Strip everything but A-Z and 0-9. Uppercase. */
function key(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

interface Pattern {
  code: string;
  /** Stripped token that, if present in the stripped address, identifies the property. */
  needle: string;
  /** If non-empty, the address must NOT contain any of these (used to disambiguate
   *  e.g. "26 BROOK LANE" from "FLAT A 26 BROOK LANE" → 26BLA). */
  notIfContains?: string[];
}

const PATTERNS: Pattern[] = [
  { code: "16RC", needle: "16RICHMONDCRESCENT" },
  { code: "10KG", needle: "10KENSINGTONGREEN" },
  { code: "32LFR", needle: "32LOWERFIELDROAD" },
  // Variant without the space:
  { code: "32LFR", needle: "32LOWERFIELDRD" },
  { code: "84DD", needle: "84DICKSONSDRIVE" },
  { code: "84DD", needle: "84DICKSONSDR" },
  { code: "4WS", needle: "4WALPOLESTREET" },
  { code: "4WS", needle: "4WALPOLEST" },

  // Brook Lane flats — flat-letter forms first.
  // "Flat A, 26 Brook Lane" / "26A Brook Lane"
  { code: "26BLA", needle: "FLATA26BROOKLANE" },
  { code: "26BLA", needle: "26ABROOKLANE" },
  { code: "26BLB", needle: "FLATB26BROOKLANE" },
  { code: "26BLB", needle: "26BBROOKLANE" },
  { code: "26BLC", needle: "FLATC26BROOKLANE" },
  { code: "26BLC", needle: "26CBROOKLANE" },
  { code: "27BLA", needle: "FLATA27BROOKLANE" },
  { code: "27BLA", needle: "27ABROOKLANE" },
  { code: "27BLB", needle: "FLATB27BROOKLANE" },
  { code: "27BLB", needle: "27BBROOKLANE" },
  { code: "27BLC", needle: "FLATC27BROOKLANE" },
  { code: "27BLC", needle: "27CBROOKLANE" },
  { code: "27BLD", needle: "FLATD27BROOKLANE" },
  { code: "27BLD", needle: "27DBROOKLANE" },

  // Freehold-only patterns: only match when no flat letter signal present.
  // "26 BROOK LANE" must not also include any of the flat tokens.
  {
    code: "26BL",
    needle: "26BROOKLANE",
    notIfContains: ["FLATA", "FLATB", "FLATC", "26ABROOKLANE", "26BBROOKLANE", "26CBROOKLANE"],
  },
  {
    code: "27BL",
    needle: "27BROOKLANE",
    notIfContains: ["FLATA", "FLATB", "FLATC", "FLATD", "27ABROOKLANE", "27BBROOKLANE", "27CBROOKLANE", "27DBROOKLANE"],
  },
];

/**
 * Returns the property code that best matches the address, or null.
 *
 * Patterns are tried in declaration order — flat-letter forms come before
 * the freehold-only patterns so e.g. "FLAT A 26 BROOK LANE" matches 26BLA
 * before falling through to 26BL.
 */
export function matchAddressToPropertyCode(address: string): string | null {
  if (!address) return null;
  const k = key(address);
  for (const p of PATTERNS) {
    if (!k.includes(p.needle)) continue;
    if (p.notIfContains && p.notIfContains.some((excl) => k.includes(excl))) continue;
    return p.code;
  }
  return null;
}
