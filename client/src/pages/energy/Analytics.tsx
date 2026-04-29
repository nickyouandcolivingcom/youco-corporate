import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, BarChart3 } from "lucide-react";
import { PROPERTY_CODES, PROPERTY_CODE_VALUES } from "@shared/property-codes";
import { useUser } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type FuelView = "Electricity" | "Gas";
type RangeKey = "1m" | "3m" | "6m" | "12m" | "2y";

interface AnalyticsRow {
  readingDate: string;
  fuelType: string;
  kwh: string;
  energyAccountId: number;
  propertyCode: string;
}

interface AnalyticsResponse {
  period: { from: string; to: string; fuelType: string | null };
  rowCount: number;
  rows: AnalyticsRow[];
}

// Distinct colours per property — chosen for legibility on white at small sizes.
// Order matches PROPERTY_CODES so colours are stable.
const PROPERTY_COLOURS: Record<string, string> = {
  CORP: "#6b7280",
  "16RC": "#0ea5e9",
  "10KG": "#10b981",
  "32LFR": "#f59e0b",
  "84DD": "#8b5cf6",
  "4WS": "#ef4444",
  "26BL": "#737373",
  "26BLA": "#06b6d4",
  "26BLB": "#14b8a6",
  "26BLC": "#84cc16",
  "27BL": "#a3a3a3",
  "27BLA": "#f97316",
  "27BLB": "#ec4899",
  "27BLC": "#a855f7",
  "27BLD": "#3b82f6",
  "26-27BL": "#525252",
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoMonthsAgo(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

const RANGES: Record<RangeKey, { label: string; months: number }> = {
  "1m": { label: "1 month", months: 1 },
  "3m": { label: "3 months", months: 3 },
  "6m": { label: "6 months", months: 6 },
  "12m": { label: "12 months", months: 12 },
  "2y": { label: "2 years", months: 24 },
};

function decideGranularity(months: number): "daily" | "weekly" | "monthly" {
  if (months <= 3) return "daily";
  if (months <= 6) return "weekly";
  return "monthly";
}

function bucketKey(date: string, granularity: "daily" | "weekly" | "monthly"): string {
  if (granularity === "daily") return date;
  if (granularity === "monthly") return date.slice(0, 7); // YYYY-MM
  // Weekly: ISO week starting Monday. Use UTC to avoid timezone drift.
  const d = new Date(date + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7; // 0 = Mon
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function formatBucket(key: string, granularity: "daily" | "weekly" | "monthly"): string {
  if (granularity === "monthly") {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });
  }
  const d = new Date(key);
  if (granularity === "weekly") {
    return `w/c ${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;
  }
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function useAnalytics(from: string, to: string, fuel: FuelView) {
  return useQuery<AnalyticsResponse>({
    queryKey: ["/api/octopus/analytics", from, to, fuel],
    queryFn: async () => {
      const qs = new URLSearchParams({ from, to, fuelType: fuel });
      const res = await fetch(`/api/octopus/analytics?${qs}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
  });
}

export default function EnergyAnalyticsPage() {
  const { data: user } = useUser();
  const canView = user?.role !== undefined;

  const [range, setRange] = useState<RangeKey>("3m");
  const [fuel, setFuel] = useState<FuelView>("Electricity");
  const [selectedProps, setSelectedProps] = useState<Set<string>>(
    new Set(PROPERTY_CODE_VALUES)
  );

  const months = RANGES[range].months;
  const from = isoMonthsAgo(months);
  const to = isoToday();
  const granularity = decideGranularity(months);

  const { data, isLoading, error } = useAnalytics(from, to, fuel);

  // Aggregate raw daily rows into the chosen granularity bucket × property.
  const { lineData, barData, propertiesWithData } = useMemo(() => {
    const rows = data?.rows ?? [];
    if (rows.length === 0) {
      return { lineData: [], barData: [], propertiesWithData: [] };
    }

    // Map<bucketKey, Map<propertyCode, kwhSum>>
    const buckets = new Map<string, Map<string, number>>();
    const propTotals = new Map<string, number>();

    for (const r of rows) {
      if (!selectedProps.has(r.propertyCode)) continue;
      const key = bucketKey(r.readingDate, granularity);
      let inner = buckets.get(key);
      if (!inner) {
        inner = new Map();
        buckets.set(key, inner);
      }
      const kwh = Number(r.kwh);
      inner.set(r.propertyCode, (inner.get(r.propertyCode) ?? 0) + kwh);
      propTotals.set(r.propertyCode, (propTotals.get(r.propertyCode) ?? 0) + kwh);
    }

    const sortedKeys = [...buckets.keys()].sort();
    const propertiesWithData = [...propTotals.keys()].sort();

    const lineData = sortedKeys.map((key) => {
      const row: Record<string, string | number> = { bucket: formatBucket(key, granularity) };
      const inner = buckets.get(key)!;
      for (const code of propertiesWithData) {
        row[code] = Number((inner.get(code) ?? 0).toFixed(2));
      }
      return row;
    });

    const barData = propertiesWithData
      .map((code) => ({
        property: code,
        kwh: Number((propTotals.get(code) ?? 0).toFixed(2)),
      }))
      .sort((a, b) => b.kwh - a.kwh);

    return { lineData, barData, propertiesWithData };
  }, [data, granularity, selectedProps]);

  function toggleProperty(code: string) {
    setSelectedProps((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  if (!canView) {
    return <div className="text-sm text-gray-500">Sign in to view analytics.</div>;
  }

  return (
    <div className="space-y-5">
      {/* ─── Filter bar ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Range</span>
          {(Object.keys(RANGES) as RangeKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={cn(
                "px-3 py-1 text-xs rounded border transition-colors",
                range === k
                  ? "bg-youco-blue text-white border-youco-blue"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              )}
            >
              {RANGES[k].label}
            </button>
          ))}
          <span className="text-xs text-gray-400 ml-2">
            ({from} → {to}, {granularity})
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fuel</span>
          {(["Electricity", "Gas"] as FuelView[]).map((f) => (
            <button
              key={f}
              onClick={() => setFuel(f)}
              className={cn(
                "px-3 py-1 text-xs rounded border transition-colors",
                fuel === f
                  ? "bg-youco-bronze text-white border-youco-bronze"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Properties</span>
          <button
            onClick={() => setSelectedProps(new Set(PROPERTY_CODE_VALUES))}
            className="text-xs text-youco-blue hover:underline"
          >
            All
          </button>
          <button
            onClick={() => setSelectedProps(new Set())}
            className="text-xs text-youco-blue hover:underline"
          >
            None
          </button>
          {PROPERTY_CODES.map((p) => (
            <button
              key={p.code}
              onClick={() => toggleProperty(p.code)}
              className={cn(
                "px-2 py-0.5 text-xs rounded border font-mono",
                selectedProps.has(p.code)
                  ? "bg-gray-100 border-gray-400 text-gray-900"
                  : "bg-white border-gray-200 text-gray-400"
              )}
              style={
                selectedProps.has(p.code)
                  ? { borderLeft: `4px solid ${PROPERTY_COLOURS[p.code] ?? "#999"}` }
                  : undefined
              }
            >
              {p.code}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Charts ──────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-sm text-gray-500">
          Loading…
        </div>
      ) : error ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-red-500">
          {String(error)}
        </div>
      ) : lineData.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-sm text-gray-400">
          No readings in this range. Try widening the date range, switching fuel, or
          importing a consumption CSV on the Sync page.
        </div>
      ) : (
        <>
          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-youco-blue" />
              <h3 className="font-semibold text-gray-900 text-sm">
                {fuel} usage over time
              </h3>
              <span className="text-xs text-gray-500 ml-auto">
                {data?.rowCount ?? 0} daily readings • {granularity} buckets
              </span>
            </div>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={lineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  label={{
                    value: "kWh",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: "#6b7280" },
                  }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: number) => `${value.toLocaleString("en-GB")} kWh`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {propertiesWithData.map((code) => (
                  <Line
                    key={code}
                    type="monotone"
                    dataKey={code}
                    stroke={PROPERTY_COLOURS[code] ?? "#999"}
                    strokeWidth={2}
                    dot={granularity === "daily" ? false : { r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={16} className="text-youco-bronze" />
              <h3 className="font-semibold text-gray-900 text-sm">
                Total {fuel.toLowerCase()} kWh per property — {RANGES[range].label}
              </h3>
              <span className="text-xs text-gray-500 ml-auto">
                Sorted highest first
              </span>
            </div>
            <ResponsiveContainer width="100%" height={Math.max(180, barData.length * 36)}>
              <BarChart
                data={barData}
                layout="vertical"
                margin={{ top: 5, right: 30, bottom: 5, left: 50 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  label={{
                    value: "kWh",
                    position: "insideBottom",
                    offset: -2,
                    style: { fontSize: 11, fill: "#6b7280" },
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="property"
                  tick={{ fontSize: 11, fill: "#374151", fontFamily: "monospace" }}
                  width={60}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: number) => `${value.toLocaleString("en-GB")} kWh`}
                />
                <Bar dataKey="kwh" fill="#0ea5e9">
                  {barData.map((entry) => (
                    <Bar
                      key={entry.property}
                      dataKey="kwh"
                      fill={PROPERTY_COLOURS[entry.property] ?? "#0ea5e9"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>

          <p className="text-xs text-gray-500">
            Data source: <code>energy_readings</code> (daily kWh from Octopus API +
            CSV imports). To spot adverse trends, switch to 1m/3m daily view and
            watch for property lines breaking above their previous range. EON
            properties (27BLA/B/D) won't appear here — invoice-only.
          </p>
        </>
      )}
    </div>
  );
}
