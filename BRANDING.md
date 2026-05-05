# You & Co. — App Look & Feel Handover

Self-contained brief for a fresh agent to reproduce the visual language of `youco-corporate` in another app (e.g. `youco-revenue`, future siblings). Read this top-to-bottom; everything you need is in here.

---

## 1. Brand essentials

**Two brand colours, used sparingly:**

| Token | Hex | Use |
|---|---|---|
| `youco-blue` | `#071A2C` | Sidebar background, page-title text, primary buttons, "blue accent" KPIs |
| `youco-bronze` | `#AA7042` | Active sidebar icons, sidebar subtitle, "bronze accent" KPIs, highlight states |

Everything else is neutral grey (`gray-50` … `gray-900` from Tailwind defaults). White cards on `bg-gray-50` page background.

**Two fonts:**
- **Heading**: `Rockwell, Georgia, serif` — used for the masthead, page titles, KPI numbers, totals
- **Body**: `Inter, system-ui, sans-serif` — everything else

**Tone of UI**: dense, tabular, professional. Closer to a private-bank dashboard than a SaaS product. Lots of whitespace inside cards; tight rows in tables. Minimal colour. No gradients. No shadows beyond `shadow-xl` on modals.

---

## 2. Tailwind config

Drop these into `tailwind.config.ts`:

```ts
theme: {
  extend: {
    colors: {
      "youco-blue": "#071A2C",
      "youco-bronze": "#AA7042",
    },
    fontFamily: {
      heading: ["Rockwell", "Georgia", "serif"],
      body: ["Inter", "system-ui", "sans-serif"],
    },
  },
}
```

(Plus any shadcn/ui CSS variables if you're using shadcn — they're orthogonal.)

---

## 3. Layout shell

Every page sits inside this shell. **Don't customise per page** — consistency matters more than novelty.

```tsx
// Layout.tsx
<div className="flex min-h-screen bg-gray-50">
  <Sidebar />
  <div className="flex-1 flex flex-col min-w-0">
    <header className="h-12 bg-white border-b border-gray-200 flex items-center px-6 flex-shrink-0">
      <h2 className="font-heading text-youco-blue text-base font-semibold tracking-wide">
        {title}
      </h2>
    </header>
    <main className="flex-1 p-6 overflow-auto">{children}</main>
  </div>
</div>
```

Key choices:
- Header is **48px tall** (`h-12`) with a thin bottom border — never any taller. Use it for page title only, no actions.
- Page padding is `p-6` (24px). Cards inside use `p-4` (16px) for compact, `p-5` (20px) for forms.
- Page actions (Add, Bulk Import, Search) live **inside the page content**, not in the header.

---

## 4. Sidebar

```tsx
<aside className="w-56 min-h-screen bg-youco-blue flex flex-col flex-shrink-0">
  {/* Masthead */}
  <div className="px-4 py-5 border-b border-white/10">
    <h1 className="font-heading text-white text-lg tracking-wide leading-tight">
      You &amp; Co.
    </h1>
    <p className="text-youco-bronze text-xs tracking-widest uppercase mt-0.5">
      {subtitle /* e.g. "Corporate", "Revenue" */}
    </p>
  </div>

  {/* Sectioned nav */}
  <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
    {sections.map(({ section, items }) => (
      <div key={section}>
        <p className="px-3 pt-4 pb-1 text-xs font-semibold tracking-widest text-white/40 uppercase">
          {section}
        </p>
        {items.map((item) => /* NavLink */)}
      </div>
    ))}
  </nav>

  {/* User chip */}
  <div className="px-3 py-3 border-t border-white/10">…</div>
</aside>
```

NavLink active vs inactive:
```tsx
className={cn(
  "flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors",
  active
    ? "bg-white/15 text-white font-medium"
    : "text-white/70 hover:text-white hover:bg-white/10"
)}
// Icon colour swap on active:
<span className={active ? "text-youco-bronze" : ""}>{icon}</span>
```

