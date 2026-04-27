import { useRef, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Pencil,
  Mail,
  Upload,
  ExternalLink,
  Search,
  X,
  Check,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import Papa from "papaparse";
import type { Supplier } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = keyof Supplier;
type SortDir = "asc" | "desc";

interface SupplierForm {
  name: string;
  property: string;
  accountNumber: string;
  addressPostcode: string;
  contactPhone: string;
  email: string;
  youcoContact: string;
  hyperlink: string;
  notes: string;
}

const EMPTY_FORM: SupplierForm = {
  name: "",
  property: "ALL",
  accountNumber: "",
  addressPostcode: "",
  contactPhone: "",
  email: "",
  youcoContact: "",
  hyperlink: "",
  notes: "",
};

const EMAIL_TEMPLATE_SUBJECT = "Updated Correspondence Address — You & Co. Living Limited";
const EMAIL_TEMPLATE_BODY = `Dear Sir / Madam,

We are writing to advise you that our registered correspondence address has changed with immediate effect.

Our new address is:

  You & Co. Living Limited
  66 Paul Street
  London
  EC2A 4NA

Please update your records accordingly. All other contact details remain unchanged.

If you have any queries regarding this change, please do not hesitate to contact us.

Kind regards,
You & Co. Living Limited`;

// ─── API hooks ────────────────────────────────────────────────────────────────

function useSuppliers(search: string) {
  return useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", search],
    queryFn: async () => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/suppliers${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load suppliers");
      return res.json();
    },
  });
}

function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: SupplierForm) => {
      const res = await apiRequest("POST", "/api/suppliers", nullify(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create supplier");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/suppliers"] }),
  });
}

function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: SupplierForm }) => {
      const res = await apiRequest("PATCH", `/api/suppliers/${id}`, nullify(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update supplier");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/suppliers"] }),
  });
}

function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/suppliers/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete supplier");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/suppliers"] }),
  });
}

function useSendEmail() {
  return useMutation({
    mutationFn: async (payload: { to: string[]; subject: string; body: string }) => {
      const res = await apiRequest("POST", "/api/suppliers/email", payload);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to send email");
      }
      return res.json() as Promise<{ sent: number }>;
    },
  });
}

function useCsvImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: SupplierForm[]) => {
      const res = await apiRequest("POST", "/api/suppliers/csv-import", rows);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to import");
      }
      return res.json() as Promise<{ inserted: number }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/suppliers"] }),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nullify(form: SupplierForm) {
  return Object.fromEntries(
    Object.entries(form).map(([k, v]) => [k, v.trim() === "" ? null : v.trim()])
  );
}

function normaliseHeader(h: string): string {
  return h.trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")  // accountNumber -> account_Number
    .toLowerCase()
    .replace(/\s+/g, "_");                  // "Account Number" -> account_number
}

function parseCsv(text: string): SupplierForm[] {
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
    name: idx(["name", "supplier", "supplier_name"]),
    property: idx(["property", "property_code"]),
    accountNumber: idx(["account_number", "account_no", "account", "accountnumber"]),
    addressPostcode: idx(["address_postcode", "postcode", "address_post_code", "addresspostcode"]),
    contactPhone: idx(["contact_phone", "phone", "telephone", "contactphone"]),
    email: idx(["email", "email_address"]),
    youcoContact: idx(["youco_contact", "youco_contact_name", "youcocontact"]),
    hyperlink: idx(["hyperlink", "url", "link", "website"]),
    notes: idx(["notes", "note"]),
    // (Section 3 will add payment_method and payment_day here)
  };

  const results: SupplierForm[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const name = col.name >= 0 ? (cells[col.name] ?? "").trim() : "";
    if (!name) continue;
    results.push({
      name,
      property: col.property >= 0 ? (cells[col.property]?.trim() ?? "ALL") || "ALL" : "ALL",
      accountNumber: col.accountNumber >= 0 ? (cells[col.accountNumber]?.trim() ?? "") : "",
      addressPostcode: col.addressPostcode >= 0 ? (cells[col.addressPostcode]?.trim() ?? "") : "",
      contactPhone: col.contactPhone >= 0 ? (cells[col.contactPhone]?.trim() ?? "") : "",
      email: col.email >= 0 ? (cells[col.email]?.trim() ?? "") : "",
      youcoContact: col.youcoContact >= 0 ? (cells[col.youcoContact]?.trim() ?? "") : "",
      hyperlink: col.hyperlink >= 0 ? (cells[col.hyperlink]?.trim() ?? "") : "",
      notes: col.notes >= 0 ? (cells[col.notes]?.trim() ?? "") : "",
    });
  }
  return results;
}

