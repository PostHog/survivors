export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  UNLOCK_LIMIT: RateLimit;
  LB_LIMIT: RateLimit;
  CHAT_LIMIT: RateLimit;
  /** HMAC key for the unlock cookies (and, later, admin sessions): `wrangler secret put SESSION_SECRET` */
  SESSION_SECRET: string;
  /** Local development only: skips PostHog sign-in and signs this email in. Honoured on localhost, nowhere else. */
  DEV_LOGIN_EMAIL?: string;
  /** Optional: reach the AI providers through a gateway or proxy instead of their public endpoints. */
  ANTHROPIC_BASE_URL?: string;
  OPENAI_BASE_URL?: string;
}

/** The type parameter every Hono router in this app uses. */
export type AppEnv = { Bindings: Env };
/** Routers behind the sign-in: the signed-in person is on c.var.user. */
export type AuthedEnv = { Bindings: Env; Variables: { user: import('./lib/session').User } };
