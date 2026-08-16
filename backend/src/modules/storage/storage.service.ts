import { Inject, Injectable } from '@nestjs/common';
import { FILE_STORAGE_PROVIDER, FileStorageProvider } from './file-storage-provider.interface';

/**
 * The only thing the rest of the app is allowed to know about file storage:
 * this service, never FileStorageProvider or a concrete driver directly (see
 * StorageModule for how the driver is selected). Also owns the two pieces of
 * key/filename hygiene every caller needs, so they're enforced once instead
 * of at every call site:
 *
 * - buildImportFileKey: the storage key is ALWAYS server-generated from
 *   (companyId, jobId) with a fixed filename - never derived from the
 *   client's original filename - so a malicious filename (path separators,
 *   "..", null bytes, ...) can never influence where a file is written.
 * - sanitizeDisplayFilename: the client's original filename is still shown
 *   back to the user (job history, error messages) for their own
 *   recognition, so it's kept - but stripped down to a safe plain-text
 *   label (control characters and path separators removed) and capped in
 *   length, never used to construct a path.
 */
@Injectable()
export class StorageService {
  constructor(@Inject(FILE_STORAGE_PROVIDER) private readonly provider: FileStorageProvider) {}

  save(key: string, buffer: Buffer): Promise<void> {
    return this.provider.save(key, buffer);
  }

  read(key: string): Promise<Buffer> {
    return this.provider.read(key);
  }

  delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }

  buildImportFileKey(companyId: string, jobId: string): string {
    return `imports/${companyId}/${jobId}/source.xlsx`;
  }

  sanitizeDisplayFilename(originalName: string): string {
    const printableOnly = Array.from(originalName)
      .filter((ch) => {
        const code = ch.codePointAt(0) ?? 0;
        return code >= 0x20 && ch !== '/' && ch !== '\\';
      })
      .join('')
      .trim();
    const safe = printableOnly.length > 0 ? printableOnly : 'file.xlsx';
    return safe.slice(0, 200);
  }
}
