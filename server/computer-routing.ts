/** Product routing for which engine may drive which computer, unsupervised.
 * Fork-owned: do not put Local VM policy into computer-proxy.ts. */
import { decodeInjectId } from "./drivers/local-inject.ts";

const VM_WIRE = new Set([
  "vm_apps",
  "vm_windows",
  "vm_window",
  "vm_desktop",
  "vm_launch",
  "vm_click",
  "vm_keys",
  "vm_open",
]);

function bareToolName(tool: string): string {
  return tool.replace(/^mcp__[^_]+__/, "").toLowerCase();
}

/** Path A compact catalog. Auto mode must not click these unsupervised. */
export function isLocalInjectComputerTool(tool: string): boolean {
  const bare = bareToolName(tool);
  return bare.startsWith("vm_") || VM_WIRE.has(bare);
}

/** Qwen Code's host-desktop builtins (B-19). Not the Local VM. */
export function isHostDesktopComputerTool(tool: string): boolean {
  return bareToolName(tool).startsWith("computer_use");
}

/** Local-inject on Local VM or an explicit VPS cannot Auto-approve computer tools. */
export function localInjectCannotAutoDriveComputer(input: {
  model: string;
  computer: string | undefined;
  cloudBackend?: string;
  autoApprove: boolean;
}): boolean {
  if (!input.autoApprove) return false;
  const onVm = input.computer === "vm";
  const onVps = input.computer === "cloud" && input.cloudBackend === "vps";
  if (!onVm && !onVps) return false;
  return decodeInjectId(input.model) !== null;
}

export const LOCAL_INJECT_AUTO_COMPUTER_ERROR =
  "a local model on the Local VM or VPS cannot use Auto-approve for computer tools — watch the desktop and approve each action, or pick Claude / grokAgent for unsupervised hands";

/** Windows Path A does not ship host Cua; Qwen's computer_use__* still drive this desktop (B-19). */
export function windowsHostComputerMustCard(tool: string, platform: string): boolean {
  return platform === "win32" && isHostDesktopComputerTool(tool);
}
