// Usage analytics: the wiring that points the policy in analytics-core at
// PostHog, the browser's storage, and this build's destination.
//
// The destination is build configuration rather than a constant, because a
// constant is how a fork ends up reporting its customers to whoever it forked
// from — installs, which engine each message went to, and, through identify(),
// the email addresses collected at onboarding. With VITE_ANALYTICS_KEY unset,
// which is the default here, nothing initialises and no request is made.
//
// Autocapture stays off even when enabled: it ships the $el_text of clicked
// elements, and the sidebar and option cards render model output and message
// previews, so it would leak fragments of private conversations.
import posthog from "posthog-js";

import { createAnalytics, type AnalyticsClient, type AnalyticsProps } from "./analytics-core";

const TOKEN = String(import.meta.env.VITE_ANALYTICS_KEY ?? "");
const HOST = String(import.meta.env.VITE_ANALYTICS_HOST ?? "").trim() || "https://us.i.posthog.com";

const client: AnalyticsClient = {
  init: (token, host) =>
    posthog.init(token, {
      api_host: host,
      autocapture: false, // never capture clicked-element text (conversation leak)
      capture_pageview: false, // single-window desktop app — no page routes
      person_profiles: "identified_only",
      persistence: "localStorage",
    }),
  capture: (event, props) => void posthog.capture(event, props),
  identify: (id, email) => void posthog.identify(id, { email }),
  optOut: () => posthog.opt_out_capturing(),
  reset: () => posthog.reset(),
};

const analytics = createAnalytics(
  client,
  localStorage,
  TOKEN,
  HOST,
  navigator.userAgent.includes("Electron") ? "desktop" : "browser",
);

export const analyticsConfigured = () => analytics.configured();
export const analyticsConsent = () => analytics.consent();
export const analyticsEnabled = () => analytics.enabled();
export const initAnalytics = () => analytics.init();
export const setAnalyticsConsent = (granted: boolean) => analytics.setConsent(granted);
export const track = (event: string, props?: AnalyticsProps) => analytics.track(event, props);
export const identifyEmail = (email: string) => analytics.identifyEmail(email);

// first-run onboarding state. The profile it collects is saved to
// ~/.openmausbot/config.json and shown in the sidebar; it leaves this machine
// only when analytics is both configured and agreed to.
const GATE_KEY = "omb-email-gate";
export function emailGateDone(): boolean {
  return Boolean(localStorage.getItem(GATE_KEY));
}
export function setEmailGateDone(status: "submitted" | "skipped") {
  localStorage.setItem(GATE_KEY, status);
}
