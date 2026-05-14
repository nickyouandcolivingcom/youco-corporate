import { Link } from "wouter";
import {
  Landmark,
  Zap,
  Droplets,
  Wifi,
  ContactRound,
  ExternalLink,
} from "lucide-react";

// Dashboard landing — intentionally light for now. Acts as the front door to
// internal modules plus a place to hang external links (corporate websites,
// intranet, sibling YouCo apps) as they come online.
export default function DashboardPage() {
  const modules = [
    { href: "/suppliers", label: "Suppliers", icon: <ContactRound size={18} />, desc: "Contacts, accounts, MPAN/MPRN lookup" },
    { href: "/mortgages", label: "Mortgages", icon: <Landmark size={18} />, desc: "9 loans across the portfolio" },
    { href: "/energy", label: "Energy", icon: <Zap size={18} />, desc: "Octopus + EON consumption & invoices" },
    { href: "/water", label: "Water", icon: <Droplets size={18} />, desc: "Severn Trent invoices & volumes" },
    { href: "/broadband", label: "Broadband", icon: <Wifi size={18} />, desc: "11 circuits, contract & price escalators" },
  ];

  const externalLinks: Array<{ href: string; label: string }> = [
    // Add corporate sites, intranet, sibling apps here as they come online.
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
          Modules
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {modules.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-youco-bronze transition-colors"
            >
              <div className="flex items-center gap-2 text-youco-blue">
                {m.icon}
                <span className="font-heading text-base">{m.label}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{m.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
          External
        </h3>
        {externalLinks.length === 0 ? (
          <div className="bg-white border border-gray-200 border-dashed rounded-lg p-4 text-sm text-gray-400">
            No external links yet — corporate websites, intranet, sibling YouCo
            apps will appear here.
          </div>
        ) : (
          <ul className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {externalLinks.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50"
                >
                  <ExternalLink size={14} className="text-gray-400" />
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
