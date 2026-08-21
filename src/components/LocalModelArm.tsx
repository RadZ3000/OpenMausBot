import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

// Path A of the first-run chooser: an open-weights model on this machine.
//
// Chat needs a local runtime, Granite, and Hermes. The arm fetches a pinned
// Ollama zip and launches it (Windows). The Local VM is offered too, but
// Continue is never gated on the VM.
//
// See docs/plans/2026-08-20-005-three-path-first-run-plan.md.

interface LocalModelStatus {
  model: string;
  tier: "comfortable" | "tight" | "unsupported";
  enoughDisk: boolean;
  runtimeUp: boolean;
  modelReady: boolean;
  agentInstanceId: string;
  wslReady: boolean;
  vmReady: boolean;
  vmProblem: string | null;
  canInstallRuntime: boolean;
}

interface NdjsonEvent {
  status?: string;
  fraction?: number | null;
  error?: string;
  done?: boolean;
  skip?: boolean;
  reason?: string;
  vm?: boolean;
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

function Checklist({ status }: { status: LocalModelStatus }) {
  const rows: Array<{ done: boolean; label: string }> = [
    { done: status.runtimeUp, label: "Ollama running" },
    { done: status.modelReady, label: `Model ${status.model}` },
    { done: Boolean(status.agentInstanceId), label: "Hermes agent" },
    { done: status.vmReady, label: status.vmReady ? "Local computer" : "Local computer (optional)" },
  ];
  return (
    <ul className="mt-4 w-full space-y-1.5 text-left text-[13px]">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center gap-2 text-ink-secondary">
          <span className={row.done ? "text-success" : "text-ink-secondary/50"}>{row.done ? "✓" : "○"}</span>
          {row.label}
        </li>
      ))}
    </ul>
  );
}

async function readNdjson(
  response: Response,
  onEvent: (event: NdjsonEvent) => void,
): Promise<NdjsonEvent | undefined> {
  if (!response.ok || !response.body) throw new Error("The request could not be started.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last: NdjsonEvent | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.trim()) continue;
      const event: NdjsonEvent = JSON.parse(part);
      if (event.error) throw new Error(event.error);
      last = event;
      onEvent(event);
    }
  }
  return last;
}

