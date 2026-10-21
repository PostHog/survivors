// Signing in with PostHog (OAuth 2.0 authorization code + PKCE). The client is identified by a Client ID Metadata Document: our
// client_id is the URL of /oauth/client.json, which PostHog fetches, so there is nothing to register or keep secret.
// Docs: https://posthog.com/docs/api/oauth
import { randomToken, sha256B64Url } from './crypto';

const ISSUER = 'https://oauth.posthog.com'; // routes between PostHog US and EU Cloud
export const AUTHORIZE_URL = `${ISSUER}/oauth/authorize/`;
export const TOKEN_URL = `${ISSUER}/oauth/token/`;
export const USERINFO_URL = `${ISSUER}/oauth/userinfo/`;
const SCOPES = ['openid', 'email'];

/** Only people with a PostHog address may sign in. */
export const ALLOWED_DOMAIN = 'posthog.com';

export const clientId = (origin: string) => `${origin}/oauth/client.json`;
export const redirectUri = (origin: string) => `${origin}/oauth/callback`;

/** The document PostHog fetches at client_id. */
export const clientMetadata = (origin: string) => ({
  client_id: clientId(origin),
  client_name: 'Survivors: PostHog prospect games',
  client_uri: `${origin}/`,
  redirect_uris: [redirectUri(origin)],
  grant_types: ['authorization_code'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  scope: SCOPES.join(' '),
  'com.posthog': { scopes: SCOPES },
});

/** A fresh state and PKCE pair, and the URL to send the browser to. */
export async function startAuthorization(origin: string) {
  const state = randomToken();
  const verifier = randomToken(48);
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(origin),
    redirect_uri: redirectUri(origin),
    scope: SCOPES.join(' '),
    state,
    code_challenge: await sha256B64Url(verifier),
    code_challenge_method: 'S256',
  }).toString();
  return { state, verifier, url: url.toString() };
}

export class SignInError extends Error {}

export interface UserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
}

/** Trades the code for an access token, then asks PostHog who that is. */
export async function fetchUser(origin: string, code: string, verifier: string): Promise<UserInfo> {
  const token = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(origin),
      client_id: clientId(origin),
      code_verifier: verifier,
    }),
  });
  const body = (await token.json().catch(() => ({}))) as { access_token?: string };
  if (!token.ok || !body.access_token) throw new SignInError('PostHog did not accept the sign-in. Try again.');

  const info = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${body.access_token}`, Accept: 'application/json' } });
  if (!info.ok) throw new SignInError('PostHog would not say who you are. Try again.');
  return (await info.json()) as UserInfo;
}

/** The email, if (and only if) PostHog says it is a verified address at ALLOWED_DOMAIN. */
export function allowedEmail(info: UserInfo): string | null {
  const email = typeof info.email === 'string' ? info.email.trim().toLowerCase() : '';
  const at = email.lastIndexOf('@');
  if (at < 1 || email.slice(at + 1) !== ALLOWED_DOMAIN) return null; // exactly posthog.com: not a subdomain, not a lookalike
  return info.email_verified === true ? email : null;
}

export const displayName = (info: UserInfo, email: string) => [info.given_name, info.family_name].filter(Boolean).join(' ') || email;
