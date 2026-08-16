import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { MAX_IMPORT_ROWS } from './constants/import-limits';

export interface ParsedSheet {
  headers: string[];
  /** Data rows only (header row excluded), each cell already reduced to a primitive. */
  rows: (string | number | null)[][];
}

// .xlsx is a ZIP container - "PK\x03\x04" (or the empty-archive variant
// "PK\x05\x06") is the only reliable, cheap signature check available
// without a heavy content-sniffing dependency. This catches a renamed
// non-Excel file (e.g. a .exe or .html saved as ".xlsx") before it ever
// reaches the parser, independent of whatever Content-Type the client sent.
const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
];

@Injectable()
export class ExcelParserService {
  assertLooksLikeXlsx(buffer: Buffer) {
    const matches = ZIP_SIGNATURES.some((sig) => buffer.subarray(0, 4).equals(sig));
    if (!matches) {
      throw new BadRequestException(
        'الملف ليس بصيغة Excel (.xlsx) صالحة - تحقق من الملف وحاول مجددًا',
      );
    }
  }

  async parse(buffer: Buffer): Promise<ParsedSheet> {
    this.assertLooksLikeXlsx(buffer);

    const workbook = new ExcelJS.Workbook();
    try {
      // exceljs's own type defs declare an ambient `Buffer extends
      // ArrayBuffer` that merges with (and conflicts with) @types/node's
      // real Buffer - a known exceljs typing bug, not a real runtime
      // incompatibility (a real Node Buffer works fine here). `any` is the
      // only escape from the resulting self-inconsistent merged type.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException('تعذّرت قراءة الملف - تأكد أنه ملف Excel (.xlsx) سليم');
    }

    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount === 0) {
      throw new BadRequestException('الملف لا يحتوي على أي بيانات');
    }

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = this.cellToPrimitive(cell)?.toString().trim() ?? '';
    });
    while (headers.length > 0 && !headers[headers.length - 1]) headers.pop();

    if (headers.length === 0) {
      throw new BadRequestException('لم يتم العثور على صف عناوين أعمدة في الملف');
    }

    const dataRowCount = sheet.rowCount - 1;
    if (dataRowCount > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `عدد الصفوف (${dataRowCount}) يتجاوز الحد الأقصى المسموح به (${MAX_IMPORT_ROWS}) لهذه المرحلة - قسّم الملف إلى دفعات أصغر`,
      );
    }

    const rows: (string | number | null)[][] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const values: (string | number | null)[] = [];
      let hasAnyValue = false;
      for (let col = 1; col <= headers.length; col++) {
        const cellValue = this.cellToPrimitive(row.getCell(col));
        if (cellValue !== null) hasAnyValue = true;
        values.push(cellValue);
      }
      // Fully empty rows (common trailing blank rows in real-world exports)
      // are skipped entirely rather than surfaced as confusing "missing
      // required field" errors.
      if (hasAnyValue) rows.push(values);
    }

    return { headers, rows };
  }

  private cellToPrimitive(cell: ExcelJS.Cell): string | number | null {
    const value = cell.value;
    if (value === null || value === undefined) return null;

    if (typeof value === 'object') {
      if (value instanceof Date) return value.toISOString();
      if ('result' in value) {
        // Formula cell - use the last computed result, never the formula
        // text itself (which could be user input we'd otherwise echo back
        // verbatim into an error message or a stored field).
        const result = (value as ExcelJS.CellFormulaValue).result;
        return typeof result === 'number' ? result : (result?.toString() ?? null);
      }
      if ('hyperlink' in value) return (value as ExcelJS.CellHyperlinkValue).text ?? null;
      if ('richText' in value) {
        return (value as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('') || null;
      }
      return null;
    }

    return value as string | number;
  }
}
