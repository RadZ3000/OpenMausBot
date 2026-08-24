import { describe, expect, it } from "vitest";

import {
  classifyCuaDesktopText,
  cuaChromiumWarning,
  resolveCuaDesktopStatus,
} from "./cua-desktop-status.ts";

const GLIB =
  "[510:510:0824/134804.482916:ERROR:content/browser/browser_main_loop.cc:277] GLib-GObject: g_value_type_compatible: assertion 'src_type' failed";
const PTHREAD =
  "ERROR:base/threading/platform_thread_posix.cc: pthread_create: Resource temporarily unavailable (11)";
const X_DISPLAY = "X display :1 did not become ready within 45 seconds";

describe("classifyCuaDesktopText", () => {
  it("treats supervisor display timeouts as boot failures", () => {
    expect(classifyCuaDesktopText(X_DISPLAY)).toBe("boot");
    expect(classifyCuaDesktopText("Cua health report is failed")).toBe("boot");
  });

  it("treats GLib assertions and pthread EAGAIN as Chromium, not boot", () => {
    expect(classifyCuaDesktopText(GLIB)).toBe("chromium");
    expect(classifyCuaDesktopText(PTHREAD)).toBe("chromium");
  });
});

describe("resolveCuaDesktopStatus", () => {
  it("keeps a real X display failure as a boot error", () => {
    const status = resolveCuaDesktopStatus({
      driverReached: false,
      healthOk: false,
      screenshotOk: false,
      probeError: "driver unavailable",
      errorLog: X_DISPLAY,
    });
    expect(status.desktopReady).toBe(false);
    expect(status.desktop_error).toContain("did not become ready");
    expect(status.desktop_warning).toBeNull();
  });

  it("does not paste GLib lines over a health-report failure", () => {
    const status = resolveCuaDesktopStatus({
      driverReached: true,
      healthOk: false,
      screenshotOk: false,
      probeError: "Cua health report is failed",
      errorLog: GLIB,
    });
    expect(status.desktopReady).toBe(false);
    expect(status.desktop_error).toContain("health report is failed");
    expect(status.desktop_error).not.toMatch(/g_value_type_compatible/);
    expect(status.desktop_warning).toContain("graphics errors");
  });

  it("keeps the desktop ready when Chromium GLib spam fails a screenshot", () => {
    const status = resolveCuaDesktopStatus({
      driverReached: true,
      healthOk: true,
      screenshotOk: false,
      probeError: "get_desktop_state failed",
      errorLog: GLIB,
    });
    expect(status.desktopReady).toBe(true);
    expect(status.desktop_error).toBeNull();
    expect(status.desktop_warning).toBe(cuaChromiumWarning(GLIB));
    expect(status.desktop_warning).toContain("page may crash");
  });

  it("warns that the process cap can crash the page, without a boot failure", () => {
    const status = resolveCuaDesktopStatus({
      driverReached: true,
      healthOk: true,
      screenshotOk: false,
      probeError: "Resource temporarily unavailable",
      errorLog: PTHREAD,
    });
    expect(status.desktopReady).toBe(true);
    expect(status.desktop_error).toBeNull();
    expect(status.desktop_warning).toContain("process cap");
  });

  it("does not dump GLib as the boot error when the driver never answered", () => {
    const status = resolveCuaDesktopStatus({
      driverReached: false,
      healthOk: false,
      screenshotOk: false,
      probeError: "driver unavailable",
      errorLog: GLIB,
    });
    expect(status.desktopReady).toBe(false);
    expect(status.desktop_error).toBe("driver unavailable");
    expect(status.desktop_warning).toContain("graphics errors");
  });
});
