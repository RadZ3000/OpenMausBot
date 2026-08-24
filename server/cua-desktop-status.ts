/** Classify Cua Driver / Chromium stderr so the Computer panel does not
 *  call a live XFCE desktop a boot failure.
 *
 *  `cua-driver.error.log` is supervisor stderr. Chromium writes GLib GTK
 *  assertions and `pthread_create` EAGAIN there while the VNC thumbnail
 *  still shows a page — and those same lines have preceded a later tab
 *  crash. The log is a real Chromium warning. It is not proof that X or
 *  Cua Driver failed to start. */
export type CuaLogKind = "boot" | "chromium" | "unknown";

export interface CuaDesktopProbe {
  driverReached: boolean;
  healthOk: boolean;
  screenshotOk: boolean;
  probeError: string | null;
  errorLog: string;
}

export interface CuaDesktopResolved {
  desktopReady: boolean;
  desktop_error: string | null;
  desktop_warning: string | null;
}

const BOOT_FAILURE =
  /X display|did not become ready within|health report is failed|incomplete readiness screenshot|expected cua-driver/i;

const PROCESS_CAP =
  /pthread_create: Resource temporarily unavailable|platform_thread_posix|Resource temporarily unavailable/i;

const CHROMIUM_GRAPHICS =
  /g_value_type_compatible|GLib-GObject|browser_main_loop\.cc|ERROR:content\/browser\/|ERROR:gpu\/|SharedImageManager::ProduceMemory|ERROR:ui\/gl\/|ERROR:components\/viz\//i;

function oneLine(text: string, max = 240): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

export function classifyCuaDesktopText(text: string): CuaLogKind {
  const trimmed = text.trim();
  if (!trimmed) return "unknown";
  if (BOOT_FAILURE.test(trimmed)) return "boot";
  if (PROCESS_CAP.test(trimmed) || CHROMIUM_GRAPHICS.test(trimmed)) return "chromium";
  return "unknown";
}

export function cuaChromiumWarning(text: string): string {
  if (PROCESS_CAP.test(text)) {
    return "Chromium inside the VM hit the process cap and the page may crash. Recreate the Local VM to apply a higher limit.";
  }
  return "Chromium inside the VM is reporting graphics errors and the page may crash. The desktop is still running.";
}

export function resolveCuaDesktopStatus(probe: CuaDesktopProbe): CuaDesktopResolved {
  const logKind = classifyCuaDesktopText(probe.errorLog);
  const probeKind = classifyCuaDesktopText(probe.probeError ?? "");
  const chromiumSource = logKind === "chromium" ? probe.errorLog : probeKind === "chromium" ? probe.probeError : null;
  const warning = chromiumSource ? cuaChromiumWarning(chromiumSource) : null;

  if (probe.screenshotOk) {
    return { desktopReady: true, desktop_error: null, desktop_warning: warning };
  }

  if (probe.driverReached && probe.healthOk) {
    if (logKind === "chromium" || probeKind === "chromium") {
      return { desktopReady: true, desktop_error: null, desktop_warning: warning };
    }
    const bootText = logKind === "boot" ? probe.errorLog : probe.probeError;
    return {
      desktopReady: false,
      desktop_error: oneLine(bootText ?? "") || "Cua Driver is not ready yet",
      desktop_warning: warning,
    };
  }

  const desktop_error =
    (logKind === "boot" ? oneLine(probe.errorLog) : null) ||
    (probe.probeError && probeKind !== "chromium" ? oneLine(probe.probeError) : null) ||
    (probeKind === "boot" && probe.probeError ? oneLine(probe.probeError) : null) ||
    "Cua Driver is not ready yet";

  return { desktopReady: false, desktop_error, desktop_warning: warning };
}
