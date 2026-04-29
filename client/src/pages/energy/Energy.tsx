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
  AlertTriangle,
} from "lucide-react";
import Papa from "papaparse";
import type { EnergyAccount, FuelType, EnergyStatus } from "@shared/schema";
import { FUEL_TYPES, ENERGY_STATUSES } from "@shared/schema";
import { PROPERTY_CODES, PROPERTY_CODE_VALUES } from "@shared/property-codes";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = keyof EnergyAccount;
type SortDir = "asc" | "desc";

interface EnergyForm {
  supplier: string;
  propertyCode: string;
  accountNumber: string;
  fuelType: FuelType;
  mpan: string;
  mprn: string;
  tariffName: string;
  unitRatePence: string;
  standingChargePence: string;
  contractEndDate: string;
  lastReadingValue: string;
  lastReadingDate: string;
  paymentMethod: string | null;
  paymentDay: number | null;
  status: EnergyStatus;
  disputeNotes: string;
  notes: string;
}

const EMPTY_FORM: EnergyForm = {
  supplier: "",
  propertyCode: "CORP",
  accountNumber: "",
  fuelType: "Electricity",
  mpan: "",
  mprn: "",
  tariffName: "",
  unitRatePence: "",
  standingChargePence: "",
  contractEndDate: "",
  lastReadingValue: "",
  lastReadingDate: "",
  paymentMethod: null,
  paymentDay: null,
  status: "Active",
  disputeNotes: "",
  notes: "",
};

// ─── API hooks ────────────────────────────────────────────────────────────────

function useAccounts(search: string) {
  return useQuery<EnergyAccount[]>({
    queryKey: ["/api/energy", search],
    queryFn: async () => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/energy${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load energy accounts");
      return res.json();
    },
  });
}

function useCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: EnergyForm) => {
      const res = await apiRequest("POST", "/api/energy", nullify(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create account");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/energy"] }),
  });
}

function useUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: EnergyForm }) => {
      const res = await apiRequest("PATCH", `/api/energy/${id}`, nullify(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update account");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/energy"] }),
  });
}

function useDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/energy/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete account");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/energy"] }),
  });
}

function useCsvImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: EnergyForm[]) => {
      const res = await apiRequest(
        "POST",
        "/api/energy/csv-import",
        rows.map(nullify)
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to import");
      }
      return res.json() as Promise<{ inserted: number }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/energy"] }),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nullify(form: EnergyForm) {
  return Object.fromEntries(
    Object.entries(form).map(([k, v]) => {
      if (v === null || v === undefined) return [k, null];
      if (typeof v === "number") return [k, v];
      const trimmed = String(v).trim();
      return [k, trimmed === "" ? null : trimmed];
    })
  );
}

