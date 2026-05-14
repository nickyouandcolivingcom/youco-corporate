import EnergySyncPage from "@/pages/energy/Sync";

// Settings landing — hosts inline panels for system-wide config. Currently:
// - Octopus Sync (discover accounts, pull consumption). Was /energy/sync.
// Future: API keys, Render env hints, user mgmt links, etc. Keep each as a
// section on this single page; no sub-routes.
export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
          Octopus Energy Sync
        </h3>
        <EnergySyncPage />
      </section>
    </div>
  );
}
