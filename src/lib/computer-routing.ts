/** Renderer copy of Path A routing policy. The harness
 * (`server/computer-routing.ts`) is the boundary. Keep the host list in
 * sync with `LOCAL_HOSTS` in `server/drivers/local-inject.ts`. */
const INJECT_HOSTS = new Set([
  "omlx",
  "ollama",
  "local_ollama",
  "exo",
  "lmstudio",
  "unsloth",
  "unsloth_api",
]);

export function isLocalInjectModelId(model: string | undefined): boolean {
  if (!model) return false;
  const sep = model.indexOf("::");
  if (sep <= 0) return false;
  return INJECT_HOSTS.has(model.slice(0, sep));
}

export function localInjectCannotAutoDriveComputer(input: {
  model: string | undefined;
  computer: string | undefined;
  cloudBackend?: string;
  autoApprove: boolean;
}): boolean {
  if (!input.autoApprove) return false;
  const onVm = input.computer === "vm";
  const onVps = input.computer === "cloud" && input.cloudBackend === "vps";
  if (!onVm && !onVps) return false;
  return isLocalInjectModelId(input.model);
}

export const LOCAL_INJECT_AUTO_COMPUTER_COPY =
  "A local model on the Local VM cannot use Auto mode for computer tools. Watch the desktop and approve each action, or pick Claude / Grok Agent for unsupervised hands. The Local VM is a sandbox — it does not keep working with the lid shut.";
