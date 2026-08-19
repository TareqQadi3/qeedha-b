import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { affiliateApi, clearAffiliateToken, getAffiliateToken, setAffiliateToken } from './affiliateApi';

interface AffiliateMe {
  id: string;
  fullName: string;
  email: string;
  code: string;
  commissionPercent: string;
  status: 'active' | 'disabled';
}

interface AffiliateAuthContextValue {
  affiliate: AffiliateMe | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AffiliateAuthContext = createContext<AffiliateAuthContextValue | null>(null);

export function AffiliateAuthProvider({ children }: { children: ReactNode }) {
  const [affiliate, setAffiliate] = useState<AffiliateMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAffiliateToken()) {
      setLoading(false);
      return;
    }
    affiliateApi
      .get('/affiliates/me')
      .then((data) => setAffiliate(data))
      .catch(() => clearAffiliateToken())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await affiliateApi.post('/affiliates/login', { email, password });
    setAffiliateToken(res.accessToken);
    setAffiliate(res.affiliate);
  };

  const logout = () => {
    clearAffiliateToken();
    setAffiliate(null);
  };

  return (
    <AffiliateAuthContext.Provider value={{ affiliate, loading, login, logout }}>
      {children}
    </AffiliateAuthContext.Provider>
  );
}

export function useAffiliateAuth() {
  const ctx = useContext(AffiliateAuthContext);
  if (!ctx) throw new Error('useAffiliateAuth must be used within AffiliateAuthProvider');
  return ctx;
}
