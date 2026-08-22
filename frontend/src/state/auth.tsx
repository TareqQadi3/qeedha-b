import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, clearSession, getAccessToken, SESSION_EXPIRED_EVENT, setSession } from '../api/client';

export interface Me {
  id: string;
  fullName: string;
  email: string | null;
  mobile: string | null;
  locale: string;
  companyId: string;
  membershipId: string;
  roles: { name: string; branch: string | null }[];
  permissions: string[];
}

export type LoginResult =
  | { kind: 'authenticated' }
  | {
      kind: 'select-tenant';
      tenantSelectionToken: string;
      availableCompanies: { companyId: string; legalName: string; tradeName: string | null }[];
    };

interface AuthContextValue {
  me: Me | null;
  loading: boolean;
  hasPermission: (key: string) => boolean;
  login: (identifier: string, password: string) => Promise<LoginResult>;
  employeeLogin: (
    subscriptionNumber: number,
    branchId: string,
    username: string,
    password: string,
  ) => Promise<void>;
  selectTenant: (tenantSelectionToken: string, companyId: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    if (!getAccessToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.get('/auth/me');
      setMe(data);
    } catch {
      clearSession();
      setMe(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A failed token refresh anywhere in the app (client.ts) means the
  // session is truly gone server-side - drop `me` immediately so
  // RequireAuth (App.tsx) redirects to /login instead of leaving a stale
  // authenticated view up with every subsequent request silently failing.
  useEffect(() => {
    const onSessionExpired = () => setMe(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  const login = async (identifier: string, password: string): Promise<LoginResult> => {
    const res = await api.post('/auth/login', { identifier, password }, true);
    if (res.tenantSelectionRequired) {
      return {
        kind: 'select-tenant',
        tenantSelectionToken: res.tenantSelectionToken,
        availableCompanies: res.availableCompanies,
      };
    }
    setSession(res.accessToken, res.refreshToken);
    await refreshMe();
    return { kind: 'authenticated' };
  };

  const employeeLogin = async (
    subscriptionNumber: number,
    branchId: string,
    username: string,
    password: string,
  ) => {
    const res = await api.post(
      '/auth/employee-login',
      { subscriptionNumber, branchId, username, password },
      true,
    );
    setSession(res.accessToken, res.refreshToken);
    await refreshMe();
  };

  const selectTenant = async (tenantSelectionToken: string, companyId: string) => {
    const res = await api.post('/auth/select-tenant', { tenantSelectionToken, companyId }, true);
    setSession(res.accessToken, res.refreshToken);
    await refreshMe();
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // best-effort - token gets cleared client-side regardless
    }
    clearSession();
    setMe(null);
  };

  const hasPermission = (key: string) => !!me?.permissions.includes(key);

  return (
    <AuthContext.Provider
      value={{ me, loading, hasPermission, login, employeeLogin, selectTenant, logout, refreshMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
