export const FILE_STORAGE_PROVIDER = Symbol('FILE_STORAGE_PROVIDER');

/**
 * Provider-agnostic port for storing/reading/deleting file bytes by an
 * opaque key. Callers never see or reason about a filesystem path, a bucket
 * name, or any provider-specific detail - only this interface.
 *
 * LocalFileStorageProvider (this milestone's only implementation) satisfies
 * it against the local disk, so the app is genuinely trialable without any
 * external account. A future S3-compatible provider (AWS S3, MinIO,
 * DigitalOcean Spaces, ...) plugs in behind the exact same interface with no
 * change to any caller - see StorageModule for where it would be wired in
 * (selected by STORAGE_DRIVER). Not implemented in this milestone: no
 * S3-compatible credentials are available to build or verify one against,
 * and inventing an untested implementation would be exactly the "fake
 * success" this project's instructions forbid. The interface below is
 * deliberately minimal so that implementation, whenever it's written, has
 * nothing else to conform to.
 */
export interface FileStorageProvider {
  /** Writes `buffer` under `key`, creating any intermediate structure the provider needs. Overwrites if `key` already exists. */
  save(key: string, buffer: Buffer): Promise<void>;

  /** Reads the bytes stored under `key`. Throws if `key` does not exist. */
  read(key: string): Promise<Buffer>;

  /** Deletes the object at `key`. A no-op (never throws) if `key` does not exist. */
  delete(key: string): Promise<void>;
}
