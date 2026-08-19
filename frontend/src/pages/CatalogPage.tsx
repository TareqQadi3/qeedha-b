import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Input, PageHeader } from '../components/ui';
import { useAuth } from '../state/auth';

interface Item {
  id: string;
  name: string;
  symbol?: string | null;
}

function EntitySection({
  title,
  endpoint,
  canCreate,
  extraField,
}: {
  title: string;
  endpoint: string;
  canCreate: boolean;
  extraField?: { key: string; label: string };
}) {
  const { t } = useTranslation('catalog');
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');
  const [extra, setExtra] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const load = async () => {
    setListLoading(true);
    setListError(null);
    try {
      setItems(await api.get(endpoint));
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : t('errors.loadFailed'));
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post(endpoint, extraField ? { name, [extraField.key]: extra || undefined } : { name });
      setName('');
      setExtra('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.saveFailed'));
    }
  };

  return (
    <Card>
      <h2 className="mb-3 font-bold text-slate-700">{title}</h2>
      <ErrorBanner message={error} />
      <ErrorBanner message={listError} />
      {listLoading ? (
        <div className="mb-3 text-sm text-slate-400">{t('loading')}</div>
      ) : (
        <ul className="mb-3 max-h-48 space-y-1 overflow-y-auto text-sm">
          {items.map((item) => (
            <li key={item.id} className="rounded bg-slate-50 px-2 py-1">
              {item.name}
              {item.symbol ? ` (${item.symbol})` : ''}
            </li>
          ))}
          {items.length === 0 && <li className="text-slate-400">{t('empty')}</li>}
        </ul>
      )}
      {canCreate && (
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input placeholder={t('fields.name')} value={name} onChange={(e) => setName(e.target.value)} required />
          {extraField && (
            <Input placeholder={extraField.label} value={extra} onChange={(e) => setExtra(e.target.value)} />
          )}
          <Button type="submit" variant="secondary">
            {t('actions.add')}
          </Button>
        </form>
      )}
    </Card>
  );
}

export function CatalogPage() {
  const { t } = useTranslation('catalog');
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('products.create');

  return (
    <div>
      <PageHeader title={t('pageTitle')} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <EntitySection title={t('sections.categories')} endpoint="/catalog/categories" canCreate={canCreate} />
        <EntitySection title={t('sections.brands')} endpoint="/catalog/brands" canCreate={canCreate} />
        <EntitySection
          title={t('sections.units')}
          endpoint="/catalog/units"
          canCreate={canCreate}
          extraField={{ key: 'symbol', label: t('fields.symbol') }}
        />
      </div>
    </div>
  );
}
