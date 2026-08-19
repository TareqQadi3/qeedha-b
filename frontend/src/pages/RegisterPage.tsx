import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, setSession } from '../api/client';
import { Button, Card, ErrorBanner, Field, Input } from '../components/ui';
import { useAuth } from '../state/auth';

export function RegisterPage() {
  const navigate = useNavigate();
  const { refreshMe } = useAuth();
  const [form, setForm] = useState({
    legalName: '',
    vatNumber: '',
    ownerFullName: '',
    ownerEmail: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = { ...form, vatNumber: form.vatNumber.trim() || undefined };
      const res = await api.post('/auth/register-company', payload, true);
      setSession(res.accessToken, res.refreshToken);
      await refreshMe();
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إنشاء المنشأة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex flex-col items-center gap-2 text-white">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-xl font-extrabold">
            ق
          </div>
          <div className="text-lg font-bold">Qeedha Accounting</div>
        </div>
        <Card className="w-full">
          <h1 className="mb-1 text-xl font-bold text-slate-900">إنشاء منشأة جديدة</h1>
          <p className="mb-5 text-sm text-slate-500">فرع رئيسي ومستودع رئيسي يُنشآن تلقائيًا</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <ErrorBanner message={error} />
            <Field label="اسم المنشأة">
              <Input value={form.legalName} onChange={update('legalName')} required />
            </Field>
            <Field label="الرقم الضريبي (اختياري)">
              <Input value={form.vatNumber} onChange={update('vatNumber')} />
            </Field>
            <Field label="اسمك الكامل">
              <Input value={form.ownerFullName} onChange={update('ownerFullName')} required />
            </Field>
            <Field label="البريد الإلكتروني">
              <Input type="email" value={form.ownerEmail} onChange={update('ownerEmail')} required />
            </Field>
            <Field label="كلمة المرور">
              <Input type="password" minLength={8} value={form.password} onChange={update('password')} required />
            </Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '...جارٍ الإنشاء' : 'إنشاء المنشأة والبدء'}
            </Button>
            <p className="text-center text-sm text-slate-500">
              لديك حساب؟{' '}
              <Link to="/login" className="font-medium text-brand-600 hover:underline">
                تسجيل الدخول
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
