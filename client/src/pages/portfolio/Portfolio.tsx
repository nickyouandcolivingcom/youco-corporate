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
import type { PortfolioProperty } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = keyof PortfolioProperty;
type SortDir = "asc" | "desc";

interface PropertyForm {
  address: string;
  postcode: string;
  ownershipEntity: "YCO" | "MONOCROM";
  beneficialSharePct: string;
  purchaseDate: string;
  purchasePrice: string;
  capitalCosts: string;
  currentValueRics: string;
  currentValueLatent: string;
  grossAnnualRent: string;
  lettingUnits: string;
  notes: string;
}

const EMPTY_FORM: PropertyForm = {
  address: "",
  postcode: "",
  ownershipEntity: "YCO",
  beneficialSharePct: "",
  purchaseDate: "",
  purchasePrice: "",
  capitalCosts: "",
  currentValueRics: "",
  currentValueLatent: "",
  grossAnnualRent: "",
  lettingUnits: "",
  notes: "",
};

// ─── API hooks ────────────────────────────────────────────────────────────────

function useProperties(search: string) {
  return useQuery<PortfolioProperty[]>({
    queryKey: ["/api/portfolio", search],
    queryFn: async () => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/portfolio${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load properties");
      return res.json();
    },
  });
}

function useCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: PropertyForm) => {
      const res = await apiRequest("POST", "/api/portfolio", nullify(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create property");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portfolio"] }),
  });
}

function useUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: PropertyForm }) => {
      const res = await apiRequest("PATCH", `/api/portfolio/${id}`, nullify(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update property");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portfolio"] }),
  });
}

function useDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/portfolio/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete property");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portfolio"] }),
  });
}

function useCsvImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: PropertyForm[]) => {
      const res = await apiRequest("POST", "/api/portfolio/csv-import", rows.map(nullify));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to import");
      }
      return res.json() as Promise<{ inserted: number }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portfolio"] }),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nullify(form: PropertyForm) {
  return Object.fromEntries(
    Object.entries(form).map(([k, v]) => {
      if (v === null || v === undefined) return [k, null];
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
  return v.replace(/[£,\s]/g, "").trim();
}

function parseDateLoose(v: string): string {
  const t = v.trim();
  if (!t) return "";
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  // DD-MMM-YYYY (e.g. 9-Oct-2017)
  const m = t.match(/^(\d{1,2})[-\/\s](\w{3,})[-\/\s](\d{4})$/);
  if (m) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const mm = months[m[2].slice(0, 3).toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
  }
  // DD/MM/YYYY
  const m2 = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  return t;
}

function parseCsv(text: string): PropertyForm[] {
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
    address: idx(["address", "full_property_address", "property", "property_address"]),
    postcode: idx(["postcode", "post_code"]),
    ownershipEntity: idx(["ownership_entity", "ownership", "owner", "entity"]),
    beneficialSharePct: idx(["beneficial_share_pct", "share", "beneficial_share", "share_pct"]),
    purchaseDate: idx(["purchase_date", "original_purchase_date", "date"]),
    purchasePrice: idx(["purchase_price", "original_purchase_price", "price"]),
    capitalCosts: idx(["capital_costs", "capex"]),
    currentValueRics: idx(["current_value_rics", "value_rics", "rics_value"]),
    currentValueLatent: idx(["current_value_latent", "value_latent", "latent_value"]),
    grossAnnualRent: idx(["gross_annual_rent", "annual_rent", "gross_yearly_rental_income", "rent"]),
    lettingUnits: idx(["letting_units", "units"]),
    notes: idx(["notes", "note"]),
  };

  const results: PropertyForm[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const address = col.address >= 0 ? (cells[col.address] ?? "").trim() : "";
    if (!address || /^totals?$/i.test(address)) continue;

    const get = (c: number) => (c >= 0 ? (cells[c] ?? "").trim() : "");
    const getMoney = (c: number) => stripMoney(get(c));

    const ownershipRaw = get(col.ownershipEntity).toUpperCase();
    const ownership = ownershipRaw.includes("MONOCROM") ? "MONOCROM" : "YCO";

    // Share comes in as "100.00%" — strip percent
    const shareRaw = get(col.beneficialSharePct).replace(/%/g, "").trim();

    results.push({
      address,
      postcode: get(col.postcode),
      ownershipEntity: ownership,
      beneficialSharePct: shareRaw,
      purchaseDate: parseDateLoose(get(col.purchaseDate)),
      purchasePrice: getMoney(col.purchasePrice),
      capitalCosts: getMoney(col.capitalCosts),
      currentValueRics: getMoney(col.currentValueRics),
      currentValueLatent: getMoney(col.currentValueLatent),
      grossAnnualRent: getMoney(col.grossAnnualRent),
      lettingUnits: get(col.lettingUnits),
      notes: get(col.notes),
    });
  }
  return results;
}

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function fmtMoney(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return gbp.format(n);
}

function fmtPct(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `${n.toFixed(2)}%`;
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function sortRows(rows: PortfolioProperty[], key: SortKey, dir: SortDir): PortfolioProperty[] {
  const numericKeys: SortKey[] = [
    "beneficialSharePct",
    "purchasePrice",
    "capitalCosts",
    "currentValueRics",
    "currentValueLatent",
    "grossAnnualRent",
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

function PropertyFormFields({
  form,
  setForm,
}: {
  form: PropertyForm;
  setForm: React.Dispatch<React.SetStateAction<PropertyForm>>;
}) {
  const set = (k: keyof PropertyForm) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v as never }));
  return (
    <div className="space-y-3">
      <Field
        label="Address *"
        value={form.address}
        onChange={set("address")}
        placeholder="e.g. 16 Richmond Crescent, Chester"
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Postcode"
          value={form.postcode}
          onChange={set("postcode")}
          placeholder="CH3 5PB"
        />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Ownership Entity
          </label>
          <select
            value={form.ownershipEntity}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                ownershipEntity: e.target.value as "YCO" | "MONOCROM",
              }))
            }
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30"
          >
            <option value="YCO">You & Co. Living</option>
            <option value="MONOCROM">Monocrom Limited</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Beneficial Share %"
          value={form.beneficialSharePct}
          onChange={set("beneficialSharePct")}
          placeholder="100.00"
        />
        <Field
          label="Purchase Date"
          value={form.purchaseDate}
          onChange={set("purchaseDate")}
          type="date"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Purchase Price (£)"
          value={form.purchasePrice}
          onChange={set("purchasePrice")}
          placeholder="190000"
        />
        <Field
          label="Capital Costs (£)"
          value={form.capitalCosts}
          onChange={set("capitalCosts")}
          placeholder="77223"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Current Value RICS (£)"
          value={form.currentValueRics}
          onChange={set("currentValueRics")}
          placeholder="414990"
        />
        <Field
          label="Current Value Latent (£)"
          value={form.currentValueLatent}
          onChange={set("currentValueLatent")}
          placeholder="450000"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Gross Annual Rent (£)"
          value={form.grossAnnualRent}
          onChange={set("grossAnnualRent")}
          placeholder="39300"
        />
        <Field
          label="Letting Units"
          value={form.lettingUnits}
          onChange={set("lettingUnits")}
          placeholder="5 ASTs 1 CT Bill"
        />
      </div>
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

