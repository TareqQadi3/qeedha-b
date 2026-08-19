import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Field, PageHeader, Select } from '../components/ui';
import { useAuth } from '../state/auth';
import { formatDateTime } from '../utils/formatDate';

type EntityType =
  | 'products'
  | 'barcodes'
  | 'categories'
  | 'units'
  | 'customers'
  | 'suppliers'
  | 'opening_stock';

const ENTITY_TYPE_LABEL_KEYS: Record<EntityType, string> = {
  products: 'entityTypes.products',
  barcodes: 'entityTypes.barcodes',
  categories: 'entityTypes.categories',
  units: 'entityTypes.units',
  customers: 'entityTypes.customers',
  suppliers: 'entityTypes.suppliers',
  opening_stock: 'entityTypes.opening_stock',
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

const STATUS_LABEL_KEYS: Record<ImportJob['status'], string> = {
  uploaded: 'status.uploaded',
  analyzing: 'status.analyzing',
  ready: 'status.ready',
  validating: 'status.validating',
  validated: 'status.validated',
  importing: 'status.importing',
  completed: 'status.completed',
  failed: 'status.failed',
  cancelled: 'status.cancelled',
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
  const { t } = useTranslation('imports');
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
      setHistoryError(err instanceof ApiError ? err.message : t('errors.loadHistoryFailed'));
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
        setEntityTypesError(err instanceof ApiError ? err.message : t('errors.loadEntityTypesFailed')),
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
      setStepError(t('errors.selectFileFirst'));
      return;
    }
    if (entityType === 'opening_stock' && !targetWarehouseId) {
      setStepError(t('errors.selectWarehouse'));
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
        setStepError(created.failureReason ?? t('errors.analyzeFailed'));
      }
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : t('errors.uploadFailed'));
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
      setStepError(err instanceof ApiError ? err.message : t('errors.saveMappingFailed'));
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
      setStepError(err instanceof ApiError ? err.message : t('errors.previewFailed'));
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
      setStepError(err instanceof ApiError ? err.message : t('errors.validateFailed'));
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
      setStepError(err instanceof ApiError ? err.message : t('errors.confirmFailed'));
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
      setStepError(err instanceof ApiError ? err.message : t('errors.cancelImportFailed'));
    } finally {
      setStepBusy(false);
    }
  };

  if (!hasPermission('import.create')) {
    return <ErrorBanner message={t('errors.noPermission')} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      {entityTypesLoading && <div className="py-6 text-center text-slate-400">{t('common:loading')}</div>}
      <ErrorBanner message={entityTypesError} />

      {!entityTypesLoading && !entityTypesError && (
        <Card>
          {!job && (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={t('fields.entityType')}>
                  <Select
                    value={entityType}
                    onChange={(e) => {
                      setEntityType(e.target.value as EntityType);
                      resetWizard();
                    }}
                  >
                    {entityTypes.map((e) => (
                      <option key={e.entityType} value={e.entityType}>
                        {t(ENTITY_TYPE_LABEL_KEYS[e.entityType])}
                      </option>
                    ))}
                  </Select>
                </Field>
                {entityType === 'opening_stock' && (
                  <Field label={t('fields.targetWarehouse')}>
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
                  {t('fields.requiredFieldsPrefix')}
                  {fieldDefs.filter((f) => f.required).map((f) => f.label).join(t('listSeparator'))}
                  {fieldDefs.some((f) => !f.required) && (
                    <>
                      {' '}
                      {t('fields.optionalFieldsPrefix')}
                      {fieldDefs.filter((f) => !f.required).map((f) => f.label).join(t('listSeparator'))}
                    </>
                  )}
                </div>
              )}

              <Field label={t('fields.excelFile')}>
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm"
                />
              </Field>

              <ErrorBanner message={stepError} />
              <Button onClick={upload} disabled={uploading || !file}>
                {uploading ? t('actions.uploading') : t('actions.uploadAndContinue')}
              </Button>
            </div>
          )}

          {job && job.status === 'failed' && (
            <div className="space-y-3">
              <ErrorBanner message={job.failureReason ?? t('errors.analyzeFailed')} />
              <Button variant="secondary" onClick={resetWizard}>
                {t('actions.tryAnotherFile')}
              </Button>
            </div>
          )}

          {job && (job.status === 'ready' || job.status === 'validated') && job.detectedColumns && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-700">
                {t('mapping.heading', {
                  filename: job.originalFilename,
                  entityType: t(ENTITY_TYPE_LABEL_KEYS[job.entityType]),
                })}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(entityTypes.find((e) => e.entityType === job.entityType)?.fields ?? []).map((f) => (
                  <Field key={f.field} label={`${f.label}${f.required ? ' *' : ''}`}>
                    <Select
                      value={mapping[f.field] ?? ''}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [f.field]: e.target.value }))}
                    >
                      <option value="">{t('mapping.noMapping')}</option>
                      {job.detectedColumns!.map((col, idx) => (
                        <option key={idx} value={idx}>
                          {col || t('mapping.columnFallback', { index: idx + 1 })}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ))}
              </div>
              <ErrorBanner message={stepError} />
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveMapping} disabled={stepBusy}>
                  {stepBusy ? t('actions.saving') : t('actions.saveMapping')}
                </Button>
                {job.columnMapping && (
                  <Button variant="secondary" onClick={runPreview} disabled={stepBusy}>
                    {t('actions.preview')}
                  </Button>
                )}
                {job.columnMapping && (
                  <Button variant="secondary" onClick={runValidate} disabled={stepBusy}>
                    {t('actions.validate')}
                  </Button>
                )}
                <Button variant="danger" onClick={runCancel} disabled={stepBusy}>
                  {t('common:cancel')}
                </Button>
              </div>

              {preview && (
                <div className="rounded-md border border-slate-200 p-3">
                  <div className="mb-2 text-sm">
                    {t('preview.summaryPrefix', { count: preview.totalRows })}
                    <span className="text-emerald-600">{preview.validRowCount}</span>
                    {t('preview.summaryMiddle')}
                    <span className="text-red-600">{preview.errorRowCount}</span>
                  </div>
                  {preview.errorSample.length > 0 && (
                    <div className="max-h-64 overflow-y-auto text-xs">
                      {preview.errorSample.map((row) => (
                        <div key={row.rowNumber} className="border-b py-1 text-red-700">
                          {t('preview.rowError', {
                            rowNumber: row.rowNumber,
                            errors: row.errors.join(t('listSeparator')),
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {job.status === 'validated' && (
                <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                  {t('validate.summary', {
                    validRows: job.validRows,
                    totalRows: job.totalRows,
                    errorRows: job.errorRows,
                  })}
                  {hasPermission('import.create') && (
                    <div className="mt-2">
                      <Button onClick={runConfirm} disabled={stepBusy}>
                        {stepBusy
                          ? t('actions.confirmingImport')
                          : t('actions.confirmImport', { count: job.validRows })}
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
                <div className="py-6 text-center text-slate-400">{t('status.importing')}</div>
              )}
              {job.status === 'completed' && (
                <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                  {job.errorRows
                    ? t('result.completedWithErrors', {
                        importedRows: job.importedRows,
                        errorRows: job.errorRows,
                      })
                    : t('result.completed', { importedRows: job.importedRows })}
                </div>
              )}
              <Button variant="secondary" onClick={resetWizard}>
                {t('actions.newImport')}
              </Button>
            </div>
          )}
        </Card>
      )}

      {hasPermission('import.read') && (
        <Card>
          <div className="mb-3 text-sm font-semibold text-slate-700">{t('history.heading')}</div>
          <ErrorBanner message={historyError} />
          {historyLoading && <div className="py-4 text-center text-slate-400">{t('common:loading')}</div>}
          {!historyLoading && !historyError && (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2">{t('history.table.type')}</th>
                    <th className="py-2">{t('history.table.file')}</th>
                    <th className="py-2">{t('history.table.status')}</th>
                    <th className="py-2">{t('history.table.importedRows')}</th>
                    <th className="py-2">{t('history.table.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="py-2">{t(ENTITY_TYPE_LABEL_KEYS[h.entityType])}</td>
                      <td className="py-2 text-slate-500">{h.originalFilename}</td>
                      <td className="py-2">{t(STATUS_LABEL_KEYS[h.status])}</td>
                      <td className="py-2">{h.importedRows ?? '—'}</td>
                      <td className="py-2 text-slate-500">{formatDateTime(new Date(h.createdAt))}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        {t('history.empty')}
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