function normaliseHeader(h: string): string {
  return h
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function stripMoney(v: string): string {
  return v.replace(/[£,p\s]/gi, "").trim();
}

function parseCsv(text: string): EnergyForm[] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = result.data;
  if (rows.length < 2) return [];

  const headers = rows[0].map(normaliseHeader);
  const idx = (keys: string[]) => {
    for (const k of keys) {
      const i = headers.indexOf(k);
      if (i !== -1) return i;
    }
    return -1;
  };

  const col = {
    supplier: idx(["supplier", "name"]),
    propertyCode: idx(["property_code", "property", "code"]),
    accountNumber: idx(["account_number", "account_no", "account"]),
    fuelType: idx(["fuel_type", "fuel"]),
    mpan: idx(["mpan"]),
    mprn: idx(["mprn"]),
    tariffName: idx(["tariff_name", "tariff"]),
    unitRatePence: idx(["unit_rate_pence", "unit_rate", "rate"]),
    standingChargePence: idx(["standing_charge_pence", "standing_charge"]),
    contractEndDate: idx(["contract_end_date", "contract_end", "fixed_end"]),
    lastReadingValue: idx(["last_reading_value", "reading"]),
    lastReadingDate: idx(["last_reading_date", "reading_date"]),
    paymentMethod: idx(["payment_method", "method"]),
    paymentDay: idx(["payment_day", "day"]),
    status: idx(["status"]),
    disputeNotes: idx(["dispute_notes"]),
    notes: idx(["notes", "note"]),
  };

  const results: EnergyForm[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const supplier = col.supplier >= 0 ? (cells[col.supplier] ?? "").trim() : "";
    if (!supplier) continue;
    const get = (c: number) => (c >= 0 ? (cells[c] ?? "").trim() : "");
    const propertyCode = get(col.propertyCode).toUpperCase() || "CORP";
    const fuelRaw = get(col.fuelType).toLowerCase();
    const fuelType: FuelType =
      fuelRaw.startsWith("g") ? "Gas" : fuelRaw.startsWith("d") ? "Dual" : "Electricity";
    const statusRaw = get(col.status).toLowerCase();
    const status: EnergyStatus =
      statusRaw.startsWith("c") ? "Closed" : statusRaw.startsWith("d") ? "Disputed" : "Active";
    const rawDay = get(col.paymentDay);
    const parsedDay = rawDay ? parseInt(rawDay, 10) : null;

    results.push({
      supplier,
      propertyCode: PROPERTY_CODE_VALUES.includes(propertyCode) ? propertyCode : "CORP",
      accountNumber: get(col.accountNumber),
      fuelType,
      mpan: get(col.mpan),
      mprn: get(col.mprn),
      tariffName: get(col.tariffName),
      unitRatePence: stripMoney(get(col.unitRatePence)),
      standingChargePence: stripMoney(get(col.standingChargePence)),
      contractEndDate: get(col.contractEndDate),
      lastReadingValue: stripMoney(get(col.lastReadingValue)),
      lastReadingDate: get(col.lastReadingDate),
      paymentMethod: get(col.paymentMethod) || null,
      paymentDay: parsedDay && parsedDay >= 1 && parsedDay <= 31 ? parsedDay : null,
      status,
      disputeNotes: get(col.disputeNotes),
      notes: get(col.notes),
    });
  }
  return results;
}

function fmtPence(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `${n.toFixed(2)}p`;
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function sortRows(rows: EnergyAccount[], key: SortKey, dir: SortDir): EnergyAccount[] {
  const numericKeys: SortKey[] = [
    "unitRatePence",
    "standingChargePence",
    "lastReadingValue",
    "paymentDay",
  ];
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (numericKeys.includes(key)) {
      const an = av == null ? Number.NEGATIVE_INFINITY : Number(av);
      const bn = bv == null ? Number.NEGATIVE_INFINITY : Number(bv);
      const cmp = an - bn;
      return dir === "asc" ? cmp : -cmp;
    }
    const cmp = String(av ?? "").localeCompare(String(bv ?? ""), "en-GB", { sensitivity: "base" });
    return dir === "asc" ? cmp : -cmp;
  });
}

