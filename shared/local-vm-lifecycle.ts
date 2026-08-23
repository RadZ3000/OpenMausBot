/** Whether a Local VM should be recreated rather than started.
 * Shared by the harness and the Computer / Settings UI. */
export type LocalVmLifecycleView = {
  container: "running" | "stopped" | "missing";
  imageMatches: boolean;
  managed: boolean;
  network: "loopback" | "unsafe" | "unknown";
  security: "hardened" | "unsafe" | "unknown";
  persistence: "durable" | "unsafe" | "unknown";
};

/** Stale image, unmanaged container, or a broken safety contract. Stopped
 * is not enough — a healthy stopped desktop can resume. */
export function localVmMustRecreate(status: LocalVmLifecycleView): boolean {
  if (status.container === "missing") return false;
  return (
    !status.imageMatches ||
    !status.managed ||
    status.network === "unsafe" ||
    status.security === "unsafe" ||
    status.persistence === "unsafe"
  );
}

export function localVmCanResume(status: LocalVmLifecycleView): boolean {
  return status.container === "stopped" && !localVmMustRecreate(status);
}