export default function PortfolioPage() {
  const { data: user } = useUser();
  const isAdmin = user?.role === "admin";
  const canEdit = user?.role === "admin" || user?.role === "contributor";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("address");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [editing, setEditing] = useState<PortfolioProperty | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<PropertyForm>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<PropertyForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const csvRef = useRef<HTMLInputElement>(null);

  const { data: rawRows = [], isLoading, error } = useProperties(debouncedSearch);
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

  function openEdit(p: PortfolioProperty) {
    setEditing(p);
    setEditForm({
      address: p.address ?? "",
      postcode: p.postcode ?? "",
      ownershipEntity: (p.ownershipEntity as "YCO" | "MONOCROM") ?? "YCO",
      beneficialSharePct: p.beneficialSharePct ?? "",
      purchaseDate: p.purchaseDate ?? "",
      purchasePrice: p.purchasePrice ?? "",
      capitalCosts: p.capitalCosts ?? "",
      currentValueRics: p.currentValueRics ?? "",
      currentValueLatent: p.currentValueLatent ?? "",
      grossAnnualRent: p.grossAnnualRent ?? "",
      lettingUnits: p.lettingUnits ?? "",
      notes: p.notes ?? "",
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
        alert("No valid rows found. Check the CSV has a header row with an 'address' column.");
        return;
      }
      const result = await csvMut.mutateAsync(rows);
      alert(`Imported ${result.inserted} propert${result.inserted === 1 ? "y" : "ies"}.`);
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

  // Totals row
  const totals = useMemo(() => {
    const sum = (k: keyof PortfolioProperty) =>
      sorted.reduce((acc, p) => acc + (Number(p[k] ?? 0) || 0), 0);
    return {
      purchasePrice: sum("purchasePrice"),
      capitalCosts: sum("capitalCosts"),
      currentValueRics: sum("currentValueRics"),
      currentValueLatent: sum("currentValueLatent"),
      grossAnnualRent: sum("grossAnnualRent"),
    };
  }, [sorted]);

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
            placeholder="Search properties…"
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
            <strong className="text-gray-900">{sorted.length}</strong> properties
          </span>
          <span>
            Total RICS:{" "}
            <strong className="text-gray-900">{gbp.format(totals.currentValueRics)}</strong>
          </span>
          <span>
            Total Latent:{" "}
            <strong className="text-gray-900">{gbp.format(totals.currentValueLatent)}</strong>
          </span>
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
                Add Property
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
              ? "No properties match your search."
              : "No properties yet. Add one or import a CSV."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th label="Address" sortable sk="address" />
                <Th label="Postcode" sortable sk="postcode" />
                <Th label="Owner" sortable sk="ownershipEntity" />
                <Th label="Share" sortable sk="beneficialSharePct" className="text-right" />
                <Th label="Purchased" sortable sk="purchaseDate" />
                <Th label="Price" sortable sk="purchasePrice" className="text-right" />
                <Th label="Cap. Costs" sortable sk="capitalCosts" className="text-right" />
                <Th label="RICS Value" sortable sk="currentValueRics" className="text-right" />
                <Th label="Latent Value" sortable sk="currentValueLatent" className="text-right" />
                <Th label="Annual Rent" sortable sk="grossAnnualRent" className="text-right" />
                <Th label="Units" />
                {canEdit && <Th label="" className="w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 group">
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                    {p.address}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap font-mono text-xs">
                    {p.postcode ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">
                    {p.ownershipEntity}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-right tabular-nums text-xs">
                    {fmtPct(p.beneficialSharePct)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">
                    {fmtDate(p.purchaseDate)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-right tabular-nums">
                    {fmtMoney(p.purchasePrice)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-right tabular-nums">
                    {fmtMoney(p.capitalCosts)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-right tabular-nums">
                    {fmtMoney(p.currentValueRics)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-right tabular-nums">
                    {fmtMoney(p.currentValueLatent)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-right tabular-nums">
                    {fmtMoney(p.grossAnnualRent)}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                    {p.lettingUnits ?? "—"}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(p)}
                          title="Edit"
                          className="p-1 text-gray-400 hover:text-youco-blue rounded"
                        >
                          <Pencil size={13} />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setDeleteId(p.id);
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
            {sorted.length > 1 && (
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr className="text-xs font-semibold text-gray-700">
                  <td className="px-3 py-2" colSpan={5}>
                    Totals
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {gbp.format(totals.purchasePrice)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {gbp.format(totals.capitalCosts)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {gbp.format(totals.currentValueRics)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {gbp.format(totals.currentValueLatent)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {gbp.format(totals.grossAnnualRent)}
                  </td>
                  <td className="px-3 py-2" colSpan={canEdit ? 2 : 1} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <Modal title="Add Property" onClose={() => setShowAdd(false)}>
          <PropertyFormFields form={addForm} setForm={setAddForm} />
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
              disabled={!addForm.address.trim() || createMut.isPending}
              onClick={async () => {
                await createMut.mutateAsync(addForm);
                setShowAdd(false);
              }}
              className="px-4 py-1.5 text-sm bg-youco-blue text-white rounded hover:opacity-90 disabled:opacity-50"
            >
              {createMut.isPending ? "Saving…" : "Add Property"}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title="Edit Property" onClose={() => setEditing(null)}>
          <PropertyFormFields form={editForm} setForm={setEditForm} />
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
              disabled={!editForm.address.trim() || updateMut.isPending}
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
        <Modal title="Delete Property" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-700">
            Are you sure you want to delete{" "}
            <strong>{sorted.find((p) => p.id === deleteId)?.address}</strong>? This cannot be
            undone.
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
