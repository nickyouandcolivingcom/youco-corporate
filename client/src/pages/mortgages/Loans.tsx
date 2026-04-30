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
import type { MortgageWithPortfolio } from "@shared/schema";
import { PROPERTY_CODES, PROPERTY_CODE_VALUES } from "@shared/property-codes";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type SortKey = keyof MortgageWithPortfolio | "equityRics" | "equityLatent";
type SortDir = "asc" | "desc";

interface MortgageForm {
  lender: string;
  propertyCode: string;
  borrowerEntity: "YCO" | "MONOCROM";
  accountNumber: string;
  lenderReference: string;
  offerDate: string;
  expiryDate: string;
  loanAmount: string;
  valuation: string;
  termMonths: string;
  repaymentType: string;
  fixedRatePct: string;
  fixedPeriodMonths: string;
  fixedEndDate: string;
  reversionaryMarginPct: string;
  reversionaryFloorPct: string;
  monthlyPaymentFixed: string;
  ercSchedule: Array<{ year: number; pct: number }>;
  productFee: string;
  valuationFee: string;
  legalFee: string;
  redemptionFee: string;
  status: "Active" | "Redeemed" | "Pending";
  notes: string;
}

const EMPTY_FORM: MortgageForm = {
  lender: "",
  propertyCode: "16RC",
  borrowerEntity: "YCO",
  accountNumber: "",
  lenderReference: "",
  offerDate: "",
  expiryDate: "",
  loanAmount: "",
  valuation: "",
  termMonths: "",
  repaymentType: "Interest Only",
  fixedRatePct: "",
  fixedPeriodMonths: "",
  fixedEndDate: "",
  reversionaryMarginPct: "",
  reversionaryFloorPct: "",
  monthlyPaymentFixed: "",
  ercSchedule: [],
  productFee: "",
  valuationFee: "",
  legalFee: "",
  redemptionFee: "",
  status: "Active",
  notes: "",
};

/**
 * Compact ERC string: always 5 slots, dashes for years with no charge.
 * Examples:
 *   [Y1=5,Y2=4,Y3=3,Y4=2,Y5=1]   → "5/4/3/2/1"
 *   [Y1=4,Y2=2]                  → "4/2/-/-/-"
 *   []                           → "—"
 */
function fmtErcCompact(tiers: Array<{ year: number; pct: number }> | null | undefined): string {
  if (!tiers || tiers.length === 0) return "—";
  const slots = ["-", "-", "-", "-", "-"];
  for (const t of tiers) {
    if (t.year >= 1 && t.year <= 5) {
      slots[t.year - 1] = String(t.pct).replace(/\.0+$/, "");
    }
  }
  return slots.join("/");
}

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

function fmtMoney(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : gbp.format(n);
}

const STATUS_BADGE_PLACEHOLDER_RM = 0; // anchor

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtPct(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return `${v}%`;
}

function fmtTermYears(months: number | null | undefined): string {
  if (!months) return "—";
  return `${(months / 12).toFixed(0)}y`;
}

function payload(form: MortgageForm) {
  const t = (v: string) => (v.trim() === "" ? null : v.trim());
  const cleanErc = form.ercSchedule
    .filter((tier) => Number.isFinite(tier.pct) && tier.pct > 0)
    .sort((a, b) => a.year - b.year);
  return {
    lender: form.lender.trim(),
    propertyCode: form.propertyCode,
    borrowerEntity: form.borrowerEntity,
    accountNumber: t(form.accountNumber),
    lenderReference: t(form.lenderReference),
    offerDate: t(form.offerDate),
    expiryDate: t(form.expiryDate),
    loanAmount: t(form.loanAmount),
    valuation: t(form.valuation),
    termMonths: form.termMonths === "" ? null : parseInt(form.termMonths, 10),
    repaymentType: t(form.repaymentType),
    fixedRatePct: t(form.fixedRatePct),
    fixedPeriodMonths: form.fixedPeriodMonths === "" ? null : parseInt(form.fixedPeriodMonths, 10),
    fixedEndDate: t(form.fixedEndDate),
    reversionaryMarginPct: t(form.reversionaryMarginPct),
    reversionaryFloorPct: t(form.reversionaryFloorPct),
    monthlyPaymentFixed: t(form.monthlyPaymentFixed),
    ercSchedule: cleanErc.length > 0 ? cleanErc : null,
    productFee: t(form.productFee),
    valuationFee: t(form.valuationFee),
    legalFee: t(form.legalFee),
    redemptionFee: t(form.redemptionFee),
    status: form.status,
    notes: t(form.notes),
  };
}

