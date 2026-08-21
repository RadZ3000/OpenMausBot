import { useState } from "react";
import { Cloud, Cpu, KeyRound, Loader2 } from "lucide-react";
import { MausAvatar } from "./Avatar";
import { track } from "@/lib/analytics";
import { distribution } from "@/lib/distribution";
import { choosePath, firstRunStep, type InstallPath } from "@/lib/install-path";
import { LocalModelArm } from "./LocalModelArm";

// First run, before anything else: how is this install going to get a working
// bot? Three answers, because they suit genuinely different buyers — see
// docs/plans/2026-08-20-005-three-path-first-run-plan.md.
//
// Mounted as a peer of Onboarding rather than a step inside it. Upstream owns
// and frequently reworks Onboarding.tsx (four files in that surface changed in
// one day on 2026-08-17), so a step added there is a merge we hand-resolve
// forever. As a sibling on the same z-50 tier, DOM order puts this on top and
// upstream's engine step simply finds an engine already available when it runs
// — we change what their code observes rather than their code.
//
// Nothing here is mandatory. Onboarding's rule holds: first run must never
// brick the app, so every arm can be deferred and the app opens anyway.

const ARMS = {
  local: {
    icon: Cpu,
    title: "Run a model on this computer",
    blurb: "Nothing leaves the machine. Needs the hardware to keep up, and a few GB to download.",
  },
  byok: {
    icon: KeyRound,
    title: "Use an API key I already have",
    blurb: "Paste one key. Full-strength models, billed to your own account, working in a few seconds.",
  },
  hosted: {
    icon: Cloud,
    title: "Just let me try it",
    blurb: "No account, no key. A capped trial so you can see it work before deciding.",
  },
} satisfies Record<InstallPath, { icon: typeof Cpu; title: string; blurb: string }>;

/** The arms that exist as UI but are not built yet. Shown rather than hidden,
 * so the shape of the choice is honest from the first build — a menu that
 * quietly has one item reads as a product with one option. */
const NOT_YET = {
  local: undefined,
  byok: undefined,
  hosted: "Coming soon",
} satisfies Record<InstallPath, string | undefined>;

function ArmCard({ path, onPick }: { path: InstallPath; onPick: () => void }) {
  const { icon: Icon, title, blurb } = ARMS[path];
  const pending = NOT_YET[path];
  return (
    <button
      type="button"
      disabled={Boolean(pending)}
      onClick={onPick}
      className="flex w-full items-start gap-3 rounded-xl bg-card p-3.5 text-left enabled:hover:bg-inset disabled:cursor-default disabled:opacity-55"
    >
      <Icon size={17} className="mt-0.5 shrink-0 text-ink-secondary" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-medium text-ink">{title}</span>
          {pending && (
            <span className="rounded-full bg-inset px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide text-ink-secondary">
              {pending}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[12.5px] leading-snug text-ink-secondary">{blurb}</div>
      </div>
    </button>
  );
}

/** Path B. The key is stored through Electron's OS-backed credential store when
 * there is one, and only then is the engine turned on — an engine enabled
 * without a key is an instance that exists and cannot answer. */
function ApiKeyArm({ onConnected }: { onConnected: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    const secret = key.trim();
    if (!secret || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (window.ogb?.setCredential) {
        await window.ogb.setCredential("xaiApiKey", secret);
      } else {
        // browser dev has no credential store; the harness writes config.json
        const saved = await fetch("/api/config", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ xai: { key: secret } }),
        });
        if (!saved.ok) throw new Error("The key could not be saved.");
      }
      const enabled = await fetch("/api/engines/api-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!enabled.ok) {
        const body: { error?: string } = await enabled.json().catch(() => ({}));
        throw new Error(body.error ?? "The engine could not be turned on.");
      }
      track("install_path_completed", { path: "byok" });
      onConnected();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="mt-1.5 text-center text-[14px] leading-relaxed text-ink-secondary">
        Paste an xAI API key. It is stored on this machine and sent only to xAI &mdash; no CLI to
        install and nothing to sign into.
      </p>
      <input
        autoFocus
        type="password"
        value={key}
        onChange={(event) => setKey(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && void connect()}
        placeholder="xai-…"
        spellCheck={false}
        className="mt-5 w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
      />
      {error && <div className="mt-2 w-full text-[12.5px] leading-snug text-danger">{error}</div>}
      <button
        type="button"
        onClick={() => void connect()}
        disabled={!key.trim() || busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[15px] font-medium text-white disabled:opacity-40"
      >
        {busy && <Loader2 size={15} className="animate-spin" />}
        {busy ? "Setting up…" : "Start with this key"}
      </button>
      <a
        className="mt-3 text-[12.5px] text-ink-secondary hover:underline"
        href="https://console.x.ai"
        target="_blank"
        rel="noreferrer"
      >
        Get a key from console.x.ai
      </a>
    </>
  );
}

export function InstallPathChooser() {
  const [step, setStep] = useState(() => firstRunStep(localStorage, distribution.installPaths));
  // Deferring closes the overlay without recording a path, so an install with
  // no engine is asked again next launch rather than left with no way in.
  const [deferred, setDeferred] = useState(false);

  if (step.kind === "done" || deferred) return null;

  const finish = (path: InstallPath) => {
    choosePath(localStorage, path);
    setStep({ kind: "done" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app p-8">
      <div className="flex max-h-full w-full max-w-[460px] flex-col items-center overflow-y-auto rounded-2xl border border-hairline/40 bg-panel p-8">
        <MausAvatar color="green" state="happy" size={72} />
        {step.kind === "choose" ? (
          <>
            <h1 className="mt-4 text-center text-[20px] font-semibold text-ink">
              How should {distribution.productName} run your bots?
            </h1>
            <p className="mt-1.5 text-center text-[14px] leading-relaxed text-ink-secondary">
              Every bot needs a model behind it. Pick the way that suits you &mdash; you can change
              this later.
            </p>
            <div className="mt-5 flex w-full flex-col gap-2">
              {step.options.map((path) => (
                <ArmCard key={path} path={path} onPick={() => setStep({ kind: "setup", path })} />
              ))}
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-center text-[20px] font-semibold text-ink">{ARMS[step.path].title}</h1>
            {step.path === "byok" && <ApiKeyArm onConnected={() => finish("byok")} />}
            {step.path === "local" && <LocalModelArm onReady={() => finish("local")} />}
            {step.path === "hosted" && (
              <p className="mt-1.5 text-center text-[14px] leading-relaxed text-ink-secondary">
                This one isn&rsquo;t built yet.
              </p>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => setDeferred(true)}
          className="mt-4 text-[13px] text-ink-secondary hover:text-ink"
        >
          I&rsquo;ll set this up later
        </button>
      </div>
    </div>
  );
}
