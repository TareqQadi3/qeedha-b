import { ImportEntityType } from '@prisma/client';

export interface ImportFieldDef {
  /** Target field name, matches the key ImportsService expects in a resolved row and in columnMapping. */
  field: string;
  label: string;
  required: boolean;
  /** Normalized (see normalizeHeader) header text this field is auto-detected from. */
  aliases: string[];
}

/**
 * One field list per supported entity type - the single source of truth for
 * both the mapping UI (required/optional fields, labels) and
 * ImportsService's per-row DTO construction. Every "reference by name"
 * field (categoryName, unitName, brandName, parentName) is validated
 * against EXISTING tenant data during Validate, never auto-created - see
 * docs/IMPORT_EXCEL.md "Mapping" for why silently creating referenced rows would
 * be an unsafe mapping assumption.
 */
export const IMPORT_FIELD_DEFS: Record<ImportEntityType, ImportFieldDef[]> = {
  products: [
    {
      field: 'sku',
      label: 'SKU',
      required: true,
      aliases: ['sku', 'رمز المنتج', 'كود المنتج', 'كود'],
    },
    {
      field: 'name',
      label: 'اسم المنتج',
      required: true,
      aliases: ['name', 'product name', 'اسم المنتج', 'الاسم'],
    },
    {
      field: 'costPrice',
      label: 'سعر التكلفة',
      required: true,
      aliases: ['cost price', 'cost', 'سعر التكلفة', 'التكلفة'],
    },
    {
      field: 'sellingPrice',
      label: 'سعر البيع',
      required: true,
      aliases: ['selling price', 'price', 'سعر البيع', 'السعر'],
    },
    {
      field: 'categoryName',
      label: 'التصنيف',
      required: false,
      aliases: ['category', 'التصنيف', 'تصنيف'],
    },
    {
      field: 'brandName',
      label: 'العلامة التجارية',
      required: false,
      aliases: ['brand', 'العلامة التجارية', 'الماركة'],
    },
    {
      field: 'unitName',
      label: 'الوحدة',
      required: false,
      aliases: ['unit', 'الوحدة', 'وحدة القياس'],
    },
    { field: 'barcode', label: 'الباركود', required: false, aliases: ['barcode', 'الباركود'] },
    {
      field: 'vatRate',
      label: 'نسبة الضريبة %',
      required: false,
      aliases: ['vat', 'vat rate', 'الضريبة', 'نسبة الضريبة'],
    },
    {
      field: 'minStockThreshold',
      label: 'الحد الأدنى للمخزون',
      required: false,
      aliases: ['min stock', 'الحد الأدنى'],
    },
  ],
  barcodes: [
    {
      field: 'sku',
      label: 'SKU المنتج',
      required: true,
      aliases: ['sku', 'رمز المنتج', 'كود المنتج'],
    },
    { field: 'barcode', label: 'الباركود', required: true, aliases: ['barcode', 'الباركود'] },
  ],
  categories: [
    {
      field: 'name',
      label: 'اسم التصنيف',
      required: true,
      aliases: ['name', 'category', 'اسم التصنيف', 'التصنيف'],
    },
    {
      field: 'parentName',
      label: 'التصنيف الأب',
      required: false,
      aliases: ['parent', 'parent category', 'التصنيف الأب'],
    },
  ],
  units: [
    {
      field: 'name',
      label: 'اسم الوحدة',
      required: true,
      aliases: ['name', 'unit', 'اسم الوحدة', 'الوحدة'],
    },
    { field: 'symbol', label: 'الرمز', required: false, aliases: ['symbol', 'الرمز'] },
  ],
  customers: [
    {
      field: 'name',
      label: 'اسم العميل',
      required: true,
      aliases: ['name', 'customer name', 'اسم العميل', 'الاسم'],
    },
    {
      field: 'phone',
      label: 'الهاتف',
      required: false,
      aliases: ['phone', 'mobile', 'الهاتف', 'الجوال'],
    },
    {
      field: 'email',
      label: 'البريد الإلكتروني',
      required: false,
      aliases: ['email', 'البريد الإلكتروني'],
    },
    { field: 'address', label: 'العنوان', required: false, aliases: ['address', 'العنوان'] },
    {
      field: 'taxNumber',
      label: 'الرقم الضريبي',
      required: false,
      aliases: ['tax number', 'vat number', 'الرقم الضريبي'],
    },
    {
      field: 'reference',
      label: 'رقم مرجعي',
      required: false,
      aliases: ['reference', 'رقم مرجعي', 'الرقم المرجعي'],
    },
  ],
  suppliers: [
    {
      field: 'name',
      label: 'اسم المورد',
      required: true,
      aliases: ['name', 'supplier name', 'اسم المورد', 'الاسم'],
    },
    {
      field: 'contactPerson',
      label: 'مسؤول التواصل',
      required: false,
      aliases: ['contact person', 'contact', 'مسؤول التواصل'],
    },
    {
      field: 'phone',
      label: 'الهاتف',
      required: false,
      aliases: ['phone', 'mobile', 'الهاتف', 'الجوال'],
    },
    {
      field: 'email',
      label: 'البريد الإلكتروني',
      required: false,
      aliases: ['email', 'البريد الإلكتروني'],
    },
    { field: 'address', label: 'العنوان', required: false, aliases: ['address', 'العنوان'] },
    {
      field: 'taxNumber',
      label: 'الرقم الضريبي',
      required: false,
      aliases: ['tax number', 'vat number', 'الرقم الضريبي'],
    },
    {
      field: 'reference',
      label: 'رقم مرجعي',
      required: false,
      aliases: ['reference', 'رقم مرجعي', 'الرقم المرجعي'],
    },
  ],
  opening_stock: [
    {
      field: 'sku',
      label: 'SKU المنتج',
      required: true,
      aliases: ['sku', 'رمز المنتج', 'كود المنتج'],
    },
    { field: 'quantity', label: 'الكمية', required: true, aliases: ['quantity', 'qty', 'الكمية'] },
    { field: 'notes', label: 'ملاحظات', required: false, aliases: ['notes', 'ملاحظات'] },
  ],
};

export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Best-effort auto-suggestion only - never trusted as final (see "عدم
 * افتراض mapping غير آمن" in the Milestone 3 brief). The user always
 * confirms/edits the mapping before Preview runs. Exact normalized-text
 * match wins; otherwise the first header that merely contains the alias (or
 * vice versa) is offered as a weaker suggestion. A field with no confident
 * match is simply left unmapped for the user to pick manually.
 */
export function suggestMapping(
  headers: string[],
  fieldDefs: ImportFieldDef[],
): Record<string, number> {
  const normalizedHeaders = headers.map(normalizeHeader);
  const suggestion: Record<string, number> = {};

  for (const def of fieldDefs) {
    const normalizedAliases = def.aliases.map(normalizeHeader);

    const exactIndex = normalizedHeaders.findIndex((h) => normalizedAliases.includes(h));
    if (exactIndex !== -1) {
      suggestion[def.field] = exactIndex;
      continue;
    }

    const partialIndex = normalizedHeaders.findIndex((h) =>
      normalizedAliases.some((alias) => h.includes(alias) || alias.includes(h)),
    );
    if (partialIndex !== -1) {
      suggestion[def.field] = partialIndex;
    }
  }

  return suggestion;
}
