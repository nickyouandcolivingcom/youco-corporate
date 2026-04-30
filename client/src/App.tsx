import { Switch, Route, Redirect } from "wouter";
import { useUser } from "@/hooks/useAuth";
import LoginPage from "@/pages/login";
import Layout from "@/components/Layout";
import SuppliersContactsPage from "@/pages/suppliers/Contacts";
import PortfolioPage from "@/pages/portfolio/Portfolio";
import EnergyPage from "@/pages/energy/Energy";
import EnergyInvoicesPage from "@/pages/energy/Invoices";
import EnergySyncPage from "@/pages/energy/Sync";
import EnergyAnalyticsPage from "@/pages/energy/Analytics";
import WaterAccountsPage from "@/pages/water/Accounts";
import WaterInvoicesPage from "@/pages/water/Invoices";
import MortgagesPage from "@/pages/mortgages/Loans";
import BroadbandAccountsPage from "@/pages/broadband/Accounts";
import DocsListPage from "@/pages/docs/List";
import DocViewPage from "@/pages/docs/View";
import ComingSoon from "@/pages/ComingSoon";

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
        <Redirect to="/portfolio" />
      </Route>
      <Route path="/portfolio">
        <Layout title="Wealth Statement">
          <PortfolioPage />
        </Layout>
      </Route>
      <Route path="/suppliers/contacts">
        <Layout title="Supplier Contacts">
          <SuppliersContactsPage />
        </Layout>
      </Route>
      <Route path="/mortgages">
        <Layout title="Mortgages">
          <MortgagesPage />
        </Layout>
      </Route>
      <Route path="/energy/invoices">
        <Layout title="Energy Invoices">
          <EnergyInvoicesPage />
        </Layout>
      </Route>
      <Route path="/energy/analytics">
        <Layout title="Energy Analytics">
          <EnergyAnalyticsPage />
        </Layout>
      </Route>
      <Route path="/energy/sync">
        <Layout title="Energy Sync (Octopus)">
          <EnergySyncPage />
        </Layout>
      </Route>
      <Route path="/energy">
        <Layout title="Energy Accounts">
          <EnergyPage />
        </Layout>
      </Route>
      <Route path="/water/invoices">
        <Layout title="Water Invoices">
          <WaterInvoicesPage />
        </Layout>
      </Route>
      <Route path="/water">
        <Layout title="Water Accounts">
          <WaterAccountsPage />
        </Layout>
      </Route>
      <Route path="/broadband">
        <Layout title="Broadband">
          <BroadbandAccountsPage />
        </Layout>
      </Route>
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
      <Route>
        <Redirect to="/portfolio" />
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
