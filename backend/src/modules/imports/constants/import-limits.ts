/**
 * Hard, documented limits for this milestone (docs/IMPORT_EXCEL.md
 * "Performance/limits") - not a general streaming/queue-based importer.
 * The whole file is read into memory once via exceljs; these caps keep that
 * safe. A file breaching either limit is rejected outright, never silently
 * truncated - a truncated import would be exactly the "unexpected partial
 * data" the Milestone 3 brief forbids.
 */
export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 5000;
export const MAX_STORED_VALIDATION_ERRORS = 500;
export const PREVIEW_SAMPLE_ROWS = 20;
