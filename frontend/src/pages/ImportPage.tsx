import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Field, PageHeader, Select } from '../components/ui';
import { useAuth } from '../state/auth';

type EntityType =
  | 'products'
  | 'barcodes'
  | 'categories'
  | 'units'
  | 'customers'
  | 'suppliers'
  | 'opening_stock';

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  products: 'منتجات',
  barcodes: 'باركود إضافي لمنتجات موجودة',
  categories: 'تصنيفات',
  units: 'وحدات',
  customers: 'عملاء',
  suppliers: 'موردون',
  opening_stock: 'رصيد افتتاحي للمخزون',
};

interface FieldDef {
  field: string;
  label: string;
  required: boolean;
}

interface EntityTypeInfo {
  entityType: EntityType;
  fields: FieldDef[];
}

interface ImportJob {
  id: string;
  entityType: EntityType;
  status:
    | 'uploaded'
    | 'analyzing'
    | 'ready'
    | 'validating'
    | 'validated'
    | 'importing'
    | 'completed'
    | 'failed'
    | 'cancelled';
  targetWarehouseId: string | null;
  originalFilename: string;
  detectedColumns: string[] | null;
  columnMapping: Record<string, number> | null;
  totalRows: number | null;
  validRows: number | null;
  errorRows: number | null;
  importedRows: number | null;
  failureReason: string | null;
  createdAt: string;
}

interface RowResult {
  rowNumber: number;
  valid: boolean;
  errors: string[];
  values: Record<string, unknown>;
}

interface PreviewResult {
  totalRows: number;
  validRowCount: number;
  errorRowCount: number;
  sample: RowResult[];
  errorSample: RowResult[];
}

