import type { ApiErrorBody, Problem } from '@worker/api-types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message ?? body.error);
  }
  get problems(): Problem[] {
    return this.body.problems ?? [];
  }
}

/** Calls the JSON API. A 401 means the session ended: go and sign in again, then come back here. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  if (res.status === 401) {
    location.assign(`/oauth/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    throw new ApiError(401, { error: 'sign in required' });
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON: use the status text */
  }
  if (!res.ok) throw new ApiError(res.status, (data as ApiErrorBody | null) ?? { error: res.statusText });
  return data as T;
}

/** A sentence for a toast or a form. */
export function describe(e: unknown): string {
  if (e instanceof ApiError) return e.problems.length ? e.problems.map((p) => `${p.path}: ${p.message}`).join('; ') : e.message;
  return e instanceof Error ? e.message : 'Something went wrong';
}
