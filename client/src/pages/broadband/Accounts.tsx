import { useRef, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import type { BroadbandAccount } from "@shared/schema";
import { ENERGY_STATUSES } from "@shared/schema";
import { PROPERTY_CODES } from "@shared/property-codes";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type SortKey = keyof BroadbandAccount;
type SortDir = "asc" | "desc";

const SUPPLIERS = ["Landlord Broadband", "BT", "Virgin Media", "Sky", "Other"];
const CONNECTION_TYPES = [
  "FTTP (Full Fibre)",
  "FTTC (Fibre to Cabinet)",
  "Cable (Virgin)",
  "ADSL",
  "5G / FWA",
  "Other",
];

interface AccountForm {
  supplier: string;
  propertyCode: string;
  accountNumber: string;
  loginEmail: string;
  connectionType: string;
  downloadMbps: string;
  uploadMbps: string;
  contractStart: string;
  contractEnd: string;
  monthlyCost: string;
  nextPriceIncreaseDate: string;
  nextPriceIncreaseAmount: string;
  latestInvoiceDate: string;
  latestInvoiceAmount: string;
  tenantPaid: boolean;
  status: (typeof ENERGY_STATUSES)[number];
  notes: string;
}

const EMPTY_FORM: AccountForm = {
  supplier: "BT",
  propertyCode: "16RC",
  accountNumber: "",
  loginEmail: "",
  connectionType: "",
  downloadMbps: "",
  uploadMbps: "",
  contractStart: "",
  contractEnd: "",
  monthlyCost: "",
  nextPriceIncreaseDate: "",
  nextPriceIncreaseAmount: "",
  latestInvoiceDate: "",
  latestInvoiceAmount: "",
  tenantPaid: false,
  status: "Active",
  notes: "",
};

function useAccounts(search: string) {
  return useQuery<BroadbandAccount[]>({
    queryKey: ["/api/broadband", search],
    queryFn: async () => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/broadband${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load broadband accounts");
      return res.json();
    },
  });
}

function payload(form: AccountForm) {
  const out: Record<string, unknown> = { tenantPaid: form.tenantPaid };
  for (const [k, v] of Object.entries(form)) {
    if (k === "tenantPaid") continue;
    const s = String(v).trim();
    out[k] = s === "" ? null : s;
  }
  // Numeric int fields
  for (const k of ["downloadMbps", "uploadMbps"] as const) {
    if (out[k] != null) {
      const n = parseInt(String(out[k]), 10);
      out[k] = isNaN(n) ? null : n;
    }
  }
  return out;
}

function useCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: AccountForm) => {
      const res = await apiRequest("POST", "/api/broadband", payload(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create account");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/broadband"] }),
  });
}

function useUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: AccountForm }) => {
      const res = await apiRequest("PATCH", `/api/broadband/${id}`, payload(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/broadband"] }),
  });
}

function useDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/broadband/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/broadband"] }),
  });
}

function useSeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/broadband/seed", {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to seed");
      }
      return res.json() as Promise<{
        seeds: number;
        inserted: number;
        refreshed: number;
        unchanged: number;
      }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/broadband"] }),
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
  form: AccountForm;
  setForm: React.Dispatch<React.SetStateAction<AccountForm>>;
}) {
  const set = <K extends keyof AccountForm>(k: K, v: AccountForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const inputCls = "w-full border border-gray-300 rounded px-3 py-1.5 text-sm";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Supplier *</label>
          <select value={form.supplier} onChange={(e) => set("supplier", e.target.value)} className={inputCls}>
            {SUPPLIERS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Property *</label>
          <select value={form.propertyCode} onChange={(e) => set("propertyCode", e.target.value)} className={inputCls}>
            {PROPERTY_CODES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Account Number</label>
          <input value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} className={cn(inputCls, "font-mono")} />
        </div>
        <div>
          <label className={labelCls}>Login Email</label>
          <input value={form.loginEmail} onChange={(e) => set("loginEmail", e.target.value)} placeholder="account@…" className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Connection Type</label>
          <select value={form.connectionType} onChange={(e) => set("connectionType", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {CONNECTION_TYPES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Download (Mbps)</label>
          <input value={form.downloadMbps} onChange={(e) => set("downloadMbps", e.target.value)} placeholder="900" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Upload (Mbps)</label>
          <input value={form.uploadMbps} onChange={(e) => set("uploadMbps", e.target.value)} placeholder="110" className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Contract Start</label>
          <input type="date" value={form.contractStart} onChange={(e) => set("contractStart", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Contract End</label>
          <input type="date" value={form.contractEnd} onChange={(e) => set("contractEnd", e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Monthly Cost (£)</label>
          <input value={form.monthlyCost} onChange={(e) => set("monthlyCost", e.target.value)} placeholder="40.00" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Next Increase Date</label>
          <input type="date" value={form.nextPriceIncreaseDate} onChange={(e) => set("nextPriceIncreaseDate", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Increase Amount (£)</label>
          <input value={form.nextPriceIncreaseAmount} onChange={(e) => set("nextPriceIncreaseAmount", e.target.value)} placeholder="5.00" className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Latest Invoice Date</label>
          <input type="date" value={form.latestInvoiceDate} onChange={(e) => set("latestInvoiceDate", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Latest Invoice Amount (£)</label>
          <input value={form.latestInvoiceAmount} onChange={(e) => set("latestInvoiceAmount", e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Status</label>
          <select value={form.status} onChange={(e) => set("status", e.target.value as AccountForm["status"])} className={inputCls}>
            {ENERGY_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-end pb-1">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.tenantPaid} onChange={(e) => set("tenantPaid", e.target.checked)} />
            Tenant-paid (excluded from spend)
          </label>
        </div>
      </div>
      <div>
        <label className={labelCls}>Notes</label>
        <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={cn(inputCls, "resize-none")} />
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  Active: "bg-green-50 text-green-700 ring-green-600/20",
  Closed: "bg-gray-50 text-gray-600 ring-gray-500/10",
  Disputed: "bg-red-50 text-red-700 ring-red-600/20",
};

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  return `£${Number(v).toFixed(2)}`;
}

function fmtSpeed(d: number | null, u: number | null): string {
  if (d == null && u == null) return "—";
  return `${d ?? "?"} ↓ / ${u ?? "?"} ↑`;
}

function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const dt = new Date(d).getTime();
  if (isNaN(dt)) return null;
  return Math.floor((dt - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function BroadbandAccountsPage() {
  const { data: user } = useUser();
  const isAdmin = user?.role === "admin";
  const canEdit = user?.role === "admin" || user?.role === "contributor";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("propertyCode");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [editing, setEditing] = useState<BroadbandAccount | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<AccountForm>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<AccountForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: rows = [], isLoading, error } = useAccounts(debouncedSearch);
  const sorted = useMemo(() => {
    const numericKeys: SortKey[] = ["downloadMbps", "uploadMbps", "monthlyCost", "latestInvoiceAmount"];
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (numericKeys.includes(sortKey)) {
        const an = av == null ? -Infinity : Number(av);
        const bn = bv == null ? -Infinity : Number(bv);
        const cmp = an - bn;
        return sortDir === "asc" ? cmp : -cmp;
      }
      const cmp = String(av ?? "").localeCompare(String(bv ?? ""), "en-GB", {
        sensitivity: "base",
      });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const totalMonthly = useMemo(
    () =>
      rows
        .filter((r) => !r.tenantPaid && r.monthlyCost != null)
        .reduce((s, r) => s + Number(r.monthlyCost ?? 0), 0),
    [rows]
  );

  const createMut = useCreate();
  const updateMut = useUpdate();
  const deleteMut = useDelete();
  const seedMut = useSeed();

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

  function openEdit(a: BroadbandAccount) {
    setEditing(a);
    setEditForm({
      supplier: a.supplier,
      propertyCode: a.propertyCode,
      accountNumber: a.accountNumber ?? "",
      loginEmail: a.loginEmail ?? "",
      connectionType: a.connectionType ?? "",
      downloadMbps: a.downloadMbps?.toString() ?? "",
      uploadMbps: a.uploadMbps?.toString() ?? "",
      contractStart: a.contractStart ?? "",
      contractEnd: a.contractEnd ?? "",
      monthlyCost: a.monthlyCost ?? "",
      nextPriceIncreaseDate: a.nextPriceIncreaseDate ?? "",
      nextPriceIncreaseAmount: a.nextPriceIncreaseAmount ?? "",
      latestInvoiceDate: a.latestInvoiceDate ?? "",
      latestInvoiceAmount: a.latestInvoiceAmount ?? "",
      tenantPaid: a.tenantPaid,
      status: (a.status as AccountForm["status"]) ?? "Active",
      notes: a.notes ?? "",
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
        <div className="relative w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search accounts…"
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
        <div className="text-sm text-gray-600 flex items-center gap-4">
          <span><strong className="text-gray-900">{sorted.length}</strong> circuits</span>
          <span>Landlord-paid total <strong className="text-gray-900">£{totalMonthly.toFixed(2)}</strong>/mo</span>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => seedMut.mutate()}
              disabled={seedMut.isPending}
              title="Insert missing circuits and fill in any blank fields with known contract data"
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              {seedMut.isPending
                ? "Seeding…"
                : rows.length === 0
                ? "Seed 11 Circuits"
                : "Refresh from Seed"}
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => {
                setAddForm(EMPTY_FORM);
                setShowAdd(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-youco-blue text-white text-sm rounded hover:opacity-90"
            >
              <Plus size={14} />
              Add Circuit
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-500">{String(error)}</div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No broadband circuits yet. {isAdmin && "Click \"Seed 11 Circuits\" to import the known mapping with contract data."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th label="Property" sortable sk="propertyCode" />
                <Th label="Supplier" sortable sk="supplier" />
                <Th label="Account No." sortable sk="accountNumber" />
                <Th label="Login" />
                <Th label="Connection" sortable sk="connectionType" />
                <Th label="Speed (↓/↑ Mbps)" />
                <Th label="Contract Ends" sortable sk="contractEnd" />
                <Th label="Monthly" sortable sk="monthlyCost" className="text-right" />
                <Th label="Next ↑" />
                <Th label="Status" sortable sk="status" />
                {canEdit && <Th label="" className="w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((a) => {
                const days = daysUntil(a.contractEnd);
                const expiringSoon = days != null && days >= 0 && days <= 60;
                const expired = days != null && days < 0;
                return (
                  <tr key={a.id} className="hover:bg-gray-50 group">
                    <td className="px-3 py-2 font-mono text-xs">{a.propertyCode}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                      {a.supplier}
                      {a.tenantPaid && (
                        <span className="ml-1.5 text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded ring-1 ring-amber-600/20">
                          tenant
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{a.accountNumber ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 truncate max-w-[180px]" title={a.loginEmail ?? undefined}>
                      {a.loginEmail ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">{a.connectionType ?? "—"}</td>
                    <td className="px-3 py-2 text-xs tabular-nums">{fmtSpeed(a.downloadMbps, a.uploadMbps)}</td>
                    <td className={cn("px-3 py-2 text-xs whitespace-nowrap", expiringSoon && "text-amber-700 font-medium", expired && "text-red-600 font-medium")}>
                      {fmtDate(a.contractEnd)}
                      {expiringSoon && <AlertTriangle size={11} className="inline ml-1" />}
                      {days != null && days >= 0 && days <= 365 && (
                        <span className="ml-1 text-gray-400">({days}d)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{fmtMoney(a.monthlyCost)}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {a.nextPriceIncreaseAmount && a.nextPriceIncreaseDate ? (
                        <span title={fmtDate(a.nextPriceIncreaseDate)}>
                          +{fmtMoney(a.nextPriceIncreaseAmount)} <span className="text-gray-400">{fmtDate(a.nextPriceIncreaseDate)}</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset",
                          STATUS_BADGE[a.status] ?? STATUS_BADGE.Active
                        )}
                      >
                        {a.status}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(a)} title="Edit" className="p-1 text-gray-400 hover:text-youco-blue rounded">
                            <Pencil size={13} />
                          </button>
                          {isAdmin && (
                            <button onClick={() => setDeleteId(a.id)} title="Delete" className="p-1 text-gray-400 hover:text-red-500 rounded">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <Modal title="Add Broadband Circuit" onClose={() => setShowAdd(false)}>
          <FormFields form={addForm} setForm={setAddForm} />
          {createMut.error && <p className="mt-3 text-sm text-red-500">{createMut.error.message}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
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
              {createMut.isPending ? "Saving…" : "Add Circuit"}
            </button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Broadband Circuit" onClose={() => setEditing(null)}>
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
        <Modal title="Delete Circuit" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-700">Delete this broadband circuit? This cannot be undone.</p>
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
