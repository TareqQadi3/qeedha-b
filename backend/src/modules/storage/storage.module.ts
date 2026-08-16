import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FILE_STORAGE_PROVIDER } from './file-storage-provider.interface';
import { LocalFileStorageProvider } from './local-file-storage.provider';
import { StorageService } from './storage.service';

/**
 * `STORAGE_DRIVER` selects the FileStorageProvider implementation bound to
 * FILE_STORAGE_PROVIDER. Only "local" (the default) is implemented in this
 * milestone - see file-storage-provider.interface.ts for why an
 * S3-compatible driver is designed for but not built here. An unrecognized
 * value fails fast at startup rather than silently falling back, same
 * fail-closed philosophy as CORS/env validation elsewhere in this app.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: FILE_STORAGE_PROVIDER,
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('STORAGE_DRIVER') ?? 'local';
        if (driver !== 'local') {
          throw new Error(
            `STORAGE_DRIVER="${driver}" غير مدعوم في هذه المرحلة - "local" فقط متاح حاليًا.`,
          );
        }
        return new LocalFileStorageProvider(config);
      },
      inject: [ConfigService],
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
