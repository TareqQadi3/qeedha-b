import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, Pagination, Select } from '../components/ui';
import { useAuth } from '../state/auth';

interface Product {
  id: string;
  sku: string;
  name: string;
  sellingPrice: string;
  costPrice: string;
  isActive: boolean;
  category?: { name: string } | null;
  brand?: { name: string } | null;
}

interface Option {
  id: string;
  name: string;
}

const emptyForm = { sku: '', name: '', costPrice: '', sellingPrice: '', categoryId: '', brandId: '', unitId: '', barcode: '' };

export function ProductsPage() {
  const { t } = useTranslation('products');
  const { hasPermission } = useAuth();
  const [data, setData] = useState<Product[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0 });
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [units, setUnits] = useState<Option[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const load = async (page = meta.page) => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await api.get('/products', { page, pageSize: meta.pageSize, search: search || undefined });
      setData(res.data);
      setMeta(res.meta);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : t('errors.loadFailed'));
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    api.get('/catalog/categories').then((r) => setCategories(r)).catch(() => undefined);
    api.get('/catalog/brands').then((r) => setBrands(r)).catch(() => undefined);
    api.get('/catalog/units').then((r) => setUnits(r)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    load(1);
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/products', {
        sku: form.sku,
        name: form.name,
        costPrice: Number(form.costPrice),
        sellingPrice: Number(form.sellingPrice),
        categoryId: form.categoryId || undefined,
        brandId: form.brandId || undefined,
        unitId: form.unitId || undefined,
        barcodes: form.barcode ? [form.barcode] : undefined,
      });
      setModalOpen(false);
      setForm(emptyForm);
      await load(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('title')}
        action={
          hasPermission('products.create') && (
            <Button onClick={() => setModalOpen(true)}>{t('actions.new')}</Button>
          )
        }
      />

      <form onSubmit={onSearchSubmit} className="mb-4 flex gap-2">
        <Input
          placeholder={t('search.placeholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="submit" variant="secondary">{t('actions.search')}</Button>
      </form>

      <ErrorBanner message={listError} />
      {listLoading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}
      {!listLoading && (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">{t('table.sku')}</th>
                <th className="py-2">{t('table.name')}</th>
                <th className="py-2">{t('table.category')}</th>
                <th className="py-2">{t('table.brand')}</th>
                <th className="py-2">{t('table.sellingPrice')}</th>
                <th className="py-2">{t('table.status')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{p.sku}</td>
                  <td className="py-2">{p.name}</td>
                  <td className="py-2 text-slate-500">{p.category?.name ?? '—'}</td>
                  <td className="py-2 text-slate-500">{p.brand?.name ?? '—'}</td>
                  <td className="py-2">{p.sellingPrice} {t('table.currency')}</td>
                  <td className="py-2">
                    <span className={p.isActive ? 'text-emerald-600' : 'text-slate-400'}>
                      {p.isActive ? t('status.active') : t('status.inactive')}
                    </span>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    {t('table.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onChange={load} />
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('modal.title')}>
        <form onSubmit={onCreate} className="space-y-3">
          <ErrorBanner message={error} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fields.sku')}>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
            </Field>
            <Field label={t('fields.barcode')}>
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </Field>
          </div>
          <Field label={t('fields.name')}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fields.costPrice')}>
              <Input
                type="number"
                step="0.01"
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                required
              />
            </Field>
            <Field label={t('fields.sellingPrice')}>
              <Input
                type="number"
                step="0.01"
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('fields.category')}>
              <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">{t('fields.none')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('fields.brand')}>
              <Select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
                <option value="">{t('fields.none')}</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('fields.unit')}>
              <Select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
                <option value="">{t('fields.none')}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('actions.saving') : t('actions.save')}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
