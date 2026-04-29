import { Link, useLocation } from "wouter";
import { useUser, useLogout } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  ContactRound,
  LogOut,
  Building2,
  Landmark,
  Zap,
  FileText,
  RefreshCw,
  TrendingUp,
  Droplets,
  Wifi,
  BookOpen,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  exact?: boolean;
}

const NAV: Array<{ section: string; items: NavItem[] }> = [
  {
    section: "PORTFOLIO",
    items: [
      { label: "Wealth Statement", href: "/portfolio", icon: <Building2 size={16} /> },
    ],
  },
  {
    section: "SUPPLIERS",
    items: [
      { label: "Contacts", href: "/suppliers/contacts", icon: <ContactRound size={16} /> },
    ],
  },
  {
    section: "MORTGAGES",
    items: [
      { label: "Loans", href: "/mortgages", icon: <Landmark size={16} />, exact: true },
    ],
  },
  {
    section: "ENERGY",
    items: [
      { label: "Accounts", href: "/energy", icon: <Zap size={16} />, exact: true },
      { label: "Invoices", href: "/energy/invoices", icon: <FileText size={16} /> },
      { label: "Analytics", href: "/energy/analytics", icon: <TrendingUp size={16} /> },
      { label: "Sync (Octopus)", href: "/energy/sync", icon: <RefreshCw size={16} /> },
    ],
  },
  {
    section: "WATER",
    items: [
      { label: "Accounts", href: "/water", icon: <Droplets size={16} />, exact: true },
      { label: "Invoices", href: "/water/invoices", icon: <FileText size={16} /> },
    ],
  },
  {
    section: "BROADBAND",
    items: [
      { label: "Accounts", href: "/broadband", icon: <Wifi size={16} /> },
    ],
  },
  {
    section: "RULES & DOCS",
    items: [
      { label: "Operations Manual", href: "/docs", icon: <BookOpen size={16} /> },
    ],
  },
];

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

export default function Sidebar() {
  const [location] = useLocation();
  const { data: user } = useUser();
  const logout = useLogout();

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
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <p className="px-3 pt-4 pb-1 text-xs font-semibold tracking-widest text-white/40 uppercase">
              {section}
            </p>
            {items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(location, item)} />
            ))}
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
