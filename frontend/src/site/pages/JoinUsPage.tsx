import { ChangeEvent, FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../api/client';
import { Button, ErrorBanner, Field, Input } from '../../components/ui';
import { PageHero } from '../components';
import { SitePageContainer } from '../SiteLayout';

const ROLE_SLUGS = [
  'developer',
  'designer',
  'software_expert',
  'marketing',
  'sales',
  'support',
  'consultant',
  'partner',
  'other',
] as const;

const MAX_CV_BYTES = 5 * 1024 * 1024;

/** Public "Join Us" application form - Website phase spec "Join Us / Partners". Posts multipart/form-data straight to the careers module (no auth required, matches CareersController's @Public()). */
export function JoinUsPage() {
  const { t } = useTranslation('site');
  const [form, setForm] = useState<{
    fullName: string;
    email: string;
    mobile: string;
    role: (typeof ROLE_SLUGS)[number];
    message: string;
  }>({ fullName: '', email: '', mobile: '', role: ROLE_SLUGS[0], message: '' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (picked && picked.size > MAX_CV_BYTES) {
      setError(t('joinUs.error'));
      return;
    }
    setFile(picked);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('fullName', form.fullName);
      formData.append('email', form.email);
      if (form.mobile) formData.append('mobile', form.mobile);
      formData.append('role', t(`joinUs.roles.${form.role}`));
      if (form.message) formData.append('message', form.message);
      if (file) formData.append('cv', file);
      await api.postForm('/careers/apply', formData);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('joinUs.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div>
        <PageHero eyebrow={t('nav.joinUs')} title={t('joinUs.title')} />
        <SitePageContainer>
          <div className="mx-auto max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <p className="font-medium text-emerald-800">{t('joinUs.success')}</p>
          </div>
        </SitePageContainer>
      </div>
    );
  }

  return (
    <div>
      <PageHero eyebrow={t('nav.joinUs')} title={t('joinUs.title')} subtitle={t('joinUs.subtitle')} />
      <SitePageContainer>
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
          <form onSubmit={onSubmit} className="space-y-4">
          <ErrorBanner message={error} />
          <Field label={t('joinUs.fields.fullName')}>
            <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          </Field>
          <Field label={t('joinUs.fields.email')}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required dir="ltr" />
          </Field>
          <Field label={t('joinUs.fields.mobile')}>
            <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} dir="ltr" />
          </Field>
          <Field label={t('joinUs.fields.role')}>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as (typeof ROLE_SLUGS)[number] })}
            >
              {ROLE_SLUGS.map((slug) => (
                <option key={slug} value={slug}>
                  {t(`joinUs.roles.${slug}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('joinUs.fields.message')}>
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500"
              rows={3}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </Field>
          <Field label={t('joinUs.fields.cv')}>
            <input type="file" accept="application/pdf" onChange={onFileChange} className="block w-full text-sm text-slate-600" />
          </Field>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t('joinUs.submitting') : t('joinUs.submit')}
          </Button>
          </form>
        </div>
      </SitePageContainer>
    </div>
  );
}
