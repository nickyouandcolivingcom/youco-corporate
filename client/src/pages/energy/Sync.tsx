import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Download, AlertCircle, CheckCircle2, Upload } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/hooks/useAuth";
import type { EnergyAccount } from "@shared/schema";

interface DiscoverResult {
  total: number;
  ok: number;
  errors: number;
  skipped: number;
  results: Array<{
    accountNumber: string;
    propertyCode: string;
    status: "ok" | "error" | "skipped";
    mpan?: string | null;
    mprn?: string | null;
    electricityMeterSerial?: string | null;
    gasMeterSerial?: string | null;
    fuelType?: string;
    tariffCode?: string | null;
    error?: string;
  }>;
}

interface SyncResult {
  period: { from: string; to: string };
  accountsTotal: number;
  fuelRowsTotal: number;
  ok: number;
  errors: number;
  skipped: number;
  summary: Array<{
    accountId: number;
    accountNumber: string | null;
    propertyCode: string;
    fuelType: "Electricity" | "Gas";
    status: "ok" | "error" | "skipped";
    daysWritten?: number;
    totalKwh?: number;
    error?: string;
  }>;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function useDiscover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/octopus/discover", {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Discover failed");
      }
      return res.json() as Promise<DiscoverResult>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/energy"] }),
  });
}

function useSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const res = await apiRequest("POST", "/api/octopus/sync", { from, to });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Sync failed");
      }
      return res.json() as Promise<SyncResult>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/energy"] }),
  });
}

interface CsvImportResult {
  accountId: number;
  propertyCode: string;
  fuelType: "Electricity" | "Gas";
  halfHourlyRowsParsed: number;
  halfHourlyRowsSkipped: number;
  daysWritten: number;
  totalKwh: number;
}

function useEnergyAccounts() {
  return useQuery<EnergyAccount[]>({
    queryKey: ["/api/energy"],
    queryFn: async () => {
      const res = await fetch("/api/energy", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load energy accounts");
      return res.json();
    },
  });
}

function useImportCsv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      accountId: number;
      fuelType: "Electricity" | "Gas";
      csvText: string;
    }) => {
      const res = await apiRequest(
        "POST",
        "/api/octopus/import-consumption-csv",
        payload
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Import failed");
      }
      return res.json() as Promise<CsvImportResult>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/energy"] }),
  });
}

const STATUS_ICON = {
  ok: <CheckCircle2 size={14} className="text-green-600" />,
  error: <AlertCircle size={14} className="text-red-600" />,
  skipped: <AlertCircle size={14} className="text-gray-400" />,
};

