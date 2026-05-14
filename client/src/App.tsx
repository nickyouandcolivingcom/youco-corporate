import { Switch, Route, Redirect } from "wouter";
import { useUser } from "@/hooks/useAuth";
import LoginPage from "@/pages/login";
import Layout from "@/components/Layout";
import DashboardPage from "@/pages/dashboard/Dashboard";
import PortfolioPage from "@/pages/portfolio/Portfolio";
import SuppliersContactsPage from "@/pages/suppliers/Contacts";
import EnergyPage from "@/pages/energy/Energy";
import EnergyInvoicesPage from "@/pages/energy/Invoices";
import EnergyAnalyticsPage from "@/pages/energy/Analytics";
import WaterAccountsPage from "@/pages/water/Accounts";
import WaterInvoicesPage from "@/pages/water/Invoices";
import MortgagesPage from "@/pages/mortgages/Loans";
import BroadbandAccountsPage from "@/pages/broadband/Accounts";
import DocsListPage from "@/pages/docs/List";
import DocViewPage from "@/pages/docs/View";
import SettingsPage from "@/pages/settings/Settings";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-youco-blue flex items-center justify-center">
        <div className="text-white text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>

      {/* DASHBOARD */}
      <Route path="/dashboard">
        <Layout title="Dashboard">
          <DashboardPage />
        </Layout>
      </Route>

      {/* SUPPLIER MGT */}
      <Route path="/suppliers">
        <Layout title="Suppliers">
          <SuppliersContactsPage />
        </Layout>
      </Route>
      <Route path="/suppliers/contacts">
        <Redirect to="/suppliers" />
      </Route>
      <Route path="/mortgages">
        <Layout title="Mortgages">
          <MortgagesPage />
        </Layout>
      </Route>

      {/* Energy — single page now shows Analytics. Sub-routes (invoices,
          legacy accounts) stay accessible until Phase C rebuild. */}
      <Route path="/energy">
        <Layout title="Energy">
          <EnergyAnalyticsPage />
        </Layout>
      </Route>
      <Route path="/energy/invoices">
        <Layout title="Energy Invoices">
          <EnergyInvoicesPage />
        </Layout>
      </Route>
      <Route path="/energy/analytics">
        <Redirect to="/energy" />
      </Route>
      <Route path="/energy/accounts">
        <Layout title="Energy Accounts (legacy)">
          <EnergyPage />
        </Layout>
      </Route>
      <Route path="/energy/sync">
        <Redirect to="/settings" />
      </Route>

      {/* Water — single page for now; Phase C rebuilds with 3-section layout. */}
      <Route path="/water">
        <Layout title="Water">
          <WaterAccountsPage />
        </Layout>
      </Route>
      <Route path="/water/invoices">
        <Layout title="Water Invoices">
          <WaterInvoicesPage />
        </Layout>
      </Route>

      {/* Broadband — unchanged. */}
      <Route path="/broadband">
        <Layout title="Broadband">
          <BroadbandAccountsPage />
        </Layout>
      </Route>

      {/* RULES & DOCS — list at /docs is still the fallback when no doc is
          selected; individual docs render inline. */}
      <Route path="/docs/:slug">
        <Layout title="Operations Manual">
          <DocViewPage />
        </Layout>
      </Route>
      <Route path="/docs">
        <Layout title="Operations Manual">
          <DocsListPage />
        </Layout>
      </Route>

      {/* SETTINGS */}
      <Route path="/settings">
        <Layout title="Settings">
          <SettingsPage />
        </Layout>
      </Route>

      {/* Hidden data-entry surface for portfolio_properties (postcode, RICS,
          purchase date etc). Not in sidebar — reached via the "Edit property
          data" link on /mortgages. Wealth Statement table is the same data,
          just no longer surfaced as a top-level page. */}
      <Route path="/properties">
        <Layout title="Property Register">
          <PortfolioPage />
        </Layout>
      </Route>
      <Route path="/portfolio">
        <Redirect to="/properties" />
      </Route>

      <Route>
        <Redirect to="/dashboard" />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route>
        <AuthGate>
          <AppRoutes />
        </AuthGate>
      </Route>
    </Switch>
  );
}
