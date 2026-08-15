import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Field, Input, Select } from '../components/ui';
import { useAuth } from '../state/auth';

interface Warehouse {
  id: string;
  name: string;
}

interface Customer {
  id: string;
  name: string;
}

interface ProductResult {
  id: string;
  sku: string;
  name: string;
  sellingPrice: string;
  vatRate: string;
  isActive: boolean;
}

interface CartLine {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  vatRate: number;
  quantity: number;
  discountAmount: number;
}

type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';
const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقدًا',
  card: 'بطاقة',
  transfer: 'تحويل',
  other: 'أخرى',
};

interface PaymentLine {
  method: PaymentMethod;
  amount: string;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function newClientReferenceId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * POS screen (docs/POS.md). One golden path: search/scan -> add -> quantity
 * -> (optional customer) -> payment -> complete. The whole cart lives only
 * in this component's state until "إتمام البيع" - there is no server-side
 * held-cart/reservation concept in Phase 3 (docs/POS.md "Offline-first
 * readiness"). The backend is the only source of truth for prices/tax/stock;
 * every total shown here is a client-side preview recomputed from the same
 * formula the server uses, and the server recomputes and validates it again
 * independently on submit.
 */
export function PosPage() {
  const { hasPermission } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<ProductResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: 'cash', amount: '' }]);
  const [clientReferenceId, setClientReferenceId] = useState(newClientReferenceId);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<any | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setPageLoading(true);
      setPageError(null);
      try {
        const wh = await api.get('/tenancy/warehouses');
        setWarehouses(wh);
        setWarehouseId(wh[0]?.id ?? '');
        if (hasPermission('customers.read')) {
          const cust = await api.get('/customers', { pageSize: 100 });
          setCustomers(cust.data);
        }
      } catch (err) {
        setPageError(err instanceof ApiError ? err.message : 'تعذّر تحميل بيانات نقطة البيع');
      } finally {
        setPageLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtotal = round2(cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  const discountTotal = round2(cart.reduce((s, l) => s + l.discountAmount, 0));
  const taxTotal = round2(
    cart.reduce((s, l) => {
      const lineSubtotal = l.unitPrice * l.quantity - l.discountAmount;
      return s + round2((lineSubtotal * l.vatRate) / 100);
    }, 0),
  );
  const totalAmount = round2(subtotal - discountTotal + taxTotal);
  const paymentsSum = round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const paymentsBalanced = cart.length > 0 && Math.abs(paymentsSum - totalAmount) < 0.005;

  const runSearch = async (term: string) => {
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get('/products', { search: term, pageSize: 8 });
      setSearchResults(res.data.filter((p: ProductResult) => p.isActive));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر البحث عن المنتجات');
    } finally {
      setSearching(false);
    }
  };

  const addToCart = (product: ProductResult) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          unitPrice: Number(product.sellingPrice),
          vatRate: Number(product.vatRate),
          quantity: 1,
          discountAmount: 0,
        },
      ];
    });
    setSearchTerm('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  /** Enter = the barcode-scanner path: a scanner types the code then sends Enter. A single exact match adds directly; otherwise the results list (already showing on every keystroke) stays open for a manual click. */
  const onSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!searchTerm.trim()) return;
    try {
      const res = await api.get('/products', { search: searchTerm, pageSize: 8 });
      const active = res.data.filter((p: ProductResult) => p.isActive);
      if (active.length >= 1) addToCart(active[0]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر البحث عن المنتجات');
    }
  };

  const updateLine = (productId: string, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  };

  const removeLine = (productId: string) => {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  };

  const resetForNewSale = () => {
    setCart([]);
    setCustomerId('');
    setPayments([{ method: 'cash', amount: '' }]);
    setClientReferenceId(newClientReferenceId());
    setCompletedSale(null);
    setError(null);
  };

  const addPaymentLine = () => {
    setPayments((prev) => [...prev, { method: 'card', amount: '' }]);
  };

  const removePaymentLine = (index: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const onCompleteSale = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (cart.length === 0) {
      setError('السلة فارغة');
      return;
    }
    if (!paymentsBalanced) {
      setError('مجموع الدفعات يجب أن يساوي الإجمالي بالضبط');
      return;
    }
    setSubmitting(true);
    try {
      const sale = await api.post('/sales', {
        warehouseId,
        customerId: customerId || undefined,
        items: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          discountAmount: l.discountAmount || undefined,
        })),
        payments: payments.map((p) => ({ method: p.method, amount: Number(p.amount) || 0 })),
        clientReferenceId,
      });
      setCompletedSale(sale);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إتمام البيع');
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasPermission('sales.create')) {
    return <ErrorBanner message="لا تملك صلاحية إتمام عمليات البيع" />;
  }

  if (pageLoading) {
    return <div className="py-6 text-center text-slate-400">...جارٍ التحميل</div>;
  }

  if (pageError) {
    return <ErrorBanner message={pageError} />;
  }

  if (completedSale) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <div className="mb-4 text-center">
            <div className="mb-2 text-3xl">✅</div>
            <h2 className="text-lg font-bold text-slate-800">تم إتمام البيع بنجاح</h2>
            <div className="mt-1 font-mono text-sm text-slate-500">
              {completedSale.invoice?.invoiceNumber}
            </div>
          </div>
          <div className="space-y-1 border-t border-slate-200 pt-3 text-sm">
            {completedSale.items.map((it: any) => (
              <div key={it.id} className="flex justify-between text-slate-600">
                <span>
                  {it.productName} × {it.quantity}
                </span>
                <span>{it.lineTotal} ر.س</span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>الإجمالي الفرعي</span>
              <span>{completedSale.subtotal} ر.س</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>الخصم</span>
              <span>{completedSale.discountAmount} ر.س</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>الضريبة</span>
              <span>{completedSale.taxAmount} ر.س</span>
            </div>
            <div className="flex justify-between text-base font-bold text-slate-800">
              <span>الإجمالي</span>
              <span>{completedSale.totalAmount} ر.س</span>
            </div>
          </div>
          <Button className="mt-5 w-full" onClick={resetForNewSale}>
            بيع جديد
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">نقطة البيع</h1>
          <div className="w-48">
            <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <Card>
          <input
            ref={searchInputRef}
            autoFocus
            placeholder="ابحث بالاسم أو SKU أو امسح الباركود..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              runSearch(e.target.value);
            }}
            onKeyDown={onSearchKeyDown}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {searchTerm && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-slate-200">
              {searching && <div className="p-3 text-sm text-slate-400">...جارٍ البحث</div>}
              {!searching && searchResults.length === 0 && (
                <div className="p-3 text-sm text-slate-400">لا نتائج</div>
              )}
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addToCart(p)}
                  className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-right text-sm last:border-0 hover:bg-slate-50"
                >
                  <span>
                    <span className="font-medium text-slate-800">{p.name}</span>
                    <span className="mr-2 font-mono text-xs text-slate-400">{p.sku}</span>
                  </span>
                  <span className="text-slate-600">{p.sellingPrice} ر.س</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="mt-4">
          {cart.length === 0 ? (
            <div className="py-10 text-center text-slate-400">السلة فارغة - ابحث عن منتج لإضافته</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">المنتج</th>
                  <th className="py-2">الكمية</th>
                  <th className="py-2">السعر</th>
                  <th className="py-2">الخصم</th>
                  <th className="py-2">الإجمالي</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((line) => {
                  const lineSubtotal = line.unitPrice * line.quantity - line.discountAmount;
                  const lineTotal = round2(lineSubtotal + round2((lineSubtotal * line.vatRate) / 100));
                  return (
                    <tr key={line.productId} className="border-b last:border-0">
                      <td className="py-2">
                        <div className="font-medium text-slate-800">{line.name}</div>
                        <div className="font-mono text-xs text-slate-400">{line.sku}</div>
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          min={0.001}
                          step="0.001"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(line.productId, { quantity: Number(e.target.value) || 0 })
                          }
                          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-center"
                        />
                      </td>
                      <td className="py-2 text-slate-600">{line.unitPrice} ر.س</td>
                      <td className="py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.discountAmount || ''}
                          placeholder="0"
                          onChange={(e) =>
                            updateLine(line.productId, { discountAmount: Number(e.target.value) || 0 })
                          }
                          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-center"
                        />
                      </td>
                      <td className="py-2 font-medium text-slate-800">{lineTotal} ر.س</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => removeLine(line.productId)}
                          className="text-red-500 hover:text-red-700"
                          aria-label="حذف"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </Card>
      </div>

      <div>
        <Card>
          <ErrorBanner message={error} />

          {hasPermission('customers.read') && (
            <Field label="العميل (اختياري)">
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">عميل نقدي</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>الإجمالي الفرعي</span>
              <span>{subtotal} ر.س</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>الخصم</span>
              <span>{discountTotal} ر.س</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>الضريبة</span>
              <span>{taxTotal} ر.س</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-slate-800">
              <span>الإجمالي</span>
              <span>{totalAmount} ر.س</span>
            </div>
          </div>

          <form onSubmit={onCompleteSale}>
            <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
              <div className="text-sm font-medium text-slate-700">الدفع</div>
              {payments.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Select
                    value={p.method}
                    onChange={(e) =>
                      setPayments((prev) =>
                        prev.map((row, idx) =>
                          idx === i ? { ...row, method: e.target.value as PaymentMethod } : row,
                        ),
                      )
                    }
                    className="w-28"
                  >
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="المبلغ"
                    value={p.amount}
                    onChange={(e) =>
                      setPayments((prev) =>
                        prev.map((row, idx) => (idx === i ? { ...row, amount: e.target.value } : row)),
                      )
                    }
                  />
                  {payments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePaymentLine(i)}
                      className="px-2 text-red-500 hover:text-red-700"
                      aria-label="حذف طريقة دفع"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={addPaymentLine}
                  className="text-xs text-brand-600 hover:underline"
                >
                  + تقسيم الدفع
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPayments([{ method: payments[0]?.method ?? 'cash', amount: String(totalAmount) }])
                  }
                  className="text-xs text-slate-400 hover:underline"
                >
                  ملء المبلغ كاملًا
                </button>
              </div>
              {!paymentsBalanced && payments.some((p) => p.amount) && (
                <div className="text-xs text-amber-600">
                  مجموع الدفعات ({paymentsSum} ر.س) لا يساوي الإجمالي ({totalAmount} ر.س)
                </div>
              )}
            </div>

            <Button type="submit" className="mt-4 w-full" disabled={submitting || cart.length === 0}>
              {submitting ? '...جارٍ إتمام البيع' : 'إتمام البيع'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
