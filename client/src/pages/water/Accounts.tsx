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
} from "lucide-react";
import type { WaterAccount } from "@shared/schema";
import { ENERGY_STATUSES } from "@shared/schema";
import { PROPERTY_CODES, PROPERTY_CODE_VALUES } from "@shared/property-codes";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type SortKey = keyof WaterAccount;
type SortDir = "asc" | "desc";

interface AccountForm {
  supplier: string;
  propertyCode: string;
  accountNumber: string;
  supplyAddress: string;
  rateableValue: string;
  billingFrequency: string;
  status: (typeof ENERGY_STATUSES)[number];
  notes: string;
}

const EMPTY_FORM: AccountForm = {
  supplier: "Severn Trent",
  propertyCode: "16RC",
  accountNumber: "",
  supplyAddress: "",
  rateableValue: "",
  billingFrequency: "Annual",
  status: "Active",
  notes: "",
};

function useAccounts(search: string) {
  return useQuery<WaterAccount[]>({
    queryKey: ["/api/water", search],
    queryFn: async () => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/water${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load water accounts");
      return res.json();
    },
  });
}

function nullify(form: AccountForm) {
  return Object.fromEntries(
    Object.entries(form).map(([k, v]) => [
      k,
      String(v).trim() === "" ? null : String(v).trim(),
    ])
  );
}

function useCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: AccountForm) => {
      const res = await apiRequest("POST", "/api/water", nullify(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create account");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/water"] }),
  });
}

function useUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: AccountForm }) => {
      const res = await apiRequest("PATCH", `/api/water/${id}`, nullify(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/water"] }),
  });
}

function useDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/water/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/water"] }),
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

function FormFields({
  form,
  setForm,
}: {
  form: AccountForm;
  setForm: React.Dispatch<React.SetStateAction<AccountForm>>;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
          <input
            value={form.supplier}
            onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Property *</label>
          <select
            value={form.propertyCode}
            onChange={(e) => setForm((f) => ({ ...f, propertyCode: e.target.value }))}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            {PROPERTY_CODES.map((p) => (
              <option key={p.code} value={p.code}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Account Number</label>
        <input
          value={form.accountNumber}
          onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
          placeholder="9260113256 or A-D43B6E23"
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Supply Address</label>
        <input
          value={form.supplyAddress}
          onChange={(e) => setForm((f) => ({ ...f, supplyAddress: e.target.value }))}
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Rateable Value</label>
          <input
            value={form.rateableValue}
            onChange={(e) => setForm((f) => ({ ...f, rateableValue: e.target.value }))}
            placeholder="239.00"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Billing Frequency</label>
          <select
            value={form.billingFrequency}
            onChange={(e) => setForm((f) => ({ ...f, billingFrequency: e.target.value }))}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            <option>Annual</option>
            <option>Quarterly</option>
            <option>Monthly</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
        <select
          value={form.status}
          onChange={(e) =>
            setForm((f) => ({ ...f, status: e.target.value as typeof form.status }))
          }
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
        >
          {ENERGY_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm resize-none"
        />
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  Active: "bg-green-50 text-green-700 ring-green-600/20",
  Closed: "bg-gray-50 text-gray-600 ring-gray-500/10",
  Disputed: "bg-red-50 text-red-700 ring-red-600/20",
};

export default function WaterAccountsPage() {
  const { data: user } = useUser();
  const isAdmin = user?.role === "admin";
  const canEdit = user?.role === "admin" || user?.role === "contributor";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("propertyCode");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [editing, setEditing] = useState<WaterAccount | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<AccountForm>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<AccountForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: rows = [], isLoading, error } = useAccounts(debouncedSearch);
  const sorted = useMemo(() => {
    const numericKeys: SortKey[] = ["rateableValue"];
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

  function openEdit(a: WaterAccount) {
    setEditing(a);
    setEditForm({
      supplier: a.supplier,
      propertyCode: a.propertyCode,
      accountNumber: a.accountNumber ?? "",
      supplyAddress: a.supplyAddress ?? "",
      rateableValue: a.rateableValue ?? "",
      billingFrequency: a.billingFrequency,
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
        <span className="text-sm text-gray-600">
          <strong className="text-gray-900">{sorted.length}</strong> accounts
        </span>
        {canEdit && (
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
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-500">{String(error)}</div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No water accounts yet. Add Severn Trent supplies for each property.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th label="Supplier" sortable sk="supplier" />
                <Th label="Property" sortable sk="propertyCode" />
                <Th label="Account No." sortable sk="accountNumber" />
                <Th label="Supply Address" />
                <Th label="Rateable Value" sortable sk="rateableValue" className="text-right" />
                <Th label="Frequency" sortable sk="billingFrequency" />
                <Th label="Status" sortable sk="status" />
                {canEdit && <Th label="" className="w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 group">
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{a.supplier}</td>
                  <td className="px-3 py-2 font-mono text-xs">{a.propertyCode}</td>
                  <td className="px-3 py-2 font-mono text-xs">{a.accountNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs truncate max-w-[200px]" title={a.supplyAddress ?? undefined}>
                    {a.supplyAddress ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                    {a.rateableValue != null ? `£${Number(a.rateableValue).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{a.billingFrequency}</td>
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
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <Modal title="Add Water Account" onClose={() => setShowAdd(false)}>
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
              {createMut.isPending ? "Saving…" : "Add Account"}
            </button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Water Account" onClose={() => setEditing(null)}>
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
        <Modal title="Delete Water Account" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-700">Delete this account? This cannot be undone.</p>
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
