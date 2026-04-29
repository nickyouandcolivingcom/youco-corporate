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
import type { WaterInvoice } from "@shared/schema";
import { PROPERTY_CODES, PROPERTY_CODE_VALUES } from "@shared/property-codes";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type SortKey = keyof WaterInvoice;
type SortDir = "asc" | "desc";

interface InvoiceForm {
  propertyCode: string;
  supplier: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  freshWaterAmount: string;
  wastewaterAmount: string;
  standingChargeAmount: string;
  invoiceNumber: string;
  issueDate: string;
  notes: string;
}

const EMPTY_FORM: InvoiceForm = {
  propertyCode: "16RC",
  supplier: "Severn Trent",
  periodStart: "",
  periodEnd: "",
  amount: "",
  freshWaterAmount: "",
  wastewaterAmount: "",
  standingChargeAmount: "",
  invoiceNumber: "",
  issueDate: "",
  notes: "",
};

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtMoney(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : gbp.format(n);
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function payload(form: InvoiceForm) {
  const t = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    propertyCode: form.propertyCode,
    supplier: form.supplier.trim(),
    periodStart: form.periodStart,
    periodEnd: form.periodEnd,
    amount: form.amount,
    freshWaterAmount: t(form.freshWaterAmount),
    wastewaterAmount: t(form.wastewaterAmount),
    standingChargeAmount: t(form.standingChargeAmount),
    invoiceNumber: t(form.invoiceNumber),
    issueDate: t(form.issueDate),
    notes: t(form.notes),
  };
}

function useInvoices(params: { search: string; propertyCode: string; supplier: string }) {
  return useQuery<WaterInvoice[]>({
    queryKey: ["/api/water-invoices", params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.search) qs.set("search", params.search);
      if (params.propertyCode) qs.set("propertyCode", params.propertyCode);
      if (params.supplier) qs.set("supplier", params.supplier);
      const res = await fetch(
        `/api/water-invoices${qs.toString() ? `?${qs}` : ""}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load invoices");
      return res.json();
    },
  });
}

function useCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: InvoiceForm) => {
      const res = await apiRequest("POST", "/api/water-invoices", payload(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/water-invoices"] }),
  });
}

function useUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: InvoiceForm }) => {
      const res = await apiRequest("PATCH", `/api/water-invoices/${id}`, payload(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/water-invoices"] }),
  });
}

function useDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/water-invoices/${id}`);
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/water-invoices"] }),
  });
}

interface BulkRow {
  propertyCode: string;
  supplier: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  freshWaterAmount?: string | null;
  wastewaterAmount?: string | null;
  standingChargeAmount?: string | null;
  invoiceNumber?: string | null;
  issueDate?: string | null;
  notes?: string | null;
}

interface BulkResult {
  received: number;
  inserted: number;
  skippedDuplicates: number;
  duplicates: Array<{ row: number; key: string }>;
  gaps: Array<{ propertyCode: string; supplier: string; missingYear: string }>;
}

interface PdfFileResult {
  file: string;
  supplier?: string;
  accountNumber?: string;
  propertyCode?: string;
  status: "ok" | "error" | "no_parser";
  row?: BulkRow;
  error?: string;
}

interface PdfResponse {
  received: number;
  parsed: number;
  failed: number;
  results: PdfFileResult[];
  rows: BulkRow[];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const comma = dataUrl.indexOf(",");
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function useBulkImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: BulkRow[]) => {
      const res = await apiRequest("POST", "/api/water-invoices/bulk-import", { rows });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Bulk import failed");
      }
      return res.json() as Promise<BulkResult>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/water-invoices"] }),
  });
}

function usePdfImport() {
  return useMutation({
    mutationFn: async (files: File[]) => {
      const payload = await Promise.all(
        files.map(async (f) => ({ name: f.name, base64: await fileToBase64(f) }))
      );
      const res = await apiRequest("POST", "/api/water-invoices/import-pdfs", { files: payload });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "PDF import failed");
      }
      return res.json() as Promise<PdfResponse>;
    },
  });
}

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
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
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

