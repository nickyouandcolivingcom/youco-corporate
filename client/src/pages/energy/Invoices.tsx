import { useRef, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Pencil,
  Upload,
  Search,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import Papa from "papaparse";
import type { EnergyInvoice, EnergyAccount } from "@shared/schema";
import { INVOICE_SOURCES } from "@shared/schema";
import { PROPERTY_CODES, PROPERTY_CODE_VALUES } from "@shared/property-codes";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = keyof EnergyInvoice;
type SortDir = "asc" | "desc";

interface InvoiceForm {
  propertyCode: string;
  supplier: string;
  periodStart: string;
  periodEnd: string;
  kwh: string;
  amount: string;
  invoiceNumber: string;
  source: (typeof INVOICE_SOURCES)[number];
  notes: string;
  energyAccountId: number | null;
}

const EMPTY_FORM: InvoiceForm = {
  propertyCode: "CORP",
  supplier: "Octopus",
  periodStart: "",
  periodEnd: "",
  kwh: "",
  amount: "",
  invoiceNumber: "",
  source: "manual",
  notes: "",
  energyAccountId: null,
};

// ─── API hooks ────────────────────────────────────────────────────────────────

function useInvoices(params: {
  search: string;
  propertyCode: string;
  supplier: string;
  from: string;
  to: string;
}) {
  return useQuery<EnergyInvoice[]>({
    queryKey: ["/api/energy-invoices", params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.search) qs.set("search", params.search);
      if (params.propertyCode) qs.set("propertyCode", params.propertyCode);
      if (params.supplier) qs.set("supplier", params.supplier);
      if (params.from) qs.set("from", params.from);
      if (params.to) qs.set("to", params.to);
      const url = `/api/energy-invoices${qs.toString() ? `?${qs}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load invoices");
      return res.json();
    },
  });
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

function useCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: InvoiceForm) => {
      const res = await apiRequest("POST", "/api/energy-invoices", payload(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create invoice");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/energy-invoices"] }),
  });
}

function useUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: InvoiceForm }) => {
      const res = await apiRequest("PATCH", `/api/energy-invoices/${id}`, payload(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update invoice");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/energy-invoices"] }),
  });
}

function useDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/energy-invoices/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete invoice");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/energy-invoices"] }),
  });
}

function useCsvImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: InvoiceForm[]) => {
      const res = await apiRequest(
        "POST",
        "/api/energy-invoices/csv-import",
        rows.map(payload)
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to import");
      }
      return res.json() as Promise<{ inserted: number }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/energy-invoices"] }),
  });
}

function payload(form: InvoiceForm) {
  const trim = (v: string) => v.trim();
  return {
    propertyCode: form.propertyCode,
    supplier: trim(form.supplier),
    periodStart: trim(form.periodStart),
    periodEnd: trim(form.periodEnd),
    kwh: form.kwh.trim() === "" ? null : trim(form.kwh),
    amount: trim(form.amount),
    invoiceNumber: trim(form.invoiceNumber) || null,
    source: form.source,
    notes: trim(form.notes) || null,
    energyAccountId: form.energyAccountId ?? null,
  };
}

// ─── Wide-format CSV pivot ────────────────────────────────────────────────────

const PROPERTY_HEADER_RE = /(\d{2}[.\s]+)?([0-9]+[A-Z]+[A-Z]?)/i;

function extractCodeFromHeader(h: string): string | null {
  // Matches "01. 16RC", "16RC", "01 16RC" → 16RC. Returns the matched code if it
  // exists in PROPERTY_CODE_VALUES.
  const m = h.toUpperCase().match(PROPERTY_HEADER_RE);
  if (!m) return null;
  const code = m[2];
  return PROPERTY_CODE_VALUES.includes(code) ? code : null;
}