Rules:
- Width is **`w-56`** (224px). Don't change it.
- Section headers are **uppercase with widest tracking**, white/40 opacity. They are labels, not links.
- Icons are `lucide-react` at **size 16** (`<Building2 size={16} />` etc.).
- Active row gets `bg-white/15 + bold + bronze icon`. Hover gets `bg-white/10`.
- Bottom user chip: name in white, role in `white/40` capitalised, sign-out icon at `white/50 → white` on hover.

---

## 5. KPI boxes (the strip at the top of `/mortgages`)

```tsx
function KpiBox({ label, value, sub, accent }: {
  label: string; value: string; sub?: string;
  accent?: "blue" | "bronze";
}) {
  const accentClass =
    accent === "blue"   ? "border-l-4 border-youco-blue"
  : accent === "bronze" ? "border-l-4 border-youco-bronze"
                        : "border-l-4 border-gray-300";
  return (
    <div className={cn("bg-white rounded-lg border border-gray-200 p-4", accentClass)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="font-heading text-2xl text-gray-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
```

Use it for top-of-page metrics. Reserve **bronze** for "the one number that matters most" (e.g. portfolio value), **blue** for the second most important (e.g. debt). Default grey for the rest. Lay out in a `grid grid-cols-5 gap-3` (or `grid-cols-{N}` for whatever count).

`sub` line is for the formula / caveat in 11px grey-400 (e.g. "Loan ÷ Latent Value").

---

## 6. Tables

```tsx
<div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
  <table className="w-full text-sm">
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">…</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-100">
      <tr className="hover:bg-gray-50 group">
        <td className="px-3 py-2 …">…</td>
      </tr>
    </tbody>
    <tfoot className="border-t-2 border-gray-300 bg-gray-50">
      <tr>
        <td className="px-3 py-2.5 font-semibold text-gray-700">TOTALS</td>
        <td className="px-3 py-2.5 text-right tabular-nums font-semibold">£X</td>
      </tr>
    </tfoot>
  </table>
</div>
```

Conventions:
- **Header**: `bg-gray-50`, **uppercase 12px** (`text-xs`), `font-semibold text-gray-500 tracking-wide`. Sortable columns: cursor-pointer + hover:text-gray-800 + a chevron icon when active.
- **Row height**: `py-2` (compact). `py-2.5` for header/footer.
- **Money**: right-aligned, `tabular-nums`, formatted via `Intl.NumberFormat("en-GB", { style:"currency", currency:"GBP", maximumFractionDigits:0 })`.
- **Property codes / account numbers**: `font-mono text-xs`.
- **Empty values**: render `—` (em-dash), never blank.
- **Row actions** (edit/delete buttons): hidden by default, revealed via `opacity-0 group-hover:opacity-100`. Use `lucide-react` icons at size 13.
- **Negative equity / overdue / risk**: render in `text-red-600` (or `text-amber-600` for warnings within ~60 days).

---

## 7. Status badges

```tsx
const STATUS_BADGE: Record<string, string> = {
  Active:   "bg-green-50 text-green-700 ring-green-600/20",
  Pending:  "bg-amber-50 text-amber-700 ring-amber-600/20",
  Closed:   "bg-gray-50  text-gray-600  ring-gray-500/10",
  Disputed: "bg-red-50   text-red-700   ring-red-600/20",
};
<span className={cn(
  "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset",
  STATUS_BADGE[status]
)}>{status}</span>
```

---

## 8. Buttons

| Variant | Class | Use |
|---|---|---|
| Primary | `px-3 py-1.5 bg-youco-blue text-white text-sm rounded hover:opacity-90` | Add Account, Save, Submit |
| Outline | `px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50` | Cancel, secondary actions, "Refresh from Seed" |
| Destructive | `px-4 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700` | Delete confirm in modal only |
| Icon-only | `p-1 text-gray-400 hover:text-youco-blue rounded` | Row actions |