function useMortgages(search: string) {
  return useQuery<MortgageWithPortfolio[]>({
    queryKey: ["/api/mortgages", search],
    queryFn: async () => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/mortgages${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load mortgages");
      return res.json();
    },
  });
}

function useCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: MortgageForm) => {
      const res = await apiRequest("POST", "/api/mortgages", payload(data));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mortgages"] }),
  });
}

function useUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: MortgageForm }) => {
      const res = await apiRequest("PATCH", `/api/mortgages/${id}`, payload(data));
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mortgages"] }),
  });
}

function useDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/mortgages/${id}`);
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mortgages"] }),
  });
}

interface PdfFileResult {
  file: string;
  lender?: string;
  propertyCode?: string;
  status: "ok" | "error" | "no_parser";
  row?: ReturnType<typeof payload>;
  error?: string;
}

interface PdfResponse {
  received: number;
  parsed: number;
  failed: number;
  results: PdfFileResult[];
  rows: Array<ReturnType<typeof payload>>;
}

interface BulkInsertResult {
  received: number;
  inserted: number;
  skippedDuplicates: number;
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

function usePdfImport() {
  return useMutation({
    mutationFn: async (files: File[]) => {
      const payload = await Promise.all(
        files.map(async (f) => ({ name: f.name, base64: await fileToBase64(f) }))
      );
      const res = await apiRequest("POST", "/api/mortgages/import-pdfs", { files: payload });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "PDF import failed");
      }
      return res.json() as Promise<PdfResponse>;
    },
  });
}

function useBulkInsert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Array<ReturnType<typeof payload>>) => {
      const res = await apiRequest("POST", "/api/mortgages/bulk-insert", { rows });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Bulk insert failed");
      }
      return res.json() as Promise<BulkInsertResult>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mortgages"] }),
  });
}

function Modal({
  title,
  onClose,
  children,
  size = "lg",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "lg" | "xl";
}) {
  const max = size === "xl" ? "max-w-2xl" : "max-w-xl";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={cn(
          "relative bg-white rounded-lg shadow-xl w-full mx-4 flex flex-col max-h-[90vh]",
          max
        )}
      >
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
  form: MortgageForm;
  setForm: React.Dispatch<React.SetStateAction<MortgageForm>>;
}) {
  const set = (k: keyof MortgageForm) => (v: string) => setForm((f) => ({ ...f, [k]: v as never }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Lender *</label>
          <input
            value={form.lender}
            onChange={(e) => set("lender")(e.target.value)}
            placeholder="Kent Reliance / Precise / Landbay / LendInvest"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
        </div>
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
          <label className="block text-xs font-medium text-gray-600 mb-1">Borrower</label>
          <select
            value={form.borrowerEntity}
            onChange={(e) =>
              setForm((f) => ({ ...f, borrowerEntity: e.target.value as "YCO" | "MONOCROM" }))
            }
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            <option value="YCO">You & Co. Living</option>
            <option value="MONOCROM">Monocrom Limited</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Account No.</label>
          <input value={form.accountNumber} onChange={(e) => set("accountNumber")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Lender Reference</label>
          <input value={form.lenderReference} onChange={(e) => set("lenderReference")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Loan £</label>
          <input value={form.loanAmount} onChange={(e) => set("loanAmount")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Valuation £</label>
          <input value={form.valuation} onChange={(e) => set("valuation")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Term (months)</label>
          <input value={form.termMonths} onChange={(e) => set("termMonths")(e.target.value)} placeholder="e.g. 300" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Repayment Type</label>
          <select value={form.repaymentType} onChange={(e) => set("repaymentType")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
            <option>Interest Only</option>
            <option>Repayment</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fixed Rate %</label>
          <input value={form.fixedRatePct} onChange={(e) => set("fixedRatePct")(e.target.value)} placeholder="3.69" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fixed Period (months)</label>
          <input value={form.fixedPeriodMonths} onChange={(e) => set("fixedPeriodMonths")(e.target.value)} placeholder="60" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reversionary Margin %</label>
          <input value={form.reversionaryMarginPct} onChange={(e) => set("reversionaryMarginPct")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Floor %</label>
          <input value={form.reversionaryFloorPct} onChange={(e) => set("reversionaryFloorPct")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Payment £</label>
          <input value={form.monthlyPaymentFixed} onChange={(e) => set("monthlyPaymentFixed")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Offer Date</label>
          <input type="date" value={form.offerDate} onChange={(e) => set("offerDate")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fixed End / Refi Date</label>
          <input type="date" value={form.fixedEndDate} onChange={(e) => set("fixedEndDate")(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as MortgageForm["status"] }))} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
            <option>Active</option>
            <option>Pending</option>
            <option>Redeemed</option>
          </select>
        </div>
      </div>
      <ErcEditor
        tiers={form.ercSchedule}
        onChange={(tiers) => setForm((f) => ({ ...f, ercSchedule: tiers }))}
      />
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Product Fee £</label>
          <input value={form.productFee} onChange={(e) => set("productFee")(e.target.value)} placeholder="5100" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Valuation £</label>
          <input value={form.valuationFee} onChange={(e) => set("valuationFee")(e.target.value)} placeholder="630" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Legal Fee £</label>
          <input value={form.legalFee} onChange={(e) => set("legalFee")(e.target.value)} placeholder="850" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Redemption £</label>
          <input value={form.redemptionFee} onChange={(e) => set("redemptionFee")(e.target.value)} placeholder="114" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm resize-none" />
      </div>
    </div>
  );
}

function ErcEditor({
  tiers,
  onChange,
}: {
  tiers: Array<{ year: number; pct: number }>;
  onChange: (tiers: Array<{ year: number; pct: number }>) => void;
}) {
  // Normalise: fill 5 slots, even if user has fewer tiers. Slots without
  // a tier render with empty pct field; user enters a number to add the
  // tier, or blanks to remove.
  const slots = Array.from({ length: 5 }, (_, i) => {
    const year = i + 1;
    const found = tiers.find((t) => t.year === year);
    return { year, pct: found ? String(found.pct) : "" };
  });

  function setSlot(year: number, raw: string) {
    const next = tiers.filter((t) => t.year !== year);
    const trimmed = raw.trim();
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isNaN(n) && n > 0) next.push({ year, pct: n });
    }
    onChange(next);
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        Early Repayment Charges (%)
      </label>
      <div className="grid grid-cols-5 gap-2">
        {slots.map((s) => (
          <div key={s.year}>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
              Year {s.year}
            </p>
            <input
              value={s.pct}
              onChange={(e) => setSlot(s.year, e.target.value)}
              placeholder="—"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums text-center"
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Leave a year blank if there's no charge that year. Format example: 5/4/3/2/1.
      </p>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  Active: "bg-green-50 text-green-700 ring-green-600/20",
  Pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Redeemed: "bg-gray-50 text-gray-600 ring-gray-500/10",
};

export default function MortgagesPage() {
  const { data: user } = useUser();
  const isAdmin = user?.role === "admin";
  const canEdit = user?.role === "admin" || user?.role === "contributor";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("propertyCode");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [editing, setEditing] = useState<MortgageWithPortfolio | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<MortgageForm>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<MortgageForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: rows = [], isLoading, error } = useMortgages(debouncedSearch);

  // Per-row computed equity values (Latent - Loan, RICS - Loan)
  function equityFor(r: MortgageWithPortfolio, kind: "rics" | "latent"): number | null {
    const val = kind === "rics" ? r.ricsValue : r.latentValue;
    if (val == null || r.loanAmount == null) return null;
    return Number(val) - Number(r.loanAmount);
  }

  const sorted = useMemo(() => {
    const numericKeys: SortKey[] = [
      "loanAmount",
      "valuation",
      "fixedRatePct",
      "monthlyPaymentFixed",
      "termMonths",
      "ricsValue",
      "latentValue",
      "equityRics",
      "equityLatent",
    ];
    const dateKeys: SortKey[] = ["offerDate", "fixedEndDate", "ricsDate"];
    return [...rows].sort((a, b) => {
      const av =
        sortKey === "equityRics"
          ? equityFor(a, "rics")
          : sortKey === "equityLatent"
            ? equityFor(a, "latent")
            : (a as never)[sortKey];
      const bv =
        sortKey === "equityRics"
          ? equityFor(b, "rics")
          : sortKey === "equityLatent"
            ? equityFor(b, "latent")
            : (b as never)[sortKey];
      if (numericKeys.includes(sortKey)) {
        const an = av == null ? -Infinity : Number(av);
        const bn = bv == null ? -Infinity : Number(bv);
        return sortDir === "asc" ? an - bn : bn - an;
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
    const loan = sorted.reduce((a, r) => a + Number(r.loanAmount ?? 0), 0);
    const rics = sorted.reduce((a, r) => a + Number(r.ricsValue ?? 0), 0);
    const latent = sorted.reduce((a, r) => a + Number(r.latentValue ?? 0), 0);
    const monthly = sorted.reduce((a, r) => a + Number(r.monthlyPaymentFixed ?? 0), 0);
    return {
      loan,
      rics,
      latent,
      monthly,
      equityRics: rics - loan,
      equityLatent: latent - loan,
    };
  }, [sorted]);

  // Mortgages with refi date in the next 12 months
  const upcomingRefi = useMemo(() => {
    const now = Date.now();
    const inOneYear = now + 365 * 24 * 60 * 60 * 1000;
    return sorted.filter((r) => {
      if (!r.fixedEndDate) return false;
      const t = new Date(r.fixedEndDate).getTime();
      return t > now && t <= inOneYear;
    });
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

  function openEdit(m: MortgageWithPortfolio) {
    setEditing(m);
    setEditForm({
      lender: m.lender,
      propertyCode: m.propertyCode,
      borrowerEntity: (m.borrowerEntity as "YCO" | "MONOCROM") ?? "YCO",
      accountNumber: m.accountNumber ?? "",
      lenderReference: m.lenderReference ?? "",
      offerDate: m.offerDate ?? "",
      expiryDate: m.expiryDate ?? "",
      loanAmount: m.loanAmount ?? "",
      valuation: m.valuation ?? "",
      termMonths: m.termMonths != null ? String(m.termMonths) : "",
      repaymentType: m.repaymentType ?? "Interest Only",
      fixedRatePct: m.fixedRatePct ?? "",
      fixedPeriodMonths: m.fixedPeriodMonths != null ? String(m.fixedPeriodMonths) : "",
      fixedEndDate: m.fixedEndDate ?? "",
      reversionaryMarginPct: m.reversionaryMarginPct ?? "",
      reversionaryFloorPct: m.reversionaryFloorPct ?? "",
      monthlyPaymentFixed: m.monthlyPaymentFixed ?? "",
      ercSchedule: m.ercSchedule ?? [],
      productFee: m.productFee ?? "",
      valuationFee: m.valuationFee ?? "",
      legalFee: m.legalFee ?? "",
      redemptionFee: m.redemptionFee ?? "",
      status: (m.status as MortgageForm["status"]) ?? "Active",
      notes: m.notes ?? "",
    });
  }

  function Th({ label, sortable, sk, className }: { label: string; sortable?: boolean; sk?: SortKey; className?: string }) {
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
          <input value={search} onChange={(e) => handleSearchChange(e.target.value)} placeholder="Search…" className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue/30" />
          {search && <button onClick={() => handleSearchChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={12} /></button>}
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <PdfImportButton />
              <button onClick={() => { setAddForm(EMPTY_FORM); setShowAdd(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-youco-blue text-white text-sm rounded hover:opacity-90">
                <Plus size={14} />
                Add Mortgage
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
        <span><strong className="text-gray-900">{sorted.length}</strong> mortgages</span>
        <span>Loan: <strong className="text-gray-900">{gbp.format(totals.loan)}</strong></span>
        <span>RICS: <strong className="text-gray-900">{gbp.format(totals.rics)}</strong></span>
        <span>Latent: <strong className="text-gray-900">{gbp.format(totals.latent)}</strong></span>
        <span>Equity (RICS): <strong className="text-gray-900">{gbp.format(totals.equityRics)}</strong></span>
        <span>Equity (Latent): <strong className="text-gray-900">{gbp.format(totals.equityLatent)}</strong></span>
        <span>Monthly: <strong className="text-gray-900">{gbp.format(totals.monthly)}</strong></span>
      </div>

      {upcomingRefi.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-2 font-semibold text-amber-800 mb-1">
            <AlertTriangle size={14} />
            Refinancing within 12 months ({upcomingRefi.length})
          </div>
          <ul className="text-xs text-amber-900 space-y-0.5">
            {upcomingRefi.map((m) => (
              <li key={m.id}>
                <code>{m.propertyCode}</code> — {m.lender} — {fmtDate(m.fixedEndDate)} ({fmtMoney(m.loanAmount)} @ {fmtPct(m.fixedRatePct)})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-500">{String(error)}</div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No mortgages yet. Use <strong>Bulk Import (PDF)</strong> to upload offer letters or <strong>Add Mortgage</strong> manually.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th label="Property" sortable sk="propertyCode" />
                <Th label="Lender" sortable sk="lender" />
                <Th label="Borrower" sortable sk="borrowerEntity" />
                <Th label="Account" />
                <Th label="Latent" sortable sk="latentValue" className="text-right" />
                <Th label="RICS" sortable sk="ricsValue" className="text-right" />
                <Th label="RICS Date" sortable sk="ricsDate" />
                <Th label="Loan" sortable sk="loanAmount" className="text-right" />
                <Th label="Eq (Latent)" sortable sk="equityLatent" className="text-right" />
                <Th label="Eq (RICS)" sortable sk="equityRics" className="text-right" />
                <Th label="Term" sortable sk="termMonths" />
                <Th label="Rate" sortable sk="fixedRatePct" />
                <Th label="Refinancing Date" sortable sk="fixedEndDate" />
                <Th label="ERC (Y1-5)" />
                <Th label="Monthly" sortable sk="monthlyPaymentFixed" className="text-right" />
                <Th label="Status" sortable sk="status" />
                {canEdit && <Th label="" className="w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50 group">
                  <td className="px-3 py-2 font-mono text-xs">{m.propertyCode}</td>
                  <td className="px-3 py-2 font-medium text-xs">{m.lender}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", m.borrowerEntity === "MONOCROM" ? "bg-purple-50 text-purple-700" : "bg-gray-100 text-gray-700")}>
                      {m.borrowerEntity}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{m.accountNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">{fmtMoney(m.latentValue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">{fmtMoney(m.ricsValue)}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(m.ricsDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(m.loanAmount)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums text-xs", equityFor(m, "latent") != null && equityFor(m, "latent")! < 0 && "text-red-600")}>
                    {fmtMoney(equityFor(m, "latent"))}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums text-xs", equityFor(m, "rics") != null && equityFor(m, "rics")! < 0 && "text-red-600")}>
                    {fmtMoney(equityFor(m, "rics"))}
                  </td>
                  <td className="px-3 py-2 text-xs">{fmtTermYears(m.termMonths)}</td>
                  <td className="px-3 py-2 text-xs">{fmtPct(m.fixedRatePct)}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(m.fixedEndDate)}</td>
                  <td className="px-3 py-2 text-xs font-mono whitespace-nowrap" title="ERC % per year (year 1 → year 5)">
                    {fmtErcCompact(m.ercSchedule)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">{fmtMoney(m.monthlyPaymentFixed)}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset", STATUS_BADGE[m.status] ?? STATUS_BADGE.Active)}>
                      {m.status}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(m)} title="Edit" className="p-1 text-gray-400 hover:text-youco-blue rounded">
                          <Pencil size={13} />
                        </button>
                        {isAdmin && (
                          <button onClick={() => setDeleteId(m.id)} title="Delete" className="p-1 text-gray-400 hover:text-red-500 rounded">
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
        <Modal title="Add Mortgage" onClose={() => setShowAdd(false)} size="xl">
          <FormFields form={addForm} setForm={setAddForm} />
          {createMut.error && <p className="mt-3 text-sm text-red-500">{createMut.error.message}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
            <button
              disabled={!addForm.lender || createMut.isPending}
              onClick={async () => {
                await createMut.mutateAsync(addForm);
                setShowAdd(false);
              }}
              className="px-4 py-1.5 text-sm bg-youco-blue text-white rounded hover:opacity-90 disabled:opacity-50"
            >
              {createMut.isPending ? "Saving…" : "Add Mortgage"}
            </button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Mortgage" onClose={() => setEditing(null)} size="xl">
          <FormFields form={editForm} setForm={setEditForm} />
          {updateMut.error && <p className="mt-3 text-sm text-red-500">{updateMut.error.message}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
            <button disabled={updateMut.isPending} onClick={async () => { await updateMut.mutateAsync({ id: editing.id, data: editForm }); setEditing(null); }} className="px-4 py-1.5 text-sm bg-youco-blue text-white rounded hover:opacity-90 disabled:opacity-50">
              {updateMut.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </Modal>
      )}

      {deleteId !== null && (
        <Modal title="Delete Mortgage" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-700">Delete this mortgage record?</p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setDeleteId(null)} className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
            <button disabled={deleteMut.isPending} onClick={async () => { await deleteMut.mutateAsync(deleteId); setDeleteId(null); }} className="px-4 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700">
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
  const insertMut = useBulkInsert();
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
    await insertMut.mutateAsync(parseMut.data.rows);
    setImported(true);
  }

  function reset() {
    setOpen(false);
    parseMut.reset();
    insertMut.reset();
    setImported(false);
  }

  return (
    <>
      <button
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-purple-300 text-purple-700 text-sm rounded hover:bg-purple-50"
      >
        <Upload size={14} />
        Bulk Import (PDF)
      </button>
      <input ref={fileRef} type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={handleFiles} />

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={reset} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Mortgage PDF Import — review</h2>
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
                    {parseMut.data.failed > 0 && <span className="text-red-600"> {parseMut.data.failed} failed.</span>}
                  </p>
                  <table className="w-full text-xs border border-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-2 py-1">File</th>
                        <th className="text-left px-2 py-1">Lender</th>
                        <th className="text-left px-2 py-1">Property</th>
                        <th className="text-right px-2 py-1">Loan</th>
                        <th className="text-left px-2 py-1">Rate</th>
                        <th className="text-left px-2 py-1">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parseMut.data.results.map((r, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1 truncate max-w-[200px]" title={r.file}>{r.file}</td>
                          <td className="px-2 py-1">{r.lender ?? "—"}</td>
                          <td className="px-2 py-1 font-mono">{r.propertyCode ?? "—"}</td>
                          <td className="px-2 py-1 text-right">{r.row?.loanAmount ? `£${r.row.loanAmount}` : "—"}</td>
                          <td className="px-2 py-1">{r.row?.fixedRatePct ? `${r.row.fixedRatePct}%` : "—"}</td>
                          <td className="px-2 py-1">{r.status === "ok" ? <span className="text-emerald-600">OK</span> : <span className="text-red-600" title={r.error}>{r.status === "no_parser" ? "no parser" : "error"}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parseMut.data.results.some((r) => r.status !== "ok") && (
                    <details className="border border-red-200 rounded p-3 bg-red-50">
                      <summary className="cursor-pointer text-xs text-red-700">
                        Errors / not parseable ({parseMut.data.results.filter((r) => r.status !== "ok").length})
                      </summary>
                      <ul className="mt-2 text-xs text-red-700 space-y-0.5">
                        {parseMut.data.results.filter((r) => r.status !== "ok").map((r, i) => (
                          <li key={i}><code>{r.file}</code>: {r.error}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}

              {insertMut.error && <p className="text-red-600">{insertMut.error.message}</p>}
              {insertMut.data && (
                <p className="text-gray-700">
                  Inserted <strong>{insertMut.data.inserted}</strong> / {insertMut.data.received} rows.
                  {insertMut.data.skippedDuplicates > 0 && <span className="text-amber-700"> {insertMut.data.skippedDuplicates} duplicates skipped.</span>}
                </p>
              )}
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button onClick={reset} className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">{imported ? "Close" : "Cancel"}</button>
              {parseMut.data && parseMut.data.rows.length > 0 && !imported && (
                <button disabled={insertMut.isPending} onClick={handleImport} className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded hover:opacity-90 disabled:opacity-50">
                  {insertMut.isPending ? "Importing…" : `Import ${parseMut.data.rows.length} mortgages`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
