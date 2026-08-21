import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// Path A of the first-run chooser: an open-weights model on this machine.
//
// Four things have to be true before a local bot answers — a runtime running,
// the model pulled, a custom-access agent CLI installed, and the bot pointed at
// it. Only the download is both slow and fully ours to do, so that is what this
// screen does; the other three are reported honestly and handed off.
//
// The CLI step is deliberately NOT reimplemented here. Upstream's EngineSetup
// already does it well and appears on the very next screen, so this arm stops
// at "the model is here" and lets that take over.
//
// See docs/plans/2026-08-20-005-three-path-first-run-plan.md.

interface LocalModelStatus {
  model: string;
  /** Sized from this machine's memory, so the offer is never made to a laptop
   * that cannot keep it. */
  tier: "comfortable" | "tight" | "unsupported";
  enoughDisk: boolean;
  runtimeUp: boolean;
  modelReady: boolean;
  agentInstanceId: string;
}

interface Progress {
  label: string;
  fraction: number | null;
}

const RUNTIME_DOWNLOAD = "https://ollama.com/download";

function ProgressBar({ fraction }: { fraction: number | null }) {
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-inset">
      <div
        className={`h-full rounded-full bg-accent ${fraction === null ? "w-1/3 animate-pulse" : ""}`}
        style={fraction === null ? undefined : { width: `${Math.round(fraction * 100)}%` }}
      />
    </div>
  );
}

export function LocalModelArm({ onReady }: { onReady: () => void }) {
  const [status, setStatus] = useState<LocalModelStatus | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/local-model");
      if (!response.ok) throw new Error("Could not check this machine.");
      setStatus(await response.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check this machine.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const download = async () => {
    setError(null);
    setProgress({ label: "Starting the download…", fraction: null });
    try {
      const response = await fetch("/api/local-model/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!response.ok || !response.body) throw new Error("The download could not be started.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // the server streams NDJSON, and a chunk boundary lands mid-object often
      // enough that the leftover has to be carried forward
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim()) continue;
          const event: { status?: string; fraction?: number | null; error?: string } = JSON.parse(part);
          if (event.error) throw new Error(event.error);
          if (event.status) setProgress({ label: event.status, fraction: event.fraction ?? null });
        }
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The download failed.");
    } finally {
      setProgress(null);
    }
  };

  const remove = async () => {
    setRemoving(true);
    setError(null);
    try {
      const response = await fetch("/api/local-model", { method: "DELETE" });
      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "The model could not be removed.");
      }
      await refresh();
      setConfirming(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The model could not be removed.");
    } finally {
      setRemoving(false);
    }
  };

  if (!status) {
    return (
      <p className="mt-1.5 flex items-center gap-2 text-[14px] text-ink-secondary">
        <Loader2 size={15} className="animate-spin" />
        Checking this machine…
      </p>
    );
  }

  // Checked before anything is downloaded. Finding this out after a
  // multi-gigabyte wait is the one failure here with no recovery.
  if (status.tier === "unsupported") {
    return (
      <p className="mt-1.5 text-center text-[14px] leading-relaxed text-ink-secondary">
        This computer doesn&rsquo;t have enough memory to run a model on its own &mdash; it needs
        about 8&nbsp;GB of RAM free and there isn&rsquo;t room. Go back and pick one of the other
        ways instead; they work on any machine.
      </p>
    );
  }

  if (!status.enoughDisk) {
    return (
      <p className="mt-1.5 text-center text-[14px] leading-relaxed text-ink-secondary">
        There isn&rsquo;t enough free space on this drive for the model. Clear a few gigabytes and
        come back, or pick one of the other ways.
      </p>
    );
  }

  if (!status.runtimeUp) {
    return (
      <>
        <p className="mt-1.5 text-center text-[14px] leading-relaxed text-ink-secondary">
          This needs Ollama running on this machine to hold the model. Install it, start it, then
          come back &mdash; nothing else here needs an account.
        </p>
        <a
          href={RUNTIME_DOWNLOAD}
          target="_blank"
          rel="noreferrer"
          className="mt-5 w-full rounded-lg bg-accent py-2.5 text-center text-[15px] font-medium text-white"
        >
          Get Ollama
        </a>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-3 text-[13px] text-ink-secondary hover:text-ink"
        >
          I&rsquo;ve started it &mdash; check again
        </button>
      </>
    );
  }

  if (!status.modelReady) {
    return (
      <>
        <p className="mt-1.5 text-center text-[14px] leading-relaxed text-ink-secondary">
          Downloads <span className="text-ink">{status.model}</span> &mdash; about 2.5 GB, and it
          runs entirely on this machine. Nothing you type will leave it.
        </p>
        {progress ? (
          <>
            <ProgressBar fraction={progress.fraction} />
            <div className="mt-2 text-[12.5px] text-ink-secondary">
              {progress.label}
              {progress.fraction !== null && ` — ${Math.round(progress.fraction * 100)}%`}
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void download()}
            className="mt-5 w-full rounded-lg bg-accent py-2.5 text-[15px] font-medium text-white"
          >
            Download the model
          </button>
        )}
        {error && <div className="mt-2 w-full text-[12.5px] leading-snug text-danger">{error}</div>}
        {/* said before they commit the download, not discovered afterwards */}
        <p className="mt-4 text-center text-[12px] leading-snug text-ink-secondary">
          {status.tier === "tight"
            ? "This computer can run a model, but only a small one, and answers will take minutes rather than seconds. "
            : "A model this size is noticeably weaker at long multi-step tool work than a hosted one, and it can’t drive a computer. "}
          You can switch a bot to another model at any time.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="mt-1.5 text-center text-[14px] leading-relaxed text-ink-secondary">
        <span className="text-ink">{status.model}</span> is on this machine and ready.
        {!status.agentInstanceId &&
          " One local agent CLI still needs installing — the next screen walks through it."}
      </p>
      <button
        type="button"
        onClick={onReady}
        className="mt-5 w-full rounded-lg bg-accent py-2.5 text-[15px] font-medium text-white"
      >
        Continue
      </button>
      {error && <div className="mt-2 w-full text-[12.5px] leading-snug text-danger">{error}</div>}
      {confirming ? (
        <div className="mt-4 w-full rounded-xl bg-card p-3">
          {/* no byte count offered on purpose: the runtime shares layers between
              models, so what is actually freed depends on what else is here */}
          <div className="text-[12.5px] leading-snug text-ink-secondary">
            Remove {status.model} from this computer? It can be downloaded again, but any bot using
            it will need a different model.
          </div>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={removing}
              className="flex items-center gap-1.5 rounded-lg bg-inset px-3 py-1.5 text-[13px] font-medium text-danger disabled:opacity-50"
            >
              {removing && <Loader2 size={13} className="animate-spin" />}
              {removing ? "Removing…" : "Remove"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={removing}
              className="rounded-lg px-3 py-1.5 text-[13px] text-ink-secondary hover:text-ink"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-4 text-[13px] text-ink-secondary hover:text-ink"
        >
          Remove the downloaded model
        </button>
      )}
    </>
  );
}
