import { describe, expect, it } from "vitest";

import {
  classifyWindowsVirt,
  parseVirtProbeJson,
  virtEnableOuterScript,
  virtEnableSpawn,
  virtProbeSpawn,
  windowsRebootSpawn,
  WINDOWS_FEATURE_ENABLED,
} from "./windows-virt.ts";

describe("classifyWindowsVirt", () => {
  it("turns on a still-disabled feature even if a RebootPending key lingered", () => {
    expect(
      classifyWindowsVirt({
        vmp: WINDOWS_FEATURE_ENABLED,
        wslFeature: 2,
        hypervisorPresent: true,
        rebootPending: true,
      }),
    ).toBe("enable-features");
  });

  it("asks for a restart when both features are on and Windows still owes one", () => {
    expect(
      classifyWindowsVirt({
        vmp: WINDOWS_FEATURE_ENABLED,
        wslFeature: WINDOWS_FEATURE_ENABLED,
        hypervisorPresent: true,
        rebootPending: true,
      }),
    ).toBe("reboot-pending");
  });

  it("turns on Windows features when they are off and no reboot is pending", () => {
    expect(
      classifyWindowsVirt({
        vmp: 2,
        wslFeature: 2,
        hypervisorPresent: true,
        rebootPending: false,
      }),
    ).toBe("enable-features");
  });

  it("is firmware-off only when the hypervisor is absent and features are on", () => {
    expect(
      classifyWindowsVirt({
        vmp: WINDOWS_FEATURE_ENABLED,
        wslFeature: WINDOWS_FEATURE_ENABLED,
        hypervisorPresent: false,
        rebootPending: false,
      }),
    ).toBe("firmware-off");
  });

  it("is ready when features are on, a hypervisor is present, and no reboot is pending", () => {
    expect(
      classifyWindowsVirt({
        vmp: WINDOWS_FEATURE_ENABLED,
        wslFeature: WINDOWS_FEATURE_ENABLED,
        hypervisorPresent: true,
        rebootPending: false,
      }),
    ).toBe("ready");
  });
});

describe("parseVirtProbeJson", () => {
  it("reads the CIM probe", () => {
    expect(
      parseVirtProbeJson(
        '{"vmp":1,"wslFeature":2,"hypervisorPresent":true,"rebootPending":true}',
      ),
    ).toEqual({
      vmp: 1,
      wslFeature: 2,
      hypervisorPresent: true,
      rebootPending: true,
    });
  });
});

describe("spawn shapes", () => {
  it("probes with a written PowerShell file, not iex", () => {
    const launched = virtProbeSpawn("D:\\tmp\\probe.ps1", { SystemRoot: "C:\\Windows" });
    expect(launched.command.replaceAll("/", "\\")).toBe(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
    expect(launched.args).toEqual([
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "D:\\tmp\\probe.ps1",
    ]);
  });

  it("enables features with one elevated PowerShell file that runs DISM", () => {
    const outer = virtEnableOuterScript("D:\\tmp\\enable-inner.ps1");
    expect(outer).toMatch(/-Verb RunAs -Wait/);
    expect(outer).toMatch(/enable-inner\.ps1/);
    const launched = virtEnableSpawn("D:\\tmp\\enable-outer.ps1", { SystemRoot: "C:\\Windows" });
    expect(launched.args).toEqual([
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "D:\\tmp\\enable-outer.ps1",
    ]);
  });

  it("restarts Windows through shutdown.exe argv, not a shell", () => {
    const launched = windowsRebootSpawn({ SystemRoot: "C:\\Windows" });
    expect(launched.command.replaceAll("/", "\\")).toBe("C:\\Windows\\System32\\shutdown.exe");
    expect(launched.args).toEqual(["/r", "/t", "0"]);
  });
});