function sortSuppliers(rows: Supplier[], key: SortKey, dir: SortDir): Supplier[] {
  return [...rows].sort((a, b) => {
    const av = a[key] ?? "";
    const bv = b[key] ?? "";
    const cmp = String(av).localeCompare(String(bv), "en-GB", { sensitivity: "base" });
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

function SupplierFormFields({
  form,
  setForm,
}: {
  form: SupplierForm;
  setForm: React.Dispatch<React.SetStateAction<SupplierForm>>;
}) {
  const set = (k: keyof SupplierForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-3">
      <Field label="Supplier Name *" value={form.name} onChange={set("name")} placeholder="e.g. British Gas" />
      <Field label="Property (or ALL)" value={form.property} onChange={set("property")} placeholder="ALL" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Account Number" value={form.accountNumber} onChange={set("accountNumber")} />
        <Field label="Address Postcode" value={form.addressPostcode} onChange={set("addressPostcode")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact Phone" value={form.contactPhone} onChange={set("contactPhone")} type="tel" />
        <Field label="Email" value={form.email} onChange={set("email")} type="email" />
      </div>
      <Field label="YouCo Contact" value={form.youcoContact} onChange={set("youcoContact")} placeholder="Nick / Joph" />
      <Field label="Hyperlink" value={form.hyperlink} onChange={set("hyperlink")} placeholder="https://..." />
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

export default function SuppliersContactsPage() {
  const { data: user } = useUser();
  const isAdmin = user?.role === "admin";
  const canEdit = user?.role === "admin" || user?.role === "contributor";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<SupplierForm>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<SupplierForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const [showEmail, setShowEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState(EMAIL_TEMPLATE_SUBJECT);
  const [emailBody, setEmailBody] = useState(EMAIL_TEMPLATE_BODY);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [emailSent, setEmailSent] = useState(false);

  const csvRef = useRef<HTMLInputElement>(null);

  const { data: rawRows = [], isLoading, error } = useSuppliers(debouncedSearch);
  const sorted = useMemo(() => sortSuppliers(rawRows, sortKey, sortDir), [rawRows, sortKey, sortDir]);

  const createMut = useCreateSupplier();
  const updateMut = useUpdateSupplier();
  const deleteMut = useDeleteSupplier();
  const emailMut = useSendEmail();
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

  function openEdit(s: Supplier) {
    setEditingSupplier(s);
    setEditForm({
      name: s.name ?? "",
      property: s.property ?? "ALL",
      accountNumber: s.accountNumber ?? "",
      addressPostcode: s.addressPostcode ?? "",
      contactPhone: s.contactPhone ?? "",
      email: s.email ?? "",
      youcoContact: s.youcoContact ?? "",
      hyperlink: s.hyperlink ?? "",
      notes: s.notes ?? "",
    });
  }

  function openEmailModal() {
    const allEmails = sorted.filter((s) => s.email).map((s) => s.email!);
    setSelectedEmails(new Set(allEmails));
    setEmailSent(false);
    setShowEmail(true);
  }

  function toggleEmail(email: string) {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function toggleAllEmails(emails: string[]) {
    setSelectedEmails((prev) => {
      if (emails.every((e) => prev.has(e))) return new Set();
      return new Set(emails);
    });
  }

  async function handleSendEmail() {
    if (selectedEmails.size === 0) return;
    await emailMut.mutateAsync({
      to: Array.from(selectedEmails),
      subject: emailSubject,
      body: emailBody,
    });
    setEmailSent(true);
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) {
        alert("No valid rows found. Check the CSV has a header row with a 'name' column.");
        return;
      }
      const result = await csvMut.mutateAsync(rows);
      alert(`Imported ${result.inserted} supplier${result.inserted === 1 ? "" : "s"}.`);
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

  const emailableRows = sorted.filter((s) => s.email);

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        {/* Search */}
        <div className="relative w-64">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search suppliers…"
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

        {/* KPIs */}
        <div className="flex gap-4 text-sm text-gray-600">
          <span>
            <strong className="text-gray-900">{sorted.length}</strong> suppliers
          </span>
          <span>
            <strong className="text-gray-900">{emailableRows.length}</strong> with email
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {isAdmin && emailableRows.length > 0 && (
            <button
              onClick={openEmailModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-youco-bronze text-white text-sm rounded hover:opacity-90"
            >
              <Mail size={14} />
              Compose &amp; Send
            </button>
          )}
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
                Add Supplier
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
            {search ? "No suppliers match your search." : "No suppliers yet. Add one or import a CSV."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th label="Supplier" sortable sk="name" />
                <Th label="Property" sortable sk="property" />
                <Th label="Account No." sortable sk="accountNumber" />
                <Th label="Postcode" sortable sk="addressPostcode" />
                <Th label="Phone" />
                <Th label="Email" />
                <Th label="YouCo Contact" sortable sk="youcoContact" />
                <Th label="Link" />
                {canEdit && <Th label="" className="w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 group">
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                    {s.name}
                    {s.notes && (
                      <span
                        title={s.notes}
                        className="ml-1.5 text-gray-400 cursor-help text-xs"
                      >
                        ℹ
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{s.property || "ALL"}</td>
                  <td className="px-3 py-2 text-gray-600 font-mono text-xs">{s.accountNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{s.addressPostcode ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {s.contactPhone ? (
                      <a href={`tel:${s.contactPhone}`} className="hover:text-youco-blue">
                        {s.contactPhone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {s.email ? (
                      <a href={`mailto:${s.email}`} className="hover:text-youco-blue truncate max-w-[180px] block">
                        {s.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{s.youcoContact ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {s.hyperlink ? (
                      <a
                        href={s.hyperlink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-youco-blue hover:underline"
                      >
                        <ExternalLink size={12} />
                        Link
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(s)}
                          title="Edit"
                          className="p-1 text-gray-400 hover:text-youco-blue rounded"
                        >
                          <Pencil size={13} />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setDeleteId(s.id);
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
        <Modal title="Add Supplier" onClose={() => setShowAdd(false)}>
          <SupplierFormFields form={addForm} setForm={setAddForm} />
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
              disabled={!addForm.name.trim() || createMut.isPending}
              onClick={async () => {
                await createMut.mutateAsync(addForm);
                setShowAdd(false);
              }}
              className="px-4 py-1.5 text-sm bg-youco-blue text-white rounded hover:opacity-90 disabled:opacity-50"
            >
              {createMut.isPending ? "Saving…" : "Add Supplier"}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editingSupplier && (
        <Modal title="Edit Supplier" onClose={() => setEditingSupplier(null)}>
          <SupplierFormFields form={editForm} setForm={setEditForm} />
          {updateMut.error && (
            <p className="mt-3 text-sm text-red-500">{updateMut.error.message}</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setEditingSupplier(null)}
              className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              disabled={!editForm.name.trim() || updateMut.isPending}
              onClick={async () => {
                await updateMut.mutateAsync({ id: editingSupplier.id, data: editForm });
                setEditingSupplier(null);
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
        <Modal title="Delete Supplier" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-700">
            Are you sure you want to delete{" "}
            <strong>{sorted.find((s) => s.id === deleteId)?.name}</strong>? This cannot be
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

      {/* Compose & Send modal */}
      {showEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowEmail(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Compose &amp; Send to Suppliers</h2>
              <button
                onClick={() => setShowEmail(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {emailSent ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <Check size={40} className="text-green-500" />
                  <p className="font-medium text-gray-900">
                    Email sent to {selectedEmails.size} supplier
                    {selectedEmails.size !== 1 ? "s" : ""}!
                  </p>
                  <button
                    onClick={() => setShowEmail(false)}
                    className="mt-2 px-4 py-1.5 text-sm bg-youco-blue text-white rounded hover:opacity-90"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Recipients ({selectedEmails.size} selected)
                      </label>
                      <button
                        onClick={() =>
                          toggleAllEmails(emailableRows.map((s) => s.email!))
                        }
                        className="text-xs text-youco-blue hover:underline"
                      >
                        {emailableRows.every((s) => selectedEmails.has(s.email!))
                          ? "Deselect all"
                          : "Select all"}
                      </button>
                    </div>
                    <div className="border border-gray-200 rounded max-h-36 overflow-y-auto divide-y divide-gray-100">
                      {emailableRows.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedEmails.has(s.email!)}
                            onChange={() => toggleEmail(s.email!)}
                            className="accent-youco-blue"
                          />
                          <span className="text-sm text-gray-800 font-medium w-36 truncate">
                            {s.name}
                          </span>
                          <span className="text-xs text-gray-500 truncate">{s.email}</span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      All selected addresses are sent as BCC — recipients cannot see each other.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                      Subject
                    </label>
                    <input
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                      Message
                    </label>
                    <textarea
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      rows={10}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30 resize-none font-mono"
                    />
                  </div>

                  {emailMut.error && (
                    <p className="text-sm text-red-500">{emailMut.error.message}</p>
                  )}
                </>
              )}
            </div>

            {!emailSent && (
              <div className="px-5 py-3 border-t flex justify-end gap-2">
                <button
                  onClick={() => setShowEmail(false)}
                  className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  disabled={selectedEmails.size === 0 || !emailSubject.trim() || emailMut.isPending}
                  onClick={handleSendEmail}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-youco-bronze text-white rounded hover:opacity-90 disabled:opacity-50"
                >
                  <Mail size={14} />
                  {emailMut.isPending
                    ? "Sending…"
                    : `Send to ${selectedEmails.size} supplier${selectedEmails.size !== 1 ? "s" : ""}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