export function LocalModelArm({ onReady }: { onReady: () => void }) {
  const [status, setStatus] = useState<LocalModelStatus | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const vmKickoff = useRef(false);

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

  const installRuntime = async () => {
    setError(null);
    setProgress({ label: "Installing Ollama…", fraction: null });
    try {
      const response = await fetch("/api/local-model/runtime", { method: "POST" });
      await readNdjson(response, (event) => {
        if (event.status) setProgress({ label: event.status, fraction: event.fraction ?? null });
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ollama could not be installed.");
    } finally {
      setProgress(null);
    }
  };

  const download = async () => {
    setError(null);
    setProgress({ label: "Starting the download…", fraction: null });
    try {
      const response = await fetch("/api/local-model/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      await readNdjson(response, (event) => {
        if (event.status) setProgress({ label: event.status, fraction: event.fraction ?? null });
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The download failed.");
    } finally {
      setProgress(null);
    }
  };

  const installAgent = async () => {
    setError(null);
    setProgress({ label: "Installing Hermes…", fraction: null });
    try {
      const response = await fetch("/api/local-model/agent", { method: "POST" });
      await readNdjson(response, (event) => {
        if (event.status) setProgress({ label: event.status, fraction: null });
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Hermes could not be installed.");
    } finally {
      setProgress(null);
    }
  };

  const setupVm = useCallback(async () => {
    setError(null);
    setNotice(null);
    setProgress({ label: "Setting up the Local computer…", fraction: null });
    try {
      const response = await fetch("/api/local-model/vm", { method: "POST" });
      const last = await readNdjson(response, (event) => {
        if (event.status) setProgress({ label: event.status, fraction: null });
      });
      if (last?.skip) {
        setNotice(last.status ?? "The Local computer could not start. You can still chat.");
      }
      await refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "The Local computer could not start. You can still chat.");
    } finally {
      setProgress(null);
    }
  }, [refresh]);

  const installWsl = async () => {
    setError(null);
    setNotice(null);
    setProgress({ label: "Installing WSL…", fraction: null });
    try {
      const response = await fetch("/api/local-model/wsl", { method: "POST" });
      const last = await readNdjson(response, (event) => {
        if (event.status) setProgress({ label: event.status, fraction: null });
      });
      if (last?.skip) {
        setNotice(last.status ?? "WSL did not finish. You can still chat.");
      } else {
        vmKickoff.current = false;
      }
      await refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "WSL did not finish. You can still chat.");
    } finally {
      setProgress(null);
    }
  };

  useEffect(() => {
    if (!status?.runtimeUp || !status.modelReady || !status.agentInstanceId) return;
    if (status.vmReady || !status.wslReady || progress) return;
    if (vmKickoff.current) return;
    vmKickoff.current = true;
    void setupVm();
  }, [status, progress, setupVm]);

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
        <Checklist status={status} />
        <p className="mt-1.5 text-center text-[14px] leading-relaxed text-ink-secondary">
          {status.canInstallRuntime
            ? "This installs a local runtime on this machine to hold the model. About 1.4 GB, no account."
            : "This needs Ollama running on this machine to hold the model. Install it, start it, then come back."}
        </p>
        {progress ? (
          <>
            <ProgressBar fraction={progress.fraction} />
            <div className="mt-2 text-[12.5px] text-ink-secondary">
              {progress.label}
              {progress.fraction !== null && ` — ${Math.round(progress.fraction * 100)}%`}
            </div>
          </>
        ) : status.canInstallRuntime ? (
          <button
            type="button"
            onClick={() => void installRuntime()}
            className="mt-5 w-full rounded-lg bg-accent py-2.5 text-[15px] font-medium text-white"
          >
            Install the local runtime
          </button>
        ) : (
          <a
            href={RUNTIME_DOWNLOAD}
            target="_blank"
            rel="noreferrer"
            className="mt-5 w-full rounded-lg bg-accent py-2.5 text-center text-[15px] font-medium text-white"
          >
            Get Ollama
          </a>
        )}
        {error && <div className="mt-2 w-full text-[12.5px] leading-snug text-danger">{error}</div>}
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
        <Checklist status={status} />
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
        <p className="mt-4 text-center text-[12px] leading-snug text-ink-secondary">
          {status.tier === "tight"
            ? "This computer can run a model, but only a small one, and answers will take minutes rather than seconds. "
            : "A model this size is noticeably weaker at long multi-step tool work than a hosted one. "}
          You can switch a bot to another model at any time.
        </p>
      </>
    );
  }

  if (!status.agentInstanceId) {
    return (
      <>
        <Checklist status={status} />
        <p className="mt-1.5 text-center text-[14px] leading-relaxed text-ink-secondary">
          The model is here. Next is Hermes, the local agent that talks to it. No account, and the
          installer skips its own setup wizard &mdash; we already know the model.
        </p>
        {progress ? (
          <>
            <ProgressBar fraction={progress.fraction} />
            <div className="mt-2 max-h-24 overflow-y-auto text-[12.5px] text-ink-secondary">{progress.label}</div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void installAgent()}
            className="mt-5 w-full rounded-lg bg-accent py-2.5 text-[15px] font-medium text-white"
          >
            Install Hermes
          </button>
        )}
        {error && <div className="mt-2 w-full text-[12.5px] leading-snug text-danger">{error}</div>}
      </>
    );
  }

  return (
    <>
      <Checklist status={status} />
      <p className="mt-1.5 text-center text-[14px] leading-relaxed text-ink-secondary">
        <span className="text-ink">{status.model}</span> and Hermes are ready on this machine.
        {status.vmReady
          ? " A Linux computer is running in the background for desktop work."
          : " Chat works now. A Linux computer can start in the background if this machine allows it."}
      </p>
      {progress && (
        <>
          <ProgressBar fraction={progress.fraction} />
          <div className="mt-2 max-h-24 overflow-y-auto text-[12.5px] text-ink-secondary">{progress.label}</div>
        </>
      )}
      {!status.wslReady && !progress && (
        <button
          type="button"
          onClick={() => void installWsl()}
          className="mt-5 w-full rounded-lg bg-inset py-2.5 text-[15px] font-medium text-ink"
        >
          Install WSL (asks for administrator once)
        </button>
      )}
      {status.wslReady && !status.vmReady && !progress && (
        <button
          type="button"
          onClick={() => void setupVm()}
          className="mt-5 w-full rounded-lg bg-inset py-2.5 text-[15px] font-medium text-ink"
        >
          Set up the Local computer
        </button>
      )}
      <button
        type="button"
        onClick={onReady}
        className="mt-5 w-full rounded-lg bg-accent py-2.5 text-[15px] font-medium text-white"
      >
        Continue
      </button>
      {notice && <div className="mt-2 w-full text-[12.5px] leading-snug text-ink-secondary">{notice}</div>}
      {error && <div className="mt-2 w-full text-[12.5px] leading-snug text-danger">{error}</div>}
      {confirming ? (
        <div className="mt-4 w-full rounded-xl bg-card p-3">
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
