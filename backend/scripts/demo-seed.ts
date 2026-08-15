/**
 * Milestone 2 "Demo Data": creates ONE demo merchant (company + branch +
 * warehouse, via the real registration endpoint - never a direct DB
 * insert, so it goes through every real invariant: Chart of Accounts
 * seeding, default roles, etc.) with a handful of demo products, customers,
 * suppliers, a received purchase, and one completed POS sale - enough to
 * open the app and see real, non-empty screens immediately.
 *
 * No real personal data anywhere - every name is explicitly "(Demo)"
 * labelled and every email is @qeedha-demo.local (not a deliverable inbox).
 *
 * Usage (against an already-running, already-migrated+seeded backend):
 *   BASE_URL=http://localhost:3000/api/v1 npx ts-node scripts/demo-seed.ts
 *
 * Prints the demo login credentials to stdout at the end - this script
 * does not persist them anywhere, and is safe to re-run (each run creates
 * a new demo company with a fresh random suffix, never touching prior runs).
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000/api/v1';
const suffix = Math.random().toString(36).slice(2, 8);

async function api(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log(`Seeding demo merchant against ${BASE_URL} ...`);

  const password = 'DemoPass123!';
  const ownerEmail = `demo-owner-${suffix}@qeedha-demo.local`;

  const registered = await api('POST', '/auth/register-company', {
    legalName: `متجر البقالة التجريبي (Demo) ${suffix}`,
    ownerFullName: 'مالك تجريبي (Demo Owner)',
    ownerEmail,
    password,
  });
  const token = registered.accessToken as string;
  console.log(`✔ Demo company created: ${registered.company.legalName}`);

  const warehouses = await api('GET', '/tenancy/warehouses', undefined, token);
  const warehouseId = warehouses[0].id as string;

  const productDefs = [
    { sku: `DEMO-${suffix}-001`, name: 'أرز بسمتي 5 كجم (Demo)', costPrice: 18, sellingPrice: 24 },
    { sku: `DEMO-${suffix}-002`, name: 'زيت زيتون 1 لتر (Demo)', costPrice: 22, sellingPrice: 29 },
    { sku: `DEMO-${suffix}-003`, name: 'سكر أبيض 1 كجم (Demo)', costPrice: 3.5, sellingPrice: 5 },
    { sku: `DEMO-${suffix}-004`, name: 'شاي أحمر 100 كيس (Demo)', costPrice: 9, sellingPrice: 14 },
  ];
  const products: { id: string; sellingPrice: number }[] = [];
  for (const def of productDefs) {
    const product = await api('POST', '/products', def, token);
    products.push({ id: product.id, sellingPrice: def.sellingPrice });
    await api(
      'POST',
      '/inventory/opening-balance',
      { warehouseId, productId: product.id, quantity: 200 },
      token,
    );
  }
  console.log(`✔ ${products.length} demo products created with opening stock`);

  const customerNames = ['بقالة الأمل (Demo Customer)', 'سوبرماركت النور (Demo Customer)'];
  const customerIds: string[] = [];
  for (const name of customerNames) {
    const c = await api('POST', '/customers', { name }, token);
    customerIds.push(c.id);
  }
  console.log(`✔ ${customerIds.length} demo customers created`);

  const supplierNames = ['شركة التوريد الغذائي (Demo Supplier)', 'مؤسسة المواد الأساسية (Demo Supplier)'];
  const supplierIds: string[] = [];
  for (const name of supplierNames) {
    const s = await api('POST', '/suppliers', { name }, token);
    supplierIds.push(s.id);
  }
  console.log(`✔ ${supplierIds.length} demo suppliers created`);

  // One received purchase, so AP/reporting screens have real data too.
  const purchase = await api(
    'POST',
    '/purchases',
    {
      warehouseId,
      supplierId: supplierIds[0],
      items: products.slice(0, 2).map((p) => ({ productId: p.id, quantity: 20, unitCost: p.sellingPrice * 0.7 })),
      clientReferenceId: `demo-purchase-${suffix}`,
    },
    token,
  );
  await api('POST', `/purchases/${purchase.id}/receive`, undefined, token);
  console.log('✔ Demo purchase created and received');

  // One completed POS sale, so Sales/Invoices/Accounting/Reports aren't empty.
  const saleItems = products.slice(0, 2).map((p) => ({ productId: p.id, quantity: 3 }));
  const saleTotal = products
    .slice(0, 2)
    .reduce((sum, p) => sum + round2(p.sellingPrice * 3 * 1.15), 0);
  await api(
    'POST',
    '/sales',
    {
      warehouseId,
      customerId: customerIds[0],
      items: saleItems,
      payments: [{ method: 'cash', amount: round2(saleTotal) }],
      clientReferenceId: `demo-sale-${suffix}`,
    },
    token,
  );
  console.log('✔ Demo POS sale completed');

  console.log('\n--- Demo merchant ready ---');
  console.log(`Login email:    ${ownerEmail}`);
  console.log(`Login password: ${password}`);
  console.log('(These credentials are printed here only - not stored anywhere by this script.)');
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

main().catch((err) => {
  console.error('Demo seed failed:', err);
  process.exit(1);
});
