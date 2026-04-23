import { Switch, Route, Redirect } from "wouter";
import { useUser } from "@/hooks/useAuth";
import LoginPage from "@/pages/login";
import Layout from "@/components/Layout";
import SuppliersContactsPage from "@/pages/suppliers/Contacts";

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
        <Redirect to="/suppliers/contacts" />
      </Route>
      <Route path="/suppliers/contacts">
        <Layout title="Supplier Contacts">
          <SuppliersContactsPage />
        </Layout>
      </Route>
      <Route>
        <Redirect to="/suppliers/contacts" />
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