const STATUS_BADGE: Record<EnergyStatus, string> = {
  Active: "bg-green-50 text-green-700 ring-green-600/20",
  Closed: "bg-gray-50 text-gray-600 ring-gray-500/10",
  Disputed: "bg-red-50 text-red-700 ring-red-600/20",
};

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
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-xl mx-4 flex flex-col max-h-[90vh]">
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
}: {
  form: EnergyForm;
  setForm: React.Dispatch<React.SetStateAction<EnergyForm>>;
}) {
  const set = (k: keyof EnergyForm) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v as never }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Supplier *"
          value={form.supplier}
          onChange={set("supplier")}
          placeholder="Octopus / British Gas"
        />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Property *
          </label>
          <select
            value={form.propertyCode}
            onChange={(e) =>
              setForm((f) => ({ ...f, propertyCode: e.target.value }))
            }
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30"
          >
            {PROPERTY_CODES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Account Number"
          value={form.accountNumber}
          onChange={set("accountNumber")}
        />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Fuel Type
          </label>
          <select
            value={form.fuelType}
            onChange={(e) =>
              setForm((f) => ({ ...f, fuelType: e.target.value as FuelType }))
            }
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30"
          >
            {FUEL_TYPES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="MPAN" value={form.mpan} onChange={set("mpan")} placeholder="13–21 digits" />
        <Field label="MPRN" value={form.mprn} onChange={set("mprn")} placeholder="6–10 digits" />
      </div>
      <Field
        label="Tariff Name"
        value={form.tariffName}
        onChange={set("tariffName")}
        placeholder="e.g. Octopus Tracker"
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Unit Rate (p/kWh)"
          value={form.unitRatePence}
          onChange={set("unitRatePence")}
          placeholder="28.62"
        />
        <Field
          label="Standing Charge (p/day)"
          value={form.standingChargePence}
          onChange={set("standingChargePence")}
          placeholder="60.10"
        />
      </div>
      <Field
        label="Contract End Date"
        value={form.contractEndDate}
        onChange={set("contractEndDate")}
        type="date"
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Last Reading"
          value={form.lastReadingValue}
          onChange={set("lastReadingValue")}
        />
        <Field
          label="Last Reading Date"
          value={form.lastReadingDate}
          onChange={set("lastReadingDate")}
          type="date"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Payment Method
          </label>
          <select
            value={form.paymentMethod ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, paymentMethod: e.target.value || null }))
            }
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30"
          >
            <option value="">—</option>
            <option>DD</option>
            <option>SO</option>
            <option>TRF</option>
            <option>BACS</option>
            <option>CARD</option>
            <option>CHEQUE</option>
            <option>Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Payment Day
          </label>
          <input
            type="number"
            min="1"
            max="31"
            value={form.paymentDay ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setForm((f) => ({ ...f, paymentDay: v ? parseInt(v, 10) : null }));
            }}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
        <select
          value={form.status}
          onChange={(e) =>
            setForm((f) => ({ ...f, status: e.target.value as EnergyStatus }))
          }
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30"
        >
          {ENERGY_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {form.status === "Disputed" && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Dispute Notes
          </label>
          <textarea
            value={form.disputeNotes}
            onChange={(e) => setForm((f) => ({ ...f, disputeNotes: e.target.value }))}
            rows={2}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30 resize-none"
            placeholder="What's contested, with whom, when…"
          />
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={3}
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30 resize-none"
        />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EnergyPage() {
  const { data: user } = useUser();
  const isAdmin = user?.role === "admin";
  const canEdit = user?.role === "admin" || user?.role === "contributor";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("supplier");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [editing, setEditing] = useState<EnergyAccount | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<EnergyForm>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<EnergyForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const csvRef = useRef<HTMLInputElement>(null);

  const { data: rawRows = [], isLoading, error } = useAccounts(debouncedSearch);
  const sorted = useMemo(
    () => sortRows(rawRows, sortKey, sortDir),
    [rawRows, sortKey, sortDir]
  );

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

  function openEdit(a: EnergyAccount) {
    setEditing(a);
    setEditForm({
      supplier: a.supplier ?? "",
      propertyCode: a.propertyCode ?? "CORP",
      accountNumber: a.accountNumber ?? "",
      fuelType: (a.fuelType as FuelType) ?? "Electricity",
      mpan: a.mpan ?? "",
      mprn: a.mprn ?? "",
      tariffName: a.tariffName ?? "",
      unitRatePence: a.unitRatePence ?? "",
      standingChargePence: a.standingChargePence ?? "",
      contractEndDate: a.contractEndDate ?? "",
      lastReadingValue: a.lastReadingValue ?? "",
      lastReadingDate: a.lastReadingDate ?? "",
      paymentMethod: a.paymentMethod ?? null,
      paymentDay: a.paymentDay ?? null,
      status: (a.status as EnergyStatus) ?? "Active",
      disputeNotes: a.disputeNotes ?? "",
      notes: a.notes ?? "",
    });
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) {
        alert(
          "No valid rows found. Header row must include 'supplier' and 'property_code'."
        );
        return;
      }
      const result = await csvMut.mutateAsync(rows);
      alert(`Imported ${result.inserted} account${result.inserted === 1 ? "" : "s"}.`);
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

  const disputedCount = sorted.filter((a) => a.status === "Disputed").length;
  const activeCount = sorted.filter((a) => a.status === "Active").length;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="relative w-64">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search supplier / property / account…"
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

        <div className="flex gap-4 text-sm text-gray-600">
          <span>
            <strong className="text-gray-900">{sorted.length}</strong> accounts
          </span>
          <span>
            <strong className="text-green-700">{activeCount}</strong> active
          </span>
          {disputedCount > 0 && (
            <span className="flex items-center gap-1 text-red-700">
              <AlertTriangle size={14} />
              <strong>{disputedCount}</strong> disputed
            </span>
          )}
        </div>

        <div className="flex gap-2">
          {canEdit && (
            <>
              <button
                onClick={() => csvRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm rounded hover:bg-gray-50"
              >
                <Upload size={14} />
                Import CSV
              </button>
              <input
                ref={csvRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvFile}
              />
              <button
                onClick={() => {
                  setAddForm(EMPTY_FORM);
                  setShowAdd(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-youco-blue text-white text-sm rounded hover:opacity-90"
              >
                <Plus size={14} />
                Add Account
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-500">{String(error)}</div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {search
              ? "No accounts match your search."
              : "No energy accounts yet. Add one or import a CSV."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th label="Supplier" sortable sk="supplier" />
                <Th label="Property" sortable sk="propertyCode" />
                <Th label="Account No." sortable sk="accountNumber" />
                <Th label="Fuel" sortable sk="fuelType" />
                <Th label="MPAN / MPRN" />
                <Th label="Tariff" sortable sk="tariffName" />
                <Th label="Unit p/kWh" sortable sk="unitRatePence" className="text-right" />
                <Th label="Standing p/day" sortable sk="standingChargePence" className="text-right" />
                <Th label="Contract End" sortable sk="contractEndDate" />
                <Th label="Status" sortable sk="status" />
                {canEdit && <Th label="" className="w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 group">
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                    {a.supplier}
                  </td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap text-xs font-mono">
                    {a.propertyCode}
                  </td>
                  <td className="px-3 py-2 text-gray-600 font-mono text-xs">
                    {a.accountNumber ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{a.fuelType}</td>
                  <td className="px-3 py-2 text-gray-600 font-mono text-[11px]">
                    {a.mpan ? <div>E: {a.mpan}</div> : null}
                    {a.mprn ? <div>G: {a.mprn}</div> : null}
                    {!a.mpan && !a.mprn && "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs">
                    {a.tariffName ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-right tabular-nums text-xs">
                    {fmtPence(a.unitRatePence)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-right tabular-nums text-xs">
                    {fmtPence(a.standingChargePence)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">
                    {fmtDate(a.contractEndDate)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset",
                        STATUS_BADGE[a.status as EnergyStatus]
                      )}
                      title={a.disputeNotes ?? undefined}
                    >
                      {a.status}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(a)}
                          title="Edit"
                          className="p-1 text-gray-400 hover:text-youco-blue rounded"
                        >
                          <Pencil size={13} />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setDeleteId(a.id);
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
        <Modal title="Add Energy Account" onClose={() => setShowAdd(false)}>
          <FormFields form={addForm} setForm={setAddForm} />
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
              disabled={!addForm.supplier.trim() || createMut.isPending}
              onClick={async () => {
                await createMut.mutateAsync(addForm);
                setShowAdd(false);
              }}
              className="px-4 py-1.5 text-sm bg-youco-blue text-white rounded hover:opacity-90 disabled:opacity-50"
            >
              {createMut.isPending ? "Saving…" : "Add Account"}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title="Edit Energy Account" onClose={() => setEditing(null)}>
          <FormFields form={editForm} setForm={setEditForm} />
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
              disabled={!editForm.supplier.trim() || updateMut.isPending}
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
        <Modal title="Delete Energy Account" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-700">
            Are you sure you want to delete this account? This cannot be undone.
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
