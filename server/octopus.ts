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
  // Basic auth: username = API key, password = empty.
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
 * Picks the most recent (latest valid_from) tariff agreement. Returns null
 * if there are no agreements.
 */
export function pickActiveAgreement(
  agreements: OctopusAgreement[]
): OctopusAgreement | null {
  if (agreements.length === 0) return null;
  return [...agreements].sort((a, b) => {
    const av = a.valid_from ? new Date(a.valid_from).getTime() : 0;
    const bv = b.valid_from ? new Date(b.valid_from).getTime() : 0;
    return bv - av;
  })[0];
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

/**
 * Fetches all half-hourly consumption rows for a meter between two ISO
 * datetimes. Follows pagination via the `next` URL.
 *
 * The Octopus API caps page_size around 25000; we request the max to
 * minimise round-trips. A ~30-day window has 30*48 = 1440 rows so a single
 * page is normally enough; the loop is defensive for longer windows.
 */
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

  const out: OctopusConsumptionRow[] = [];
  let nextUrl: string | null = `${BASE}${path}`;
  // Cap pagination to 10 pages defensively (250k rows = ~14 years half-hourly)
  for (let i = 0; i < 10 && nextUrl; i++) {
    const res = await fetch(nextUrl, { headers: { Authorization: getAuthHeader() } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Octopus consumption ${res.status} for MPAN ${mpan}: ${body.slice(0, 200)}`
      );
    }
    const page = (await res.json()) as OctopusConsumptionPage;
    out.push(...page.results);
    nextUrl = page.next;
  }
  return out;
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

  const out: OctopusConsumptionRow[] = [];
  let nextUrl: string | null = `${BASE}${path}`;
  for (let i = 0; i < 10 && nextUrl; i++) {
    const res = await fetch(nextUrl, { headers: { Authorization: getAuthHeader() } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Octopus gas consumption ${res.status} for MPRN ${mprn}: ${body.slice(0, 200)}`
      );
    }
    const page = (await res.json()) as OctopusConsumptionPage;
    out.push(...page.results);
    nextUrl = page.next;
  }
  return out;
}

/**
 * Aggregates half-hourly rows into daily totals keyed by YYYY-MM-DD (UTC).
 * Returns a Map for stable insertion order.
 */
export function aggregateToDaily(
  rows: OctopusConsumptionRow[]
): Map<string, number> {
  const daily = new Map<string, number>();
  for (const r of rows) {
    // interval_start looks like "2024-09-01T00:00:00+01:00".
    // Normalise to a date string in the source timezone — slice the first 10 chars.
    const dateKey = r.interval_start.slice(0, 10);
    daily.set(dateKey, (daily.get(dateKey) ?? 0) + r.consumption);
  }
  return daily;
}
