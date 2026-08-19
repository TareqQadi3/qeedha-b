import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { adminApi, clearAdminToken, getAdminToken, setAdminToken } from './adminApi';

export type PlatformAdminRole = 'admin' | 'finance' | 'support' | 'marketing' | 'developer';

interface AdminMe {
  id: string;
  fullName: string;
  email: string;
  role: PlatformAdminRole;
}

interface AdminAuthContextValue {
  admin: AdminMe | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAdminToken()) {
      setLoading(false);
      return;
    }
    adminApi
      .get('/platform-admin/auth/me')
      .then((data) => setAdmin(data))
      .catch(() => clearAdminToken())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await adminApi.post('/platform-admin/auth/login', { email, password });
    setAdminToken(res.accessToken);
    setAdmin(res.admin);
  };

  const logout = () => {
    clearAdminToken();
    setAdmin(null);
  };

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout }}>{children}</AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
