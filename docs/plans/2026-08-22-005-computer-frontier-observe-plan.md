# Frontier fused observe (Local VM / VPS)

Status: **in tree.** Live Claude-on-VM A/B is still **unknown** (no native
tee this change). Parent:
[`2026-08-22-002-computer-use-coworker-loop-plan.md`](2026-08-22-002-computer-use-coworker-loop-plan.md)
P4. Written 2026-08-22.

Product decided this wrapper is required without waiting for a Claude key.
The A/B remains a measurement, not a skip.

This plan does **not** wrap Path A, does **not** rename Cua tools to `vm_*`,
does **not** edit `server/computer-proxy.ts`, and does **not** send JPEGs to
Granite.

## check-upstream-first

Fetched `upstream/main` 2026-08-22. This branch is **33 ahead, 0 behind**.

| Path | Upstream | Fork |
|---|---|---|
| `server/computer-proxy.ts` | owns Box act-and-observe | **do not edit** for Local VM |
| `server/computer-observation.ts` | `ObservationCoordinator`, URL sanitising | import only |
| `server/container-mcp.ts` | transparent Cua stdio bridge | do not parse MCP here |
| `server/observe-computer.ts` | **absent** | fuse + wrap + `wait_for_navigation` |
| `server/observe-computer-mcp.ts` | **absent** | spawned stdio process |

Decision: new files at the existing compact-wrapper seam. One register in
`index.ts` after the inject compact wrap. Bundle entry + `SPAWNED_PROXIES`
because the packaged app has no `node_modules`.

## Problem

Box fuses a screenshot into the **same** MCP result after a UI action.
Frontier engines on Local VM / VPS were on raw `container-mcp`: they only
see the desktop if they call `get_window_state` / `screenshot` themselves.
Cowork computer use is screenshots. Path A cannot take JPEGs (8k, no vision).

## Behaviour

- Non-inject Local VM (`computerKind === "vm"`) and VPS (`"vps"`) prepend
  `observe-computer-mcp` + `--wire=observe-1` in front of `container-mcp` /
  `vps-container-mcp`.
- Host Cua (`args: ["mcp"]`) and Path A (`compact-computer-mcp` already
  first) are left alone. The process exits 2 if the inner is anything else.
- Mutating Cua tools (`click`, `type_text`, `browser_navigate`, …) forward,
  wait `OMB_OBSERVE_SETTLE_MS` (default 350, cap 3000, `"0"` in tests),
  capture `screenshot` then `get_desktop_state { include_screenshot: true }`,
  and fuse through `ObservationCoordinator`. Identical frames get Box’s
  “Don’t repeat the action” text, not a second JPEG. Errors stay errors.
- Look tools (`get_window_state`, `screenshot`, `list_windows`, …) pass
  through. Cua names stay on `tools/list`.
- `wait_for_navigation` is a **model-facing** tool: at most three bounded
  checks of an exact http(s) URL (`normalizeBrowserUrl`, query and fragment
  included). Public text uses `safeBrowserUrl`. No silent hostname retry.
  Bind is `list_windows` → frontmost Chromium → `get_browser_state({pid,
  window_id})` because Cua 0.20 bind mode refuses `{}`.
- Images: pass Cua PNG/JPEG through when the buffer is complete (512-byte
  floor + IEND / JPEG EOI). No image library in `package.json`.

## Out of scope

- Image layer 8 / Chromium `--remote-debugging-port=9222`.
- Host-desktop Cua fused observe.
- Wrapping Claude in `compact-computer-mcp`.
- B-24, Auto routing.

## Verify

```sh
pnpm typecheck
pnpm vitest run server/observe-computer.test.ts server/observe-computer-mcp.test.ts server/compact-computer-tools.test.ts server/computer-observation.test.ts
pnpm test
pnpm lint
```

Live overlay: `index.js` **and** `observe-computer-mcp.js` (both nested
copies under the packaged `resources/server`). Full quit/relaunch. Claude
tee if a key exists — after a click, the **tool result** should contain an
image without a follow-up `screenshot` call from the model. Path A must
still show `vm_*` and no JPEGs.
