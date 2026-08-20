// The decision half of usage analytics, kept away from the vendor SDK and the
// browser globals so it can be exercised directly.
//
// The rule it enforces is the one a commercial fork cannot get wrong: nothing
// is sent unless the build was given a destination *and* the person using it
// agreed. Either alone is silence.

export type AnalyticsProps = Record<string, string | number | boolean | undefined>;

/** The slice of the analytics vendor this app actually uses. Narrow on
 * purpose: a faithful stand-in is five methods. */
export interface AnalyticsClient {
  init(token: string, host: string): void;
  capture(event: string, props?: AnalyticsProps): void;
  identify(id: string, email: string): void;
  optOut(): void;
  reset(): void;
}

/** The two methods wanted from `localStorage`, named so the core never has to
 * reach for a browser global. */
export interface AnalyticsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const CONSENT_KEY = "omb-analytics-consent";
const INSTALLED_KEY = "omb-installed";

export interface Analytics {
  /** Whether this build carries a destination at all. When false the settings
   * UI has nothing to offer and every method below is inert. */
  configured(): boolean;
  /** `null` = never asked, which counts as "no" until someone says yes. */
  consent(): boolean | null;
  enabled(): boolean;
  init(): void;
  setConsent(granted: boolean): void;
  track(event: string, props?: AnalyticsProps): void;
  identifyEmail(email: string): void;
}

export function createAnalytics(
  client: AnalyticsClient,
  storage: AnalyticsStorage,
  token: string,
  host: string,
  platform: string,
): Analytics {
  const destination = token.trim();
  let ready = false;

  const configured = () => destination.length > 0;

  const consent = () => {
    const stored = storage.getItem(CONSENT_KEY);
    if (stored === "granted") return true;
    if (stored === "denied") return false;
    return null;
  };

  const enabled = () => configured() && consent() === true;

  const init = () => {
    if (ready || !enabled()) return;
    client.init(destination, host);
    ready = true;
    // one-time install marker — app_first_open counts installs (the closest
    // truth to "downloads that mattered"; raw download counts live on the
    // GitHub release assets)
    if (!storage.getItem(INSTALLED_KEY)) {
      storage.setItem(INSTALLED_KEY, new Date().toISOString());
      client.capture("app_first_open", { platform });
    }
    client.capture("app_opened", { platform });
  };

  return {
    configured,
    consent,
    enabled,
    init,
    // withdrawal has to stop the sending and drop the stored identity, not
    // just flip a label — that identity is the email taken at onboarding
    setConsent: (granted: boolean) => {
      storage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
      if (granted) {
        init();
        return;
      }
      if (!ready) return;
      client.optOut();
      client.reset();
      ready = false;
    },
    track: (event: string, props?: AnalyticsProps) => {
      if (!ready) return;
      client.capture(event, props);
    },
    identifyEmail: (email: string) => {
      if (!ready) return;
      client.identify(email, email);
      client.capture("email_submitted");
    },
  };
}
