import { config } from 'dotenv';
import { resolve } from 'path';

// Loaded before any module (incl. ConfigModule) reads process.env, so the
// app under test connects to qeedha_accounting_test, never the dev database.
config({ path: resolve(__dirname, '../.env.test'), override: true });