Disabled state always: `disabled:opacity-50`. Pending state shows "Saving…" / "Deleting…" text — never spinners.

---

## 9. Modals

```tsx
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
```

Always `max-w-lg` for forms. `max-w-2xl` only if a wider form is genuinely needed. `max-h-[90vh]` + scrollable body.

---

## 10. Forms

- Field label: `block text-xs font-medium text-gray-600 mb-1`
- Input: `w-full border border-gray-300 rounded px-3 py-1.5 text-sm`
- Add `font-mono` for codes/IDs/account numbers
- Two-column layout: `grid grid-cols-2 gap-3`
- Required marker: append ` *` to label text (no asterisk colour change)
- Error text: `mt-3 text-sm text-red-500`
- Footer button row: `mt-4 flex justify-end gap-2`, Cancel (outline) on left, Primary on right

---

## 11. Search bar (page-level)

```tsx
<div className="relative w-64">
  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
  <input
    placeholder="Search accounts…"
    className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm
               focus:outline-none focus:ring-2 focus:ring-youco-blue/30"
  />
  {/* X clear button on the right when value present */}
</div>
```

300ms debounce on input → query refetch. Always `w-64`.

---

## 12. Page-level header strip (above table)

The pattern at the top of every list page:

```tsx
<div className="flex flex-wrap items-center gap-2 justify-between">
  <SearchInput />
  <span className="text-sm text-gray-600">
    <strong className="text-gray-900">{N}</strong> accounts
  </span>
  {/* aligned right: */}
  <BulkImportButton /* outline */ />
  <AddButton /* primary */ />
</div>
```

Keep counts in plain language ("9 mortgages", "11 circuits"), bold the number.

---

## 13. Stack & libraries

For consistency, use the same building blocks:

- **React + TypeScript**, Vite
- **Wouter** for routing (not React Router)
- **TanStack Query** for server state — `useQuery({ queryKey: ["/api/foo", search], … })`
- **Tailwind v3** + the config above
- **lucide-react** for icons (size 14 in inputs, 16 in nav, 13 in row actions, 18 in modal close)
- **react-markdown** if rendering docs
- **recharts** if showing analytics
- A `cn` helper from `@/lib/utils` (`clsx + tailwind-merge`)
- A shared `apiRequest(method, url, body)` wrapper that throws on non-2xx

---

## 14. Money, dates, percentages, codes

Standardise these so every screen looks the same:

```ts
const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency", currency: "GBP", maximumFractionDigits: 0,
});
const fmtMoney = (v) => v == null || v === "" ? "—" : gbp.format(Number(v));
const fmtDate  = (v) => v ? new Date(v).toLocaleDateString("en-GB",
  { day: "2-digit", month: "short", year: "numeric" }) : "—";   // "13 May 2026"
const fmtPct   = (v) => v == null || v === "" ? "—" : `${v}%`;
```

Property codes are **always uppercase** (`16RC`, `27BLA`) and rendered in `font-mono text-xs`.

---

## 15. Things to avoid

- Drop shadows on cards (use 1px borders instead)
- Gradients of any kind
- Coloured page backgrounds (only `bg-gray-50`)
- Icons larger than 16px in body content
- Sentence-case headers (table headers are UPPERCASE; section labels are UPPERCASE TRACKED)
- Em-dash `–` confusingly: use **em-dash `—`** (U+2014) for empty cells, never a hyphen
- Toasts/snackbars (we don't use them — errors render inline near the action)

---

## 16. One-line house style

> Calm, dense, tabular. White cards on grey. Dark navy sidebar. Bronze for the few things you really want the eye to land on. Rockwell for numbers and titles, Inter for everything else. Em-dashes for missing data. No surprises.

If in doubt, copy a pattern from an existing page in `youco-corporate/client/src/pages/` rather than inventing a new one.
