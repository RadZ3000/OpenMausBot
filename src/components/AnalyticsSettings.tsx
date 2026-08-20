import { useState } from "react";

import { analyticsConfigured, analyticsConsent, setAnalyticsConsent } from "@/lib/analytics";
import { Card } from "./SettingsPrimitives";
import { cn } from "@/lib/cn";

/** Renders nothing when the build has no analytics destination, which is the
 * default — an off switch for something that cannot happen is just a worry. */
export function AnalyticsSettings() {
  const [granted, setGranted] = useState(() => analyticsConsent() === true);
  if (!analyticsConfigured()) return null;

  const toggle = () => {
    const next = !granted;
    setAnalyticsConsent(next);
    setGranted(next);
  };

  return (
    <Card title="Usage data" subtitle="Off unless you turn it on. Changes apply immediately.">
      <div className="flex items-center justify-between gap-4">
        <div className="text-[13px] text-ink-secondary">
          {granted
            ? "Sending anonymous usage events: app opens, which engine a message went to, and the counts of bots and rooms you create. Never message contents."
            : "Nothing is being sent. Turning this on shares anonymous usage events — never message contents."}
        </div>
        <button
          role="switch"
          aria-checked={granted}
          aria-label="Share anonymous usage data"
          onClick={toggle}
          className={cn(
            "relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors",
            granted ? "bg-accent" : "bg-raised",
          )}
        >
          <span
            className={cn(
              "absolute top-[3px] size-5 rounded-full bg-white transition-all",
              granted ? "left-[21px]" : "left-[3px]",
            )}
          />
        </button>
      </div>
    </Card>
  );
}