function yearMonthToDates(yyyymm: string): { start: string; end: string } | null {
  // 202301 → start 2023-01-01, end 2023-01-31
  const m = yyyymm.trim().match(/^(\d{4})(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  const start = `${m[1]}-${m[2]}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function stripMoney(v: string): string {
  return v.replace(/[£,\s]/g, "").trim();
}

/**
 * Pivots a wide-format energy expense sheet into long-format invoice rows.
 *
 * Expected shape (column headers like "01. 16RC", "02. 10KG", …, "Grand Total"):
 *   MTH      | 01. 16RC | 02. 10KG | … | Grand Total
 *   202301   | £502.96  | £156.66  | … | £1,760.03
 *   202302   | £527.50  | £429.24  | … | £2,817.40
 *   …
 *   Grand Total | …
 *
 * Returns one row per (month × property) cell that has a non-empty value.
 * Skips the Grand Total column and Grand Total row.
 */
function parseWideEnergyCsv(text: string): InvoiceForm[] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = result.data;
  if (rows.length < 2) return [];

  // Find the header row: the first row containing a "MTH" cell.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (rows[i].some((c) => c?.trim().toUpperCase() === "MTH")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const headers = rows[headerIdx];
  const monthCol = headers.findIndex((c) => c?.trim().toUpperCase() === "MTH");
  if (monthCol === -1) return [];

  const propertyColumns: { col: number; code: string }[] = [];
  for (let i = 0; i < headers.length; i++) {
    if (i === monthCol) continue;
    const code = extractCodeFromHeader(headers[i] ?? "");
    if (code) propertyColumns.push({ col: i, code });
  }
  if (propertyColumns.length === 0) return [];

  const out: InvoiceForm[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const cells = rows[r];
    const monthCell = (cells[monthCol] ?? "").trim();
    if (!monthCell || /^grand\s*total$/i.test(monthCell)) continue;

    const dates = yearMonthToDates(monthCell);
    if (!dates) continue;

    for (const { col, code } of propertyColumns) {
      const raw = (cells[col] ?? "").trim();
      if (!raw) continue;
      const numeric = stripMoney(raw);
      if (numeric === "" || numeric === "0" || numeric === "0.00") continue;
      const amount = Number(numeric);
      if (Number.isNaN(amount)) continue;

      out.push({
        propertyCode: code,
        // Historically all columns in this sheet were Octopus.
        // EON went live July 2025; anything from 2025-07 onwards on 27BLA/B/D
        // would be EON, but 27BLA-D aren't in this sheet so the default is fine.
        supplier: "Octopus",
        periodStart: dates.start,
        periodEnd: dates.end,
        kwh: "",
        amount: amount.toFixed(2),
        invoiceNumber: "",
        source: "csv_import",
        notes: "",
        energyAccountId: null,
      });
    }
  }
  return out;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtMoney(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return gbp.format(n);
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtKwh(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })} kWh`;
}

function sortRows(rows: EnergyInvoice[], key: SortKey, dir: SortDir): EnergyInvoice[] {
  const numericKeys: SortKey[] = [
    "amount",
    "kwh",
    "electricityKwh",
    "gasKwh",
    "electricityAmount",
    "gasAmount",
    "vatAmount",
  ];
  const dateKeys: SortKey[] = ["periodStart", "periodEnd", "createdAt", "updatedAt"];
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (numericKeys.includes(key)) {
      const an = av == null ? Number.NEGATIVE_INFINITY : Number(av);
      const bn = bv == null ? Number.NEGATIVE_INFINITY : Number(bv);
      const cmp = an - bn;
      return dir === "asc" ? cmp : -cmp;
    }
    if (dateKeys.includes(key)) {
      const at = av ? new Date(String(av)).getTime() : 0;
      const bt = bv ? new Date(String(bv)).getTime() : 0;
      const cmp = at - bt;
      return dir === "asc" ? cmp : -cmp;
    }
    const cmp = String(av ?? "").localeCompare(String(bv ?? ""), "en-GB", {
      sensitivity: "base",
    });
    return dir === "asc" ? cmp : -cmp;
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30"
      />
    </div>
  );
}

function FormFields({
  form,
  setForm,
  accounts,
}: {
  form: InvoiceForm;
  setForm: React.Dispatch<React.SetStateAction<InvoiceForm>>;
  accounts: EnergyAccount[];
}) {
  const set = (k: keyof InvoiceForm) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v as never }));

  // Filter accounts to those matching property + supplier
  const matchingAccounts = accounts.filter(
    (a) => a.propertyCode === form.propertyCode && a.supplier === form.supplier
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Property *</label>
          <select
            value={form.propertyCode}
            onChange={(e) => setForm((f) => ({ ...f, propertyCode: e.target.value }))}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30"
          >
            {PROPERTY_CODES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <Field label="Supplier *" value={form.supplier} onChange={set("supplier")} placeholder="Octopus / EON" />
      </div>
      {matchingAccounts.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Link to account
          </label>
          <select
            value={form.energyAccountId ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                energyAccountId: e.target.value ? parseInt(e.target.value, 10) : null,
              }))
            }
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30"
          >
            <option value="">— none —</option>
            {matchingAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.accountNumber ?? `(no account no., id ${a.id})`}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Period Start *" value={form.periodStart} onChange={set("periodStart")} type="date" />
        <Field label="Period End *" value={form.periodEnd} onChange={set("periodEnd")} type="date" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (£) *" value={form.amount} onChange={set("amount")} placeholder="123.45" />
        <Field label="kWh" value={form.kwh} onChange={set("kwh")} placeholder="optional" />
      </div>
      <Field label="Invoice Number" value={form.invoiceNumber} onChange={set("invoiceNumber")} />
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30 resize-none"
        />
      </div>
    </div>
  );
}

