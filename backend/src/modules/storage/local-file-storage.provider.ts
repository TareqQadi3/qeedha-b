import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { FileStorageProvider } from './file-storage-provider.interface';

/**
 * Local-disk implementation of FileStorageProvider - the default and only
 * driver exercised in this milestone (docs/DEPLOYMENT.md "File Storage").
 * All keys are generated server-side (see StorageService.buildImportFileKey)
 * and never contain a client-controlled path segment, but resolvePath()
 * still defends in depth: any key that would resolve outside the configured
 * base directory (e.g. via "..") is rejected rather than silently
 * traversed.
 */
@Injectable()
export class LocalFileStorageProvider implements FileStorageProvider {
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    this.baseDir = path.resolve(config.get<string>('STORAGE_LOCAL_DIR') ?? './storage-data');
  }

  async save(key: string, buffer: Buffer): Promise<void> {
    const target = this.resolvePath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolvePath(key), { force: true });
  }

  private resolvePath(key: string): string {
    const resolved = path.resolve(this.baseDir, key);
    if (resolved !== this.baseDir && !resolved.startsWith(this.baseDir + path.sep)) {
      // Never actually reachable with server-generated keys - a defense-in-depth
      // guard, not a validation path a legitimate caller can hit.
      throw new InternalServerErrorException('مفتاح تخزين غير صالح');
    }
    return resolved;
  }
}