interface Warehouse {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<ImportJob['status'], string> = {
  uploaded: 'تم الرفع',
  analyzing: '...جارٍ التحليل',
  ready: 'جاهز للربط',
  validating: '...جارٍ التحقق',
  validated: 'تم التحقق',
  importing: '...جارٍ الاستيراد',
  completed: 'مكتمل',
  failed: 'فشل',
  cancelled: 'ملغى',
};

function newClientReferenceId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Excel Import Wizard (Milestone 3). One page walks the full state machine -
 * Upload -> Map -> Preview -> Validate -> Confirm - driven entirely by the
 * real ImportJob returned from each step, never mock data. History below
 * shows past jobs for this company (import.read).
 */
export function ImportPage() {
  const { hasPermission } = useAuth();

  const [entityTypes, setEntityTypes] = useState<EntityTypeInfo[]>([]);
  const [entityTypesLoading, setEntityTypesLoading] = useState(true);
  const [entityTypesError, setEntityTypesError] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [entityType, setEntityType] = useState<EntityType>('products');
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [job, setJob] = useState<ImportJob | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const [uploading, setUploading] = useState(false);
  const [stepBusy, setStepBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const [history, setHistory] = useState<ImportJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await api.get('/imports/jobs', { pageSize: 10 });
      setHistory(res.data);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : 'تعذّر تحميل سجل عمليات الاستيراد');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    setEntityTypesLoading(true);
    api
      .get('/imports/entity-types')
      .then((res) => {
        setEntityTypes(res);
        setEntityTypesError(null);
      })
      .catch((err) =>
        setEntityTypesError(err instanceof ApiError ? err.message : 'تعذّر تحميل أنواع الاستيراد المتاحة'),
      )
      .finally(() => setEntityTypesLoading(false));

    api
      .get('/tenancy/warehouses')
      .then((wh) => {
        setWarehouses(wh);
        setTargetWarehouseId(wh[0]?.id ?? '');
      })
      .catch(() => undefined);

    if (hasPermission('import.read')) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fieldDefs = entityTypes.find((e) => e.entityType === entityType)?.fields ?? [];

  const resetWizard = () => {
    setJob(null);
    setMapping({});
    setPreview(null);
    setFile(null);
    setStepError(null);
  };

  const upload = async () => {
    if (!file) {
      setStepError('اختر ملف Excel (.xlsx) أولًا');
      return;
    }
    if (entityType === 'opening_stock' && !targetWarehouseId) {
      setStepError('اختر المستودع المستهدف للرصيد الافتتاحي');
      return;
    }
    setStepError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.set('entityType', entityType);
      if (entityType === 'opening_stock') form.set('targetWarehouseId', targetWarehouseId);
      form.set('clientReferenceId', newClientReferenceId());
      form.set('file', file);
      const created: ImportJob = await api.postForm('/imports/jobs', form);
      setJob(created);
      if (created.status === 'ready' && created.columnMapping) {
        setMapping(
          Object.fromEntries(
            Object.entries(created.columnMapping).map(([k, v]) => [k, String(v)]),
          ),
        );
      }
      if (created.status === 'failed') {
        setStepError(created.failureReason ?? 'تعذّر تحليل الملف');
      }
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'تعذّر رفع الملف');
    } finally {
      setUploading(false);
    }
  };

  const saveMapping = async () => {
    if (!job) return;
    setStepBusy(true);
    setStepError(null);
    try {
      const numericMapping = Object.fromEntries(
        Object.entries(mapping)
          .filter(([, v]) => v !== '')
          .map(([k, v]) => [k, Number(v)]),
      );
      const updated: ImportJob = await api.patch(`/imports/jobs/${job.id}/mapping`, {
        mapping: numericMapping,
      });
      setJob(updated);
      setPreview(null);
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'تعذّر حفظ ربط الأعمدة');
    } finally {
      setStepBusy(false);
    }
  };

  const runPreview = async () => {
    if (!job) return;
    setStepBusy(true);
    setStepError(null);
    try {
      const res: PreviewResult = await api.get(`/imports/jobs/${job.id}/preview`);
      setPreview(res);
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'تعذّرت المعاينة');
    } finally {
      setStepBusy(false);
    }
  };

  const runValidate = async () => {
    if (!job) return;
    setStepBusy(true);
    setStepError(null);
    try {
      const updated: ImportJob = await api.post(`/imports/jobs/${job.id}/validate`);
      setJob(updated);
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'تعذّر التحقق من صحة البيانات');
    } finally {
      setStepBusy(false);
    }
  };

  const runConfirm = async () => {
    if (!job) return;
    setStepBusy(true);
    setStepError(null);
    try {
      const updated: ImportJob = await api.post(`/imports/jobs/${job.id}/confirm`);
      setJob(updated);
      if (hasPermission('import.read')) loadHistory();
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'تعذّر تأكيد الاستيراد');
    } finally {
      setStepBusy(false);
    }
  };

  const runCancel = async () => {
    if (!job) return;
    setStepBusy(true);
    setStepError(null);
    try {
      await api.post(`/imports/jobs/${job.id}/cancel`);
      resetWizard();
      if (hasPermission('import.read')) loadHistory();
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'تعذّر إلغاء عملية الاستيراد');
    } finally {
      setStepBusy(false);
    }
  };

  if (!hasPermission('import.create')) {
    return <ErrorBanner message="لا تملك صلاحية استيراد البيانات من Excel" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="استيراد من Excel" />

      {entityTypesLoading && <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>}
      <ErrorBanner message={entityTypesError} />

      {!entityTypesLoading && !entityTypesError && (
        <Card>
          {!job && (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="نوع البيانات المستوردة">
                  <Select
                    value={entityType}
                    onChange={(e) => {
                      setEntityType(e.target.value as EntityType);
                      resetWizard();
                    }}
                  >
                    {entityTypes.map((e) => (
                      <option key={e.entityType} value={e.entityType}>
                        {ENTITY_TYPE_LABELS[e.entityType]}
                      </option>
                    ))}
                  </Select>
                </Field>
                {entityType === 'opening_stock' && (
                  <Field label="المستودع المستهدف">
                    <Select value={targetWarehouseId} onChange={(e) => setTargetWarehouseId(e.target.value)}>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>

              {fieldDefs.length > 0 && (
                <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                  الحقول المطلوبة: {fieldDefs.filter((f) => f.required).map((f) => f.label).join('، ')}
                  {fieldDefs.some((f) => !f.required) && (
                    <>
                      {' '}
                      | الحقول الاختيارية: {fieldDefs.filter((f) => !f.required).map((f) => f.label).join('، ')}
                    </>
                  )}
                </div>
              )}

              <Field label="ملف Excel (.xlsx)">
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm"
                />
              </Field>

              <ErrorBanner message={stepError} />
              <Button onClick={upload} disabled={uploading || !file}>
                {uploading ? '...جارٍ الرفع' : 'رفع الملف ومتابعة'}
              </Button>
            </div>
          )}

          {job && job.status === 'failed' && (
            <div className="space-y-3">
              <ErrorBanner message={job.failureReason ?? 'تعذّر تحليل الملف'} />
              <Button variant="secondary" onClick={resetWizard}>
                محاولة برفع ملف آخر
              </Button>
            </div>
          )}

          {job && (job.status === 'ready' || job.status === 'validated') && job.detectedColumns && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-700">
                ربط أعمدة الملف "{job.originalFilename}" بحقول {ENTITY_TYPE_LABELS[job.entityType]}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(entityTypes.find((e) => e.entityType === job.entityType)?.fields ?? []).map((f) => (
                  <Field key={f.field} label={`${f.label}${f.required ? ' *' : ''}`}>
                    <Select
                      value={mapping[f.field] ?? ''}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [f.field]: e.target.value }))}
                    >
                      <option value="">— بلا ربط —</option>
                      {job.detectedColumns!.map((col, idx) => (
                        <option key={idx} value={idx}>
                          {col || `عمود ${idx + 1}`}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ))}
              </div>
              <ErrorBanner message={stepError} />
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveMapping} disabled={stepBusy}>
                  {stepBusy ? '...جارٍ الحفظ' : 'حفظ الربط'}
                </Button>
                {job.columnMapping && (
                  <Button variant="secondary" onClick={runPreview} disabled={stepBusy}>
                    معاينة
                  </Button>
                )}
                {job.columnMapping && (
                  <Button variant="secondary" onClick={runValidate} disabled={stepBusy}>
                    التحقق من صحة البيانات
                  </Button>
                )}
                <Button variant="danger" onClick={runCancel} disabled={stepBusy}>
                  إلغاء
                </Button>
              </div>

              {preview && (
                <div className="rounded-md border border-slate-200 p-3">
                  <div className="mb-2 text-sm">
                    إجمالي الصفوف: {preview.totalRows} — صالحة:{' '}
                    <span className="text-emerald-600">{preview.validRowCount}</span> — بها أخطاء:{' '}
                    <span className="text-red-600">{preview.errorRowCount}</span>
                  </div>
                  {preview.errorSample.length > 0 && (
                    <div className="max-h-64 overflow-y-auto text-xs">
                      {preview.errorSample.map((row) => (
                        <div key={row.rowNumber} className="border-b py-1 text-red-700">
                          الصف {row.rowNumber}: {row.errors.join('، ')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {job.status === 'validated' && (
                <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                  تم التحقق: {job.validRows} صف صالح من {job.totalRows} — {job.errorRows} صف به أخطاء.
                  {hasPermission('import.create') && (
                    <div className="mt-2">
                      <Button onClick={runConfirm} disabled={stepBusy}>
                        {stepBusy ? '...جارٍ الاستيراد' : `تأكيد الاستيراد (${job.validRows} صف)`}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {job && (job.status === 'importing' || job.status === 'completed') && (
            <div className="space-y-3">
              {job.status === 'importing' && (
                <div className="py-6 text-center text-slate-400">...جارٍ الاستيراد</div>
              )}
              {job.status === 'completed' && (
                <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                  اكتمل الاستيراد: {job.importedRows} صف تم استيراده بنجاح
                  {!!job.errorRows && `، ${job.errorRows} صف فشل`}.
                </div>
              )}
              <Button variant="secondary" onClick={resetWizard}>
                استيراد ملف جديد
              </Button>
            </div>
          )}
        </Card>
      )}

      {hasPermission('import.read') && (
        <Card>
          <div className="mb-3 text-sm font-semibold text-slate-700">سجل عمليات الاستيراد</div>
          <ErrorBanner message={historyError} />
          {historyLoading && <div className="py-4 text-center text-slate-400">...جارٍ التحميل</div>}
          {!historyLoading && !historyError && (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2">النوع</th>
                    <th className="py-2">الملف</th>
                    <th className="py-2">الحالة</th>
                    <th className="py-2">الصفوف المستوردة</th>
                    <th className="py-2">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="py-2">{ENTITY_TYPE_LABELS[h.entityType]}</td>
                      <td className="py-2 text-slate-500">{h.originalFilename}</td>
                      <td className="py-2">{STATUS_LABELS[h.status]}</td>
                      <td className="py-2">{h.importedRows ?? '—'}</td>
                      <td className="py-2 text-slate-500">{new Date(h.createdAt).toLocaleString('ar-SA')}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        لا توجد عمليات استيراد بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