export default function EnergySyncPage() {
  const { data: user } = useUser();
  const canEdit = user?.role === "admin" || user?.role === "contributor";

  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoToday());

  const discoverMut = useDiscover();
  const syncMut = useSync();

  if (!canEdit) {
    return (
      <div className="text-sm text-gray-500">
        You need contributor or admin access to run Octopus sync.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ─── Step 1: Discover ───────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-youco-blue/10 text-youco-blue flex items-center justify-center flex-shrink-0">
            <Search size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">Step 1 — Discover supply metadata</h3>
            <p className="text-sm text-gray-600 mt-0.5">
              Walks every Octopus account in the database and fetches MPAN, MPRN,
              electricity + gas meter serials, fuel type, and active tariff code.
              Picks the active meter point (current agreement), not just the first.
              Idempotent — safe to re-run.
            </p>
            <div className="mt-3">
              <button
                disabled={discoverMut.isPending}
                onClick={() => discoverMut.mutate()}
                className="px-4 py-1.5 bg-youco-blue text-white text-sm rounded hover:opacity-90 disabled:opacity-50"
              >
                {discoverMut.isPending ? "Discovering…" : "Run Discovery"}
              </button>
              {discoverMut.error && (
                <p className="mt-2 text-sm text-red-600">{discoverMut.error.message}</p>
              )}
            </div>
            {discoverMut.data && (
              <div className="mt-3 text-sm">
                <p className="text-gray-700">
                  <strong>{discoverMut.data.ok}/{discoverMut.data.total}</strong> accounts
                  enriched.{" "}
                  {discoverMut.data.errors > 0 && (
                    <span className="text-red-600">{discoverMut.data.errors} errors. </span>
                  )}
                  {discoverMut.data.skipped > 0 && (
                    <span className="text-gray-500">{discoverMut.data.skipped} skipped.</span>
                  )}
                </p>
                <details className="mt-2" open>
                  <summary className="cursor-pointer text-xs text-youco-blue">
                    Show details
                  </summary>
                  <table className="w-full mt-2 text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left">Account</th>
                        <th className="px-2 py-1 text-left">Prop</th>
                        <th className="px-2 py-1 text-left">Fuel</th>
                        <th className="px-2 py-1 text-left">MPAN</th>
                        <th className="px-2 py-1 text-left">Elec serial</th>
                        <th className="px-2 py-1 text-left">MPRN</th>
                        <th className="px-2 py-1 text-left">Gas serial</th>
                        <th className="px-2 py-1 text-left">Tariff</th>
                        <th className="px-2 py-1 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {discoverMut.data.results.map((r) => (
                        <tr key={r.accountNumber}>
                          <td className="px-2 py-1 font-mono">{r.accountNumber}</td>
                          <td className="px-2 py-1 font-mono">{r.propertyCode}</td>
                          <td className="px-2 py-1">{r.fuelType ?? "—"}</td>
                          <td className="px-2 py-1 font-mono">{r.mpan ?? "—"}</td>
                          <td className="px-2 py-1 font-mono">{r.electricityMeterSerial ?? "—"}</td>
                          <td className="px-2 py-1 font-mono">{r.mprn ?? "—"}</td>
                          <td className="px-2 py-1 font-mono">{r.gasMeterSerial ?? "—"}</td>
                          <td className="px-2 py-1 font-mono">{r.tariffCode ?? "—"}</td>
                          <td className="px-2 py-1">
                            <span className="inline-flex items-center gap-1">
                              {STATUS_ICON[r.status]}
                              {r.status === "error" && (
                                <span className="text-red-600">{r.error}</span>
                              )}
                              {r.status === "skipped" && (
                                <span className="text-gray-500">{r.error}</span>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Step 2: Sync readings ─────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-youco-bronze/10 text-youco-bronze flex items-center justify-center flex-shrink-0">
            <Download size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">Step 2 — Sync daily readings</h3>
            <p className="text-sm text-gray-600 mt-0.5">
              Pulls half-hourly consumption from Octopus for the date range below
              and aggregates to daily totals. Dual-fuel accounts produce one row
              per fuel. Re-syncs overwrite same-date rows.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFrom(isoDaysAgo(7));
                    setTo(isoToday());
                  }}
                  className="px-3 py-1.5 border border-gray-300 text-xs rounded hover:bg-gray-50"
                >
                  Last 7d
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFrom(isoDaysAgo(30));
                    setTo(isoToday());
                  }}
                  className="px-3 py-1.5 border border-gray-300 text-xs rounded hover:bg-gray-50"
                >
                  Last 30d
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFrom(isoDaysAgo(365));
                    setTo(isoToday());
                  }}
                  className="px-3 py-1.5 border border-gray-300 text-xs rounded hover:bg-gray-50"
                >
                  Last 1y
                </button>
              </div>
              <button
                disabled={syncMut.isPending || !from || !to}
                onClick={() => syncMut.mutate({ from, to })}
                className="px-4 py-1.5 bg-youco-bronze text-white text-sm rounded hover:opacity-90 disabled:opacity-50"
              >
                {syncMut.isPending ? "Syncing…" : "Sync All Octopus Accounts"}
              </button>
            </div>
            {syncMut.error && (
              <p className="mt-2 text-sm text-red-600">{syncMut.error.message}</p>
            )}
            {syncMut.data && (
              <div className="mt-3 text-sm">
                <p className="text-gray-700">
                  Period <strong>{syncMut.data.period.from}</strong> →{" "}
                  <strong>{syncMut.data.period.to}</strong>:{" "}
                  <strong>{syncMut.data.ok}/{syncMut.data.fuelRowsTotal}</strong> fuel-rows
                  synced across {syncMut.data.accountsTotal} accounts.
                  {syncMut.data.errors > 0 && (
                    <span className="text-red-600"> {syncMut.data.errors} errors.</span>
                  )}
                  {syncMut.data.skipped > 0 && (
                    <span className="text-gray-500">
                      {" "}
                      {syncMut.data.skipped} skipped (run Discover first).
                    </span>
                  )}
                </p>
                <table className="w-full mt-2 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left">Account</th>
                      <th className="px-2 py-1 text-left">Property</th>
                      <th className="px-2 py-1 text-left">Fuel</th>
                      <th className="px-2 py-1 text-right">Days</th>
                      <th className="px-2 py-1 text-right">Total kWh</th>
                      <th className="px-2 py-1 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {syncMut.data.summary.map((r, idx) => (
                      <tr key={`${r.accountId}-${r.fuelType}-${idx}`}>
                        <td className="px-2 py-1 font-mono">{r.accountNumber ?? "—"}</td>
                        <td className="px-2 py-1 font-mono">{r.propertyCode}</td>
                        <td className="px-2 py-1">{r.fuelType}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {r.daysWritten ?? "—"}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {r.totalKwh != null
                            ? r.totalKwh.toLocaleString("en-GB", {
                                maximumFractionDigits: 2,
                              })
                            : "—"}
                        </td>
                        <td className="px-2 py-1">
                          <span className="inline-flex items-center gap-1">
                            {STATUS_ICON[r.status]}
                            {r.status === "error" && (
                              <span className="text-red-600">{r.error}</span>
                            )}
                            {r.status === "skipped" && (
                              <span className="text-gray-500">{r.error}</span>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Step 3: Import consumption CSV (fallback) ──────────────────────── */}
      <CsvImportSection />

      <p className="text-xs text-gray-500">
        Auth: HTTP Basic against api.octopus.energy. The API key is read from
        OCTOPUS_API_KEY (set on Render). EON readings are not available via API
        and remain invoice-only.
      </p>
    </div>
  );
}

function CsvImportSection() {
  const { data: accounts = [] } = useEnergyAccounts();
  const importMut = useImportCsv();
  const csvRef = useRef<HTMLInputElement>(null);

  const octopusAccounts = accounts.filter((a) => a.supplier === "Octopus");
  const [accountId, setAccountId] = useState<number | "">(
    octopusAccounts[0]?.id ?? ""
  );
  const [fuelType, setFuelType] = useState<"Electricity" | "Gas">("Electricity");

  // Default to first Octopus account once accounts load.
  if (accountId === "" && octopusAccounts.length > 0) {
    setAccountId(octopusAccounts[0].id);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || accountId === "") return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      await importMut.mutateAsync({
        accountId: accountId as number,
        fuelType,
        csvText: text,
      });
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const selectedAcc = octopusAccounts.find((a) => a.id === accountId);

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
          <Upload size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">
            Step 3 — Import consumption CSV (fallback)
          </h3>
          <p className="text-sm text-gray-600 mt-0.5">
            For accounts where Step 2 returns 0 days (e.g. 16RC, 10KG) but
            Octopus's dashboard does have data: download the half-hourly CSV
            from the Octopus dashboard ("Get your energy geek on" → choose data
            + dates → Download), then upload it here. Same daily aggregation
            and upsert as the API path. Use one CSV per (account, fuel).
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Account
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(Number(e.target.value))}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm min-w-[260px]"
              >
                {octopusAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountNumber} — {a.propertyCode}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Fuel
              </label>
              <select
                value={fuelType}
                onChange={(e) =>
                  setFuelType(e.target.value as "Electricity" | "Gas")
                }
                className="border border-gray-300 rounded px-3 py-1.5 text-sm"
              >
                <option>Electricity</option>
                <option>Gas</option>
              </select>
            </div>
            <button
              disabled={accountId === "" || importMut.isPending}
              onClick={() => csvRef.current?.click()}
              className="px-4 py-1.5 bg-emerald-600 text-white text-sm rounded hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Upload size={14} />
              {importMut.isPending ? "Importing…" : "Choose CSV"}
            </button>
            <input
              ref={csvRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFile}
            />
          </div>
          {importMut.error && (
            <p className="mt-2 text-sm text-red-600">{importMut.error.message}</p>
          )}
          {importMut.data && (
            <div className="mt-3 text-sm">
              <p className="text-gray-700">
                Imported <strong>{importMut.data.daysWritten}</strong> days for{" "}
                <strong>{importMut.data.propertyCode}</strong> ({importMut.data.fuelType})
                — total <strong>{importMut.data.totalKwh.toLocaleString("en-GB")} kWh</strong>{" "}
                from {importMut.data.halfHourlyRowsParsed.toLocaleString("en-GB")} half-hour rows.
                {importMut.data.halfHourlyRowsSkipped > 0 && (
                  <span className="text-gray-500">
                    {" "}
                    ({importMut.data.halfHourlyRowsSkipped} rows skipped — malformed.)
                  </span>
                )}
              </p>
              {selectedAcc && (
                <p className="text-xs text-gray-500 mt-1">
                  These readings are now visible on /energy/analytics for{" "}
                  {selectedAcc.propertyCode}.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