const SOURCE_BADGE: Record<string, string> = {
  manual: "bg-gray-50 text-gray-600 ring-gray-500/10",
  csv_import: "bg-blue-50 text-blue-700 ring-blue-600/20",
  api: "bg-green-50 text-green-700 ring-green-600/20",
  ocr: "bg-purple-50 text-purple-700 ring-purple-600/20",
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EnergyInvoicesPage() {
  const { data: user } = useUser();
  const isAdmin = user?.role === "admin";
  const canEdit = user?.role === "admin" || user?.role === "contributor";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filterProperty, setFilterProperty] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("periodStart");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [editing, setEditing] = useState<EnergyInvoice | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<InvoiceForm>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<InvoiceForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const csvRef = useRef<HTMLInputElement>(null);

  const { data: rawRows = [], isLoading, error } = useInvoices({
    search: debouncedSearch,
    propertyCode: filterProperty,
    supplier: filterSupplier,
    from: filterFrom,
    to: filterTo,
  });
  const { data: accounts = [] } = useEnergyAccounts();

  const sorted = useMemo(
    () => sortRows(rawRows, sortKey, sortDir),
    [rawRows, sortKey, sortDir]
  );

  const totals = useMemo(() => {
    const amt = sorted.reduce((acc, r) => acc + Number(r.amount ?? 0), 0);
    const eKwh = sorted.reduce(
      (acc, r) => acc + (r.electricityKwh != null ? Number(r.electricityKwh) : 0),
      0
    );
    const gKwh = sorted.reduce(
      (acc, r) => acc + (r.gasKwh != null ? Number(r.gasKwh) : 0),
      0
    );
    return { amount: amt, eKwh, gKwh };
  }, [sorted]);

  const createMut = useCreate();
  const updateMut = useUpdate();
  const deleteMut = useDelete();
  const csvMut = useCsvImport();

  function handleSearchChange(v: string) {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(v), 300);
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function openEdit(inv: EnergyInvoice) {
    setEditing(inv);
    setEditForm({
      propertyCode: inv.propertyCode,
      supplier: inv.supplier,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      kwh: inv.kwh ?? "",
      amount: inv.amount,
      invoiceNumber: inv.invoiceNumber ?? "",
      source: (inv.source as InvoiceForm["source"]) ?? "manual",
      notes: inv.notes ?? "",
      energyAccountId: inv.energyAccountId ?? null,
    });
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const rows = parseWideEnergyCsv(text);
      if (rows.length === 0) {
        alert(
          "No rows parsed. The CSV needs a header row with 'MTH' and columns like '01. 16RC', '02. 10KG' …"
        );
        return;
      }
      const ok = window.confirm(
        `Parsed ${rows.length} invoice rows from the wide-format sheet.\n\nImport now?`
      );
      if (!ok) return;
      const result = await csvMut.mutateAsync(rows);
      alert(`Imported ${result.inserted} invoice rows.`);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function Th({
    label,
    sortable,
    sk,
    className,
  }: {
    label: string;
    sortable?: boolean;
    sk?: SortKey;
    className?: string;
  }) {
    const active = sk && sortKey === sk;
    return (
      <th
        onClick={sortable && sk ? () => handleSort(sk) : undefined}
        className={cn(
          "px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap",
          sortable && "cursor-pointer select-none hover:text-gray-800",
          className
        )}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active &&
            (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search…"
              className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30"
            />
            {search && (
              <button
                onClick={() => handleSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <select
            value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="">All properties</option>
            {PROPERTY_CODES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code}
              </option>
            ))}
          </select>
          <select
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="">All suppliers</option>
            <option>Octopus</option>
            <option>EON</option>
          </select>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            title="Period from"
          />
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            title="Period to"
          />
        </div>

        <div className="flex gap-2">
          {canEdit && (
            <>
              <button
                onClick={() => csvRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm rounded hover:bg-gray-50"
                title="Import wide-format energy expense CSV (the existing Google Sheet)"
              >
                <Upload size={14} />
                Import CSV (wide)
              </button>
              <input
                ref={csvRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvFile}
              />
              <BulkImportButton />
              <button
                onClick={() => {
                  setAddForm(EMPTY_FORM);
                  setShowAdd(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-youco-blue text-white text-sm rounded hover:opacity-90"
              >
                <Plus size={14} />
                Add Invoice
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="flex gap-4 text-sm text-gray-600">
        <span>
          <strong className="text-gray-900">{sorted.length}</strong> invoice
          {sorted.length === 1 ? "" : "s"}
        </span>
        <span>
          Total spend:{" "}
          <strong className="text-gray-900">{gbp.format(totals.amount)}</strong>
        </span>
        {totals.eKwh > 0 && (
          <span>
            E kWh:{" "}
            <strong className="text-gray-900">
              {totals.eKwh.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
            </strong>
          </span>
        )}
        {totals.gKwh > 0 && (
          <span>
            G kWh:{" "}
            <strong className="text-gray-900">
              {totals.gKwh.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
            </strong>
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-500">{String(error)}</div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No invoices yet. Use Import CSV to load the wide-format spreadsheet, or
            Add Invoice for one-off entries.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th label="Period" sortable sk="periodStart" />
                <Th label="Property" sortable sk="propertyCode" />
                <Th label="Supplier" sortable sk="supplier" />
                <Th label="Amount" sortable sk="amount" className="text-right" />
                <Th label="E £" sortable sk="electricityAmount" className="text-right" />
                <Th label="G £" sortable sk="gasAmount" className="text-right" />
                <Th label="E kWh" sortable sk="electricityKwh" className="text-right" />
                <Th label="G kWh" sortable sk="gasKwh" className="text-right" />
                <Th label="Invoice #" sortable sk="invoiceNumber" />
                <Th label="Source" sortable sk="source" />
                {canEdit && <Th label="" className="w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50 group">
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap text-xs">
                    {fmtDate(inv.periodStart)} — {fmtDate(inv.periodEnd)}
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap text-xs font-mono">
                    {inv.propertyCode}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                    {inv.supplier}
                  </td>
                  <td className="px-3 py-2 text-gray-900 text-right tabular-nums">
                    {fmtMoney(inv.amount)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-right tabular-nums text-xs">
                    {fmtMoney(inv.electricityAmount)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-right tabular-nums text-xs">
                    {fmtMoney(inv.gasAmount)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-right tabular-nums text-xs">
                    {fmtKwh(inv.electricityKwh ?? inv.kwh)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-right tabular-nums text-xs">
                    {fmtKwh(inv.gasKwh)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 font-mono text-xs">
                    {inv.invoiceNumber ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-inset",
                        SOURCE_BADGE[inv.source] ?? SOURCE_BADGE.manual
                      )}
                    >
                      {inv.source}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(inv)}
                          title="Edit"
                          className="p-1 text-gray-400 hover:text-youco-blue rounded"
                        >
                          <Pencil size={13} />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setDeleteId(inv.id);
                              setDeleteError("");
                            }}
                            title="Delete"
                            className="p-1 text-gray-400 hover:text-red-500 rounded"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <Modal title="Add Invoice" onClose={() => setShowAdd(false)}>
          <FormFields form={addForm} setForm={setAddForm} accounts={accounts} />
          {createMut.error && (
            <p className="mt-3 text-sm text-red-500">{createMut.error.message}</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              disabled={
                !addForm.amount.trim() ||
                !addForm.periodStart.trim() ||
                !addForm.periodEnd.trim() ||
                createMut.isPending
              }
              onClick={async () => {
                await createMut.mutateAsync(addForm);
                setShowAdd(false);
              }}
              className="px-4 py-1.5 text-sm bg-youco-blue text-white rounded hover:opacity-90 disabled:opacity-50"
            >
              {createMut.isPending ? "Saving…" : "Add Invoice"}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title="Edit Invoice" onClose={() => setEditing(null)}>
          <FormFields form={editForm} setForm={setEditForm} accounts={accounts} />
          {updateMut.error && (
            <p className="mt-3 text-sm text-red-500">{updateMut.error.message}</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              disabled={updateMut.isPending}
              onClick={async () => {
                await updateMut.mutateAsync({ id: editing.id, data: editForm });
                setEditing(null);
              }}
              className="px-4 py-1.5 text-sm bg-youco-blue text-white rounded hover:opacity-90 disabled:opacity-50"
            >
              {updateMut.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteId !== null && (
        <Modal title="Delete Invoice" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-700">
            Are you sure you want to delete this invoice? This cannot be undone.
          </p>
          {deleteError && <p className="mt-2 text-sm text-red-500">{deleteError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setDeleteId(null)}
              className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              disabled={deleteMut.isPending}
              onClick={async () => {
                try {
                  await deleteMut.mutateAsync(deleteId);
                  setDeleteId(null);
                } catch (err) {
                  setDeleteError(err instanceof Error ? err.message : "Delete failed");
                }
              }}
              className="px-4 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Bulk import (long-format) ────────────────────────────────────────────────

interface BulkRow {
  propertyCode: string;
  supplier: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  electricityKwh?: string | null;
  gasKwh?: string | null;
  electricityAmount?: string | null;
  gasAmount?: string | null;
  vatAmount?: string | null;
  invoiceNumber?: string | null;
  notes?: string | null;
}

interface BulkImportResult {
  received: number;
  inserted: number;
  skippedDuplicates: number;
  duplicates: Array<{ row: number; key: string }>;
  gaps: Array<{ propertyCode: string; supplier: string; missingMonth: string }>;
}

function bulkNormaliseHeader(h: string): string {
  return h.trim().replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/\s+/g, "_");
}

function bulkNum(v: string): string | null {
  const cleaned = v.replace(/[£,\s]/g, "").trim();
  if (!cleaned) return null;
  return cleaned;
}

function parseLongFormatCsv(text: string): {
  rows: BulkRow[];
  errors: Array<{ row: number; message: string }>;
} {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const data = result.data;
  if (data.length < 2) return { rows: [], errors: [] };

  const headers = data[0].map(bulkNormaliseHeader);
  const idx = (keys: string[]) => {
    for (const k of keys) {
      const i = headers.indexOf(k);
      if (i !== -1) return i;
    }
    return -1;
  };

  const col = {
    propertyCode: idx(["property_code", "property", "code"]),
    supplier: idx(["supplier", "name"]),
    periodStart: idx(["period_start", "from", "start"]),
    periodEnd: idx(["period_end", "to", "end"]),
    amount: idx(["amount", "total", "total_amount"]),
    electricityKwh: idx(["electricity_kwh", "e_kwh", "elec_kwh"]),
    gasKwh: idx(["gas_kwh", "g_kwh"]),
    electricityAmount: idx(["electricity_amount", "e_amount", "elec_amount"]),
    gasAmount: idx(["gas_amount", "g_amount"]),
    vatAmount: idx(["vat_amount", "vat"]),
    invoiceNumber: idx(["invoice_number", "invoice", "invoice_no"]),
    notes: idx(["notes", "note"]),
  };

  const rows: BulkRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 1; i < data.length; i++) {
    const cells = data[i];
    const get = (c: number) => (c >= 0 ? (cells[c] ?? "").trim() : "");
    const propertyCode = get(col.propertyCode).toUpperCase();
    const supplier = get(col.supplier);
    const periodStart = get(col.periodStart);
    const periodEnd = get(col.periodEnd);
    const amount = bulkNum(get(col.amount));
    if (!propertyCode || !supplier || !periodStart || !periodEnd || !amount) continue;
    if (!PROPERTY_CODE_VALUES.includes(propertyCode)) {
      errors.push({ row: i + 1, message: `Unknown property code: ${propertyCode}` });
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
      errors.push({
        row: i + 1,
        message: `Period dates must be YYYY-MM-DD (got ${periodStart} → ${periodEnd})`,
      });
      continue;
    }
    rows.push({
      propertyCode,
      supplier,
      periodStart,
      periodEnd,
      amount,
      electricityKwh: bulkNum(get(col.electricityKwh)),
      gasKwh: bulkNum(get(col.gasKwh)),
      electricityAmount: bulkNum(get(col.electricityAmount)),
      gasAmount: bulkNum(get(col.gasAmount)),
      vatAmount: bulkNum(get(col.vatAmount)),
      invoiceNumber: get(col.invoiceNumber) || null,
      notes: get(col.notes) || null,
    });
  }
  return { rows, errors };
}

function useBulkImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: BulkRow[]) => {
      const res = await apiRequest("POST", "/api/energy-invoices/bulk-import", { rows });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Bulk import failed");
      }
      return res.json() as Promise<BulkImportResult>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/energy-invoices"] }),
  });
}

function BulkImportButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [parseErrors, setParseErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [parsedRows, setParsedRows] = useState<BulkRow[] | null>(null);
  const importMut = useBulkImport();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows, errors } = parseLongFormatCsv(text);
      setParsedRows(rows);
      setParseErrors(errors);
      setOpen(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleConfirm() {
    if (!parsedRows) return;
    await importMut.mutateAsync(parsedRows);
  }

  return (
    <>
      <button
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-300 text-emerald-700 text-sm rounded hover:bg-emerald-50"
        title="Bulk import multiple invoices (long format CSV) — typically EON multi-month upload"
      >
        <Upload size={14} />
        Bulk Import
      </button>
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />

      {open && parsedRows && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Bulk Import — review</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3 text-sm">
              <p className="text-gray-700">
                Parsed <strong>{parsedRows.length}</strong> rows from your CSV.
                {parseErrors.length > 0 && (
                  <span className="text-red-600">
                    {" "}
                    {parseErrors.length} rows failed validation (see below).
                  </span>
                )}
              </p>

              <details className="border border-gray-200 rounded p-3">
                <summary className="cursor-pointer text-xs text-youco-blue">
                  Preview first 8 rows
                </summary>
                <table className="w-full mt-2 text-xs">
                  <thead>
                    <tr>
                      <th className="text-left px-1">Property</th>
                      <th className="text-left px-1">Supplier</th>
                      <th className="text-left px-1">Period</th>
                      <th className="text-right px-1">Amount</th>
                      <th className="text-right px-1">E kWh</th>
                      <th className="text-right px-1">G kWh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 8).map((r, i) => (
                      <tr key={i}>
                        <td className="px-1 font-mono">{r.propertyCode}</td>
                        <td className="px-1">{r.supplier}</td>
                        <td className="px-1">
                          {r.periodStart} → {r.periodEnd}
                        </td>
                        <td className="px-1 text-right">£{r.amount}</td>
                        <td className="px-1 text-right">{r.electricityKwh ?? "—"}</td>
                        <td className="px-1 text-right">{r.gasKwh ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 8 && (
                  <p className="text-xs text-gray-500 mt-1">
                    ... and {parsedRows.length - 8} more
                  </p>
                )}
              </details>

              {parseErrors.length > 0 && (
                <details className="border border-red-200 rounded p-3 bg-red-50">
                  <summary className="cursor-pointer text-xs text-red-700">
                    {parseErrors.length} validation errors
                  </summary>
                  <ul className="mt-2 text-xs text-red-700 space-y-0.5">
                    {parseErrors.slice(0, 20).map((e, i) => (
                      <li key={i}>
                        Row {e.row}: {e.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {importMut.error && (
                <p className="text-sm text-red-600">{importMut.error.message}</p>
              )}

              {importMut.data && (
                <div className="border border-gray-200 rounded p-3 space-y-2 bg-gray-50">
                  <p className="text-gray-700">
                    Imported <strong>{importMut.data.inserted}</strong> /{" "}
                    {importMut.data.received} rows.{" "}
                    {importMut.data.skippedDuplicates > 0 && (
                      <span className="text-amber-700">
                        {importMut.data.skippedDuplicates} duplicates skipped.
                      </span>
                    )}
                  </p>
                  {importMut.data.duplicates.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-xs text-amber-700">
                        Duplicate rows ({importMut.data.duplicates.length})
                      </summary>
                      <ul className="mt-1 text-xs text-gray-600 max-h-32 overflow-y-auto">
                        {importMut.data.duplicates.slice(0, 30).map((d, i) => (
                          <li key={i}>
                            Row {d.row}: <code>{d.key}</code>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {importMut.data.gaps.length > 0 && (
                    <details open>
                      <summary className="cursor-pointer text-xs text-amber-700 font-semibold">
                        Missing months ({importMut.data.gaps.length})
                      </summary>
                      <ul className="mt-1 text-xs text-gray-700 max-h-40 overflow-y-auto space-y-0.5">
                        {importMut.data.gaps.map((g, i) => (
                          <li key={i}>
                            <code>{g.propertyCode}</code> / {g.supplier} —{" "}
                            <strong>{g.missingMonth}</strong>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {importMut.data.gaps.length === 0 && (
                    <p className="text-xs text-emerald-700">
                      No gaps in monthly coverage.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                {importMut.data ? "Close" : "Cancel"}
              </button>
              {!importMut.data && (
                <button
                  disabled={parsedRows.length === 0 || importMut.isPending}
                  onClick={handleConfirm}
                  className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded hover:opacity-90 disabled:opacity-50"
                >
                  {importMut.isPending
                    ? "Importing…"
                    : `Import ${parsedRows.length} rows`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
