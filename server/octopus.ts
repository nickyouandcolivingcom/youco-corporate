/**
 * Octopus Energy REST API client.
 *
 * Auth: HTTP Basic — API key as username, empty password.
 * Docs: https://developer.octopus.energy/rest/
 *
 * The API key is read from process.env.OCTOPUS_API_KEY at call time so we
 * fail fast with a clear message if it isn't set, rather than at startup.
 */

const BASE = "https://api.octopus.energy/v1";

function getAuthHeader(): string {
  const key = process.env.OCTOPUS_API_KEY;
  if (!key) {
    throw new Error(
      "OCTOPUS_API_KEY env var is not set. Add it on Render → Environment."
    );
  }
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: getAuthHeader() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Octopus API ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Account discovery ────────────────────────────────────────────────────────

export interface OctopusAgreement {
  tariff_code: string;
  valid_from: string | null;
  valid_to: string | null;
}

export interface OctopusMeter {
  serial_number: string;
  registers?: Array<{ identifier: string; rate: string; is_settlement_register: boolean }>;
}

export interface OctopusElectricityMeterPoint {
  mpan: string;
  profile_class: number;
  consumption_standard: number | null;
  meters: OctopusMeter[];
  agreements: OctopusAgreement[];
}

export interface OctopusGasMeterPoint {
  mprn: string;
  consumption_standard: number | null;
  meters: OctopusMeter[];
  agreements: OctopusAgreement[];
}

export interface OctopusProperty {
  address_line_1?: string | null;
  address_line_2?: string | null;
  address_line_3?: string | null;
  town?: string | null;
  county?: string | null;
  postcode?: string | null;
  electricity_meter_points: OctopusElectricityMeterPoint[];
  gas_meter_points: OctopusGasMeterPoint[];
}

export interface OctopusAccount {
  number: string;
  properties: OctopusProperty[];
}

export async function fetchAccount(accountNumber: string): Promise<OctopusAccount> {
  return request<OctopusAccount>(`/accounts/${encodeURIComponent(accountNumber)}/`);
}

/**
 * An agreement is "current" if its valid_to is null (open-ended) or a future
 * datetime. Octopus accounts often retain closed historical agreements
 * alongside the active one — we only care about the active one.
 */
function isCurrentAgreement(a: OctopusAgreement, now: Date = new Date()): boolean {
  if (!a.valid_to) return true;
  return new Date(a.valid_to).getTime() > now.getTime();
}

/**
 * Picks the most recent (latest valid_from) tariff agreement. Returns null
 * if there are no agreements.
 */
export function pickActiveAgreement(
  agreements: OctopusAgreement[]
): OctopusAgreement | null {
  if (agreements.length === 0) return null;
  // Prefer current (open-ended/future-ending) agreements.
  const current = agreements.filter((a) => isCurrentAgreement(a));
  const candidates = current.length > 0 ? current : agreements;
  return [...candidates].sort((a, b) => {
    const av = a.valid_from ? new Date(a.valid_from).getTime() : 0;
    const bv = b.valid_from ? new Date(b.valid_from).getTime() : 0;
    return bv - av;
  })[0];
}

/**
 * Picks the active meter point from a list. An account can have multiple
 * meter points (e.g. an old closed supply + the current active one), and the
 * order in the API response is not guaranteed to put the active one first.
 *
 * "Active" = has at least one current agreement (valid_to is null or future).
 * If multiple meter points have current agreements, the one with the most
 * recent valid_from of any current agreement wins. Falls back to the first
 * point in the list if none are current (defensive — shouldn't happen).
 */
export function pickActiveMeterPoint<
  T extends { agreements: OctopusAgreement[] }
>(points: T[]): T | null {
  if (points.length === 0) return null;
  const now = new Date();

  const scored = points
    .map((p) => {
      const currentAgreements = p.agreements.filter((a) => isCurrentAgreement(a, now));
      if (currentAgreements.length === 0) return { p, score: -Infinity };
      const mostRecent = Math.max(
        ...currentAgreements.map((a) =>
          a.valid_from ? new Date(a.valid_from).getTime() : 0
        )
      );
      return { p, score: mostRecent };
    })
    .sort((a, b) => b.score - a.score);

  if (scored[0].score === -Infinity) {
    // Nothing is current — fall back to the first point (matches old behaviour).
    return points[0];
  }
  return scored[0].p;
}

// ─── Consumption ──────────────────────────────────────────────────────────────

export interface OctopusConsumptionRow {
  consumption: number;
  interval_start: string;
  interval_end: string;
}

interface OctopusConsumptionPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: OctopusConsumptionRow[];
}

async function fetchPaginated(
  path: string,
  meterDescriptor: string
): Promise<OctopusConsumptionRow[]> {
  const out: OctopusConsumptionRow[] = [];
  let nextUrl: string | null = `${BASE}${path}`;
  for (let i = 0; i < 10 && nextUrl; i++) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Octopus consumption ${res.status} for ${meterDescriptor}: ${body.slice(0, 200)}`
      );
    }
    const page = (await res.json()) as OctopusConsumptionPage;
    out.push(...page.results);
    nextUrl = page.next;
  }
  return out;
}

export async function fetchElectricityConsumption(
  mpan: string,
  serialNumber: string,
  periodFromIso: string,
  periodToIso: string
): Promise<OctopusConsumptionRow[]> {
  const path =
    `/electricity-meter-points/${encodeURIComponent(mpan)}/meters/${encodeURIComponent(serialNumber)}/consumption/` +
    `?period_from=${encodeURIComponent(periodFromIso)}` +
    `&period_to=${encodeURIComponent(periodToIso)}` +
    `&page_size=25000` +
    `&order_by=period`;
  return fetchPaginated(path, `electricity MPAN ${mpan}`);
}

export async function fetchGasConsumption(
  mprn: string,
  serialNumber: string,
  periodFromIso: string,
  periodToIso: string
): Promise<OctopusConsumptionRow[]> {
  const path =
    `/gas-meter-points/${encodeURIComponent(mprn)}/meters/${encodeURIComponent(serialNumber)}/consumption/` +
    `?period_from=${encodeURIComponent(periodFromIso)}` +
    `&period_to=${encodeURIComponent(periodToIso)}` +
    `&page_size=25000` +
    `&order_by=period`;
  return fetchPaginated(path, `gas MPRN ${mprn}`);
}

/**
 * Aggregates half-hourly rows into daily totals keyed by YYYY-MM-DD.
 * Uses the source timezone date prefix from interval_start.
 */
export function aggregateToDaily(
  rows: OctopusConsumptionRow[]
): Map<string, number> {
  const daily = new Map<string, number>();
  for (const r of rows) {
    const dateKey = r.interval_start.slice(0, 10);
    daily.set(dateKey, (daily.get(dateKey) ?? 0) + r.consumption);
  }
  return daily;
}
