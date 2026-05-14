import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useUser, useLogout } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  LogOut,
  LayoutDashboard,
  ContactRound,
  Landmark,
  Zap,
  Droplets,
  Wifi,
  BookOpen,
  Settings as SettingsIcon,
  FileText,
} from "lucide-react";
import type { Doc } from "@shared/schema";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  exact?: boolean;
}

const STATIC_NAV: Array<{ section: string; items: NavItem[] }> = [
  {
    section: "DASHBOARD",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={16} />, exact: true },
    ],
  },
  {
    section: "SUPPLIER MGT",
    items: [
      { label: "Suppliers", href: "/suppliers", icon: <ContactRound size={16} />, exact: true },
      { label: "Mortgages", href: "/mortgages", icon: <Landmark size={16} />, exact: true },
      { label: "Energy", href: "/energy", icon: <Zap size={16} />, exact: true },
      { label: "Water", href: "/water", icon: <Droplets size={16} />, exact: true },
      { label: "Broadband", href: "/broadband", icon: <Wifi size={16} />, exact: true },
    ],
  },
];

const SETTINGS_NAV: { section: string; items: NavItem[] } = {
  section: "SETTINGS",
  items: [{ label: "Settings", href: "/settings", icon: <SettingsIcon size={16} />, exact: true }],
};

function isActive(location: string, item: NavItem): boolean {
  if (item.exact) return location === item.href;
  return location.startsWith(item.href);
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors",
        active
          ? "bg-white/15 text-white font-medium"
          : "text-white/70 hover:text-white hover:bg-white/10"
      )}
    >
      <span className={active ? "text-youco-bronze" : ""}>{item.icon}</span>
      {item.label}
    </Link>
  );
}

// Pulls the docs list so each doc renders as its own nav item under RULES & DOCS,
// avoiding a redundant "Operations Manual" landing page.
function useDocsNav() {
  return useQuery<Doc[]>({
    queryKey: ["/api/docs"],
    queryFn: async () => {
      const res = await fetch("/api/docs", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });
}

export default function Sidebar() {
  const [location] = useLocation();
  const { data: user } = useUser();
  const logout = useLogout();
  const { data: docs = [] } = useDocsNav();

  // Sort docs by category then sortOrder, exposed as one nav item each.
  const sortedDocs = [...docs].sort((a, b) => {
    const cat = a.category.localeCompare(b.category);
    if (cat !== 0) return cat;
    return a.sortOrder - b.sortOrder;
  });

  const docsSection: { section: string; items: NavItem[] } = {
    section: "RULES & DOCS",
    items: sortedDocs.map((d) => ({
      label: d.title,
      href: `/docs/${d.slug}`,
      icon: <FileText size={16} />,
    })),
  };

  const nav = [...STATIC_NAV, docsSection, SETTINGS_NAV];

  return (
    <aside className="w-56 min-h-screen bg-youco-blue flex flex-col flex-shrink-0">
      <div className="px-4 py-5 border-b border-white/10">
        <h1 className="font-heading text-white text-lg tracking-wide leading-tight">
          You &amp; Co.
        </h1>
        <p className="text-youco-bronze text-xs tracking-widest uppercase mt-0.5">
          Corporate
        </p>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ section, items }) => (
          <div key={section}>
            <p className="px-3 pt-4 pb-1 text-xs font-semibold tracking-widest text-white/40 uppercase">
              {section}
            </p>
            {items.length === 0 ? (
              <p className="px-3 py-1.5 text-xs text-white/30 italic">No items yet</p>
            ) : (
              items.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(location, item)} />
              ))
            )}
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {user?.username}
            </p>
            <p className="text-white/40 text-xs capitalize">{user?.role}</p>
          </div>
          <button
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            title="Sign out"
            className="text-white/50 hover:text-white transition-colors flex-shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