function FormFields({
  form,
  setForm,
}: {
  form: InvoiceForm;
  setForm: React.Dispatch<React.SetStateAction<InvoiceForm>>;
}) {
  const set = (k: keyof InvoiceForm) => (v: string) => setForm((f) => ({ ...f, [k]: v as never }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Property *</label>
          <select
            value={form.propertyCode}
            onChange={(e) => set("propertyCode")(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            {PROPERTY_CODES.map((p) => (
              <option key={p.code} value={p.code}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
          <input
            value={form.supplier}
            onChange={(e) => set("supplier")(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Period Start *</label>
          <input type="date" value={form.periodStart} onChange={(e) => set("periodStart")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Period End *</label>
          <input type="date" value={form.periodEnd} onChange={(e) => set("periodEnd")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Total £ *</label>
          <input value={form.amount} onChange={(e) => set("amount")(e.target.value)} placeholder="1271.69" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fresh £</label>
          <input value={form.freshWaterAmount} onChange={(e) => set("freshWaterAmount")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Waste £</label>
          <input value={form.wastewaterAmount} onChange={(e) => set("wastewaterAmount")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Standing £</label>
          <input value={form.standingChargeAmount} onChange={(e) => set("standingChargeAmount")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Issue Date</label>
          <input type="date" value={form.issueDate} onChange={(e) => set("issueDate")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Number</label>
        <input value={form.invoiceNumber} onChange={(e) => set("invoiceNumber")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm resize-none" />
      </div>
    </div>
  );
}

export default function WaterInvoicesPage() {
  const { data: user } = useUser();
  const isAdmin = user?.role === "admin";
  const canEdit = user?.role === "admin" || user?.role === "contributor";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filterProperty, setFilterProperty] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("periodStart");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [editing, setEditing] = useState<WaterInvoice | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<InvoiceForm>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<InvoiceForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: rows = [], isLoading, error } = useInvoices({
    search: debouncedSearch,
    propertyCode: filterProperty,
    supplier: filterSupplier,
  });

  const sorted = useMemo(() => {
    const numericKeys: SortKey[] = ["amount", "freshWaterAmount", "wastewaterAmount", "standingChargeAmount"];
    const dateKeys: SortKey[] = ["periodStart", "periodEnd", "issueDate"];
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (numericKeys.includes(sortKey)) {
        const an = av == null ? -Infinity : Number(av);
        const bn = bv == null ? -Infinity : Number(bv);
        const cmp = an - bn;
        return sortDir === "asc" ? cmp : -cmp;
      }
      if (dateKeys.includes(sortKey)) {
        const at = av ? new Date(String(av)).getTime() : 0;
        const bt = bv ? new Date(String(bv)).getTime() : 0;
        return sortDir === "asc" ? at - bt : bt - at;
      }
      const cmp = String(av ?? "").localeCompare(String(bv ?? ""), "en-GB", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const totals = useMemo(() => {
    const amt = sorted.reduce((a, r) => a + Number(r.amount ?? 0), 0);
    const fresh = sorted.reduce((a, r) => a + (r.freshWaterAmount != null ? Number(r.freshWaterAmount) : 0), 0);
    const waste = sorted.reduce((a, r) => a + (r.wastewaterAmount != null ? Number(r.wastewaterAmount) : 0), 0);
    return { amount: amt, fresh, waste };
  }, [sorted]);

  const createMut = useCreate();
  const updateMut = useUpdate();
  const deleteMut = useDelete();

  function handleSearchChange(v: string) {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(v), 300);
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function openEdit(inv: WaterInvoice) {
    setEditing(inv);
    setEditForm({
      propertyCode: inv.propertyCode,
      supplier: inv.supplier,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      amount: inv.amount,
      freshWaterAmount: inv.freshWaterAmount ?? "",
      wastewaterAmount: inv.wastewaterAmount ?? "",
      standingChargeAmount: inv.standingChargeAmount ?? "",
      invoiceNumber: inv.invoiceNumber ?? "",
      issueDate: inv.issueDate ?? "",
      notes: inv.notes ?? "",
    });
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
          {active && (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search…"
              className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30"
            />
            {search && (
              <button onClick={() => handleSearchChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
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
              <option key={p.code} value={p.code}>{p.code}</option>
            ))}
          </select>
          <select
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="">All suppliers</option>
            <option>Severn Trent</option>
            <option>Welsh Water</option>
          </select>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <PdfImportButton />
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

      <div className="flex gap-4 text-sm text-gray-600">
        <span>
          <strong className="text-gray-900">{sorted.length}</strong> invoice
          {sorted.length === 1 ? "" : "s"}
        </span>
        <span>
          Total: <strong className="text-gray-900">{gbp.format(totals.amount)}</strong>
        </span>
        {totals.fresh > 0 && (
          <span>
            Fresh: <strong className="text-gray-900">{gbp.format(totals.fresh)}</strong>
          </span>
        )}
        {totals.waste > 0 && (
          <span>
            Waste: <strong className="text-gray-900">{gbp.format(totals.waste)}</strong>
          </span>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-500">{String(error)}</div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No water invoices yet. Use <strong>Bulk Import (PDF)</strong> to upload Severn Trent annual bills.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th label="Period" sortable sk="periodStart" />
                <Th label="Property" sortable sk="propertyCode" />
                <Th label="Supplier" sortable sk="supplier" />
                <Th label="Total £" sortable sk="amount" className="text-right" />
                <Th label="Fresh £" sortable sk="freshWaterAmount" className="text-right" />
                <Th label="Waste £" sortable sk="wastewaterAmount" className="text-right" />
                <Th label="Issued" sortable sk="issueDate" />
                {canEdit && <Th label="" className="w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50 group" title={inv.notes ?? undefined}>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {fmtDate(inv.periodStart)} → {fmtDate(inv.periodEnd)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{inv.propertyCode}</td>
                  <td className="px-3 py-2 text-xs">{inv.supplier}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {fmtMoney(inv.amount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">{fmtMoney(inv.freshWaterAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">{fmtMoney(inv.wastewaterAmount)}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(inv.issueDate)}</td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(inv)} title="Edit" className="p-1 text-gray-400 hover:text-youco-blue rounded">
                          <Pencil size={13} />
                        </button>
                        {isAdmin && (
                          <button onClick={() => setDeleteId(inv.id)} title="Delete" className="p-1 text-gray-400 hover:text-red-500 rounded">
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

      {showAdd && (
        <Modal title="Add Water Invoice" onClose={() => setShowAdd(false)}>
          <FormFields form={addForm} setForm={setAddForm} />
          {createMut.error && <p className="mt-3 text-sm text-red-500">{createMut.error.message}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
            <button
              disabled={!addForm.amount || !addForm.periodStart || !addForm.periodEnd || createMut.isPending}
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

      {editing && (
        <Modal title="Edit Water Invoice" onClose={() => setEditing(null)}>
          <FormFields form={editForm} setForm={setEditForm} />
          {updateMut.error && <p className="mt-3 text-sm text-red-500">{updateMut.error.message}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
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

      {deleteId !== null && (
        <Modal title="Delete Water Invoice" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-700">Delete this invoice? This cannot be undone.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setDeleteId(null)} className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
            <button
              disabled={deleteMut.isPending}
              onClick={async () => {
                await deleteMut.mutateAsync(deleteId);
                setDeleteId(null);
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

function PdfImportButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const parseMut = usePdfImport();
  const importMut = useBulkImport();
  const [imported, setImported] = useState(false);

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setImported(false);
    parseMut.mutate(files);
    setOpen(true);
    e.target.value = "";
  }

  async function handleImport() {
    if (!parseMut.data) return;
    await importMut.mutateAsync(parseMut.data.rows);
    setImported(true);
  }

  function reset() {
    setOpen(false);
    parseMut.reset();
    importMut.reset();
    setImported(false);
  }

  return (
    <>
      <button
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-purple-300 text-purple-700 text-sm rounded hover:bg-purple-50"
        title="Bulk import multiple PDF water bills (Severn Trent supported)"
      >
        <Upload size={14} />
        Bulk Import (PDF)
      </button>
      <input ref={fileRef} type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={handleFiles} />

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={reset} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Water PDF Import — review</h2>
              <button onClick={reset} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3 text-sm">
              {parseMut.isPending && <p className="text-gray-700">Parsing PDFs…</p>}
              {parseMut.error && <p className="text-red-600">{parseMut.error.message}</p>}
              {parseMut.data && (
                <>
                  <p className="text-gray-700">
                    Parsed <strong>{parseMut.data.parsed}</strong> / {parseMut.data.received} PDFs.
                    {parseMut.data.failed > 0 && (
                      <span className="text-red-600">
                        {" "}
                        {parseMut.data.failed} failed.
                      </span>
                    )}
                  </p>
                  <table className="w-full text-xs border border-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-2 py-1">File</th>
                        <th className="text-left px-2 py-1">Property</th>
                        <th className="text-left px-2 py-1">Period</th>
                        <th className="text-right px-2 py-1">Total</th>
                        <th className="text-left px-2 py-1">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parseMut.data.results.map((r, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1 font-mono truncate max-w-[200px]" title={r.file}>{r.file}</td>
                          <td className="px-2 py-1 font-mono">{r.propertyCode ?? "—"}</td>
                          <td className="px-2 py-1">
                            {r.row ? `${r.row.periodStart} → ${r.row.periodEnd}` : "—"}
                          </td>
                          <td className="px-2 py-1 text-right">
                            {r.row ? `£${r.row.amount}` : "—"}
                          </td>
                          <td className="px-2 py-1">
                            {r.status === "ok" ? (
                              <span className="text-emerald-600">OK</span>
                            ) : (
                              <span className="text-red-600" title={r.error}>{r.status === "no_parser" ? "no parser" : "error"}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parseMut.data.results.some((r) => r.status !== "ok") && (
                    <details className="border border-red-200 rounded p-3 bg-red-50">
                      <summary className="cursor-pointer text-xs text-red-700">
                        Errors ({parseMut.data.results.filter((r) => r.status !== "ok").length})
                      </summary>
                      <ul className="mt-2 text-xs text-red-700 space-y-0.5">
                        {parseMut.data.results.filter((r) => r.status !== "ok").map((r, i) => (
                          <li key={i}>
                            <code>{r.file}</code>: {r.error}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}

              {importMut.error && <p className="text-red-600">{importMut.error.message}</p>}
              {importMut.data && (
                <div className="border border-gray-200 rounded p-3 space-y-2 bg-gray-50">
                  <p className="text-gray-700">
                    Imported <strong>{importMut.data.inserted}</strong> / {importMut.data.received} rows.
                    {importMut.data.skippedDuplicates > 0 && (
                      <span className="text-amber-700"> {importMut.data.skippedDuplicates} duplicates skipped.</span>
                    )}
                  </p>
                  {importMut.data.gaps.length > 0 ? (
                    <details open>
                      <summary className="cursor-pointer text-xs text-amber-700 font-semibold">
                        Missing years ({importMut.data.gaps.length})
                      </summary>
                      <ul className="mt-1 text-xs text-gray-700 space-y-0.5">
                        {importMut.data.gaps.map((g, i) => (
                          <li key={i}>
                            <code>{g.propertyCode}</code> / {g.supplier} — <strong>{g.missingYear}</strong>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <p className="text-xs text-emerald-700">No gaps in annual coverage.</p>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button onClick={reset} className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
                {imported ? "Close" : "Cancel"}
              </button>
              {parseMut.data && parseMut.data.rows.length > 0 && !imported && (
                <button
                  disabled={importMut.isPending}
                  onClick={handleImport}
                  className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded hover:opacity-90 disabled:opacity-50"
                >
                  {importMut.isPending ? "Importing…" : `Import ${parseMut.data.rows.length} rows`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
