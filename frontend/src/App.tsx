import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AccountingPage } from './pages/AccountingPage';
import { CatalogPage } from './pages/CatalogPage';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { ImportPage } from './pages/ImportPage';
import { InventoryPage } from './pages/InventoryPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { LoginPage } from './pages/LoginPage';
import { PosPage } from './pages/PosPage';
import { ProductsPage } from './pages/ProductsPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { QeedhaIntegrationPage } from './pages/QeedhaIntegrationPage';
import { ReceivablesPayablesPage } from './pages/ReceivablesPayablesPage';
import { RegisterPage } from './pages/RegisterPage';
import { ReportsPage } from './pages/ReportsPage';
import { SubscriptionPage } from './pages/SubscriptionPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { useAuth } from './state/auth';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-400">...جارٍ التحميل</div>;
  if (!me) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pos" element={<PosPage />} />
        <Route path="/sales" element={<InvoicesPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/accounting" element={<AccountingPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/receivables-payables" element={<ReceivablesPayablesPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/subscription" element={<SubscriptionPage />} />
        <Route path="/integration" element={<QeedhaIntegrationPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
