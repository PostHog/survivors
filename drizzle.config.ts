import { defineConfig } from 'drizzle-kit';

// Generates SQL migrations from src/db/schema.ts into migrations/, which `wrangler d1 migrations apply` runs.
export default defineConfig({ dialect: 'sqlite', schema: './src/db/schema.ts', out: './migrations' });
