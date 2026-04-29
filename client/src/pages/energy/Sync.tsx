import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/hooks/useAuth";

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

      <p className="text-xs text-gray-500">
        Auth: HTTP Basic against api.octopus.energy. The API key is read from
        OCTOPUS_API_KEY (set on Render). EON readings are not available via API
        and remain invoice-only.
      </p>
    </div>
  );
}
