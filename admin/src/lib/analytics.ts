import type { Me } from '@worker/api-types';

let started = false;

/**
 * Reports how the admin app is used (page views, clicks, session replays) to the PostHog project the games use, identified by the signed-in
 * person's email. Not started on localhost unless the Worker says so (GET /api/me tells us); PostHog's code is loaded after the app is up.
 *
 * Session replay is the sensitive part: the app has an AI key field and shows a prospect's password once. Every input is masked, and the
 * places that show a secret carry `ph-no-capture`, which keeps them out of replays and autocapture altogether. Network headers and bodies
 * (which carry the key, and the chat) are never recorded.
 */
export async function startAnalytics(me: Me) {
  if (started || !me.analytics) return;
  started = true;
  // The build that includes the recorder and everything else PostHog loads lazily, so the page's policy needs to allow no script for it.
  const { default: posthog } = await import('posthog-js/dist/module.full.no-external');
  posthog.init(me.analytics.key, {
    api_host: me.analytics.host,
    person_profiles: 'identified_only',
    capture_pageview: 'history_change',
    capture_pageleave: true,
    disable_surveys: true,
    session_recording: { maskAllInputs: true, recordHeaders: false, recordBody: false },
  });
  posthog.register({ app: 'survivors-admin' });
  posthog.identify(me.email, { email: me.email, name: me.name });
}
