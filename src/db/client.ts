import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../env';
import * as schema from './schema';

export const getDb = (env: Pick<Env, 'DB'>) => drizzle(env.DB, { schema });
export type Db = ReturnType<typeof getDb>;
