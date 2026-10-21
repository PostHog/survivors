import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';

/** zod validation for a Hono route, failing in the API's error shape: { error, problems: [{ path, message }] }. */
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const problems = result.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
      return c.json({ error: 'invalid request', problems }, 400);
    }
  });
