import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { applyDroidLocalAuthEnv, DroidAgentDriver, ensureDroidInjectModel } from "./acp/droid.ts";
import { ensureGrokInjectSlug, GrokAgentDriver } from "./acp/grok.ts";
import { applyKimiLocalModelEnv, ensureKimiInjectAlias, KimiAgentDriver } from "./acp/kimi.ts";
import { ensureOpenCodeInjectModel } from "./acp/opencode-go.ts";
import { AntigravityDriver } from "./antigravity.ts";

const FAKE_ACP = join(dirname(fileURLToPath(import.meta.url)), "..", "testing", "fake-acp-cli.ts");
const FAKE_AGY = join(dirname(fileURLToPath(import.meta.url)), "..", "testing", "fake-agy-cli.ts");
import { recordEvents } from "../testing/events.ts";
import {
  ensureHermesAcpMcpRebind,
  ensureHermesAcpMcpWait,
  ensureHermesBashProbeClosesStdin,
  ensureHermesBridgeNoCall,
  ensureHermesBridgeUnwrap,
  ensureHermesComputerDisablesWeb,
  ensureHermesComputerShortNames,
  ensureHermesComputerToolsEager,
  ensureHermesInjectProvider,
  ensureHermesLocalCatalog,
  applyLocalHermesAcpToolsets,
  LOCAL_HERMES_ACP_TOOLSETS,
  LOCAL_HERMES_ACP_TOOLSETS_ENV,
  patchHermesAcpMcpRebindSource,
  patchHermesAcpMcpWaitSource,
  patchHermesBashProbeSource,
  patchHermesBridgeNoCallSource,
  patchHermesBridgeUnwrapSource,
  patchHermesComputerDisablesWebSource,
  patchHermesComputerShortNamesSource,
  patchHermesComputerToolsEagerSource,
  patchHermesLocalCatalogSource,
  resolveHermesGitBashPath,
  resolveHermesHome,
  selectHermesInjectProvider,
} from "./acp/hermes.ts";
import { ensureQwenInjectModel } from "./acp/qwen.ts";
import {
  applyClaudeInject,
  applyOpenAIInject,
  codexLocalProviderArgs,
  decodeInjectId,
  encodeInjectId,
  localInjectOmitsConnectedApps,
  contextWindowsFromPs,
  loadedIdsFromPayloads,
  LOCAL_HOSTS,
  mergeLocalInject,
  resolveInjectId,
} from "./local-inject.ts";

const scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("inject ids", () => {
  it("round-trips a host and API id", () => {
    expect(decodeInjectId(encodeInjectId("omlx", "GLM-5.2-fp8"))).toEqual({
      host: "omlx",
      model: "GLM-5.2-fp8",
    });
  });

  it("rejects official cloud slugs", () => {
    expect(decodeInjectId("claude-sonnet-5")).toBeNull();
    expect(decodeInjectId("gpt-5.6-sol")).toBeNull();
  });

  it("omits connected apps for local-inject picks, not cloud slugs", () => {
    expect(localInjectOmitsConnectedApps("ollama::ibm/granite4.1:3b")).toBe(true);
    expect(localInjectOmitsConnectedApps("claude-sonnet-5")).toBe(false);
    expect(localInjectOmitsConnectedApps(undefined)).toBe(false);
  });
});

describe("contextWindowsFromPs", () => {
  it("reads Ollama's per-model context_length from /api/ps, keyed by full and base id", () => {
    const windows = contextWindowsFromPs({
      models: [
        { name: "qwen3:8b", model: "qwen3:8b", context_length: 40960 },
        { name: "llama3.2:1b", model: "llama3.2:1b", context_length: 8192 },
        { name: "llama3.2:70b", model: "llama3.2:70b", context_length: 131072 },
        { name: "no-ctx:1b", model: "no-ctx:1b" },
        { name: "bad:1b", model: "bad:1b", context_length: -1 },
      ],
    });
    expect(windows.get("qwen3:8b")).toBe(40960);
    expect(windows.get("qwen3")).toBe(40960);
    expect(windows.get("llama3.2:1b")).toBe(8192);
    expect(windows.get("llama3.2:70b")).toBe(131072);
    expect(windows.get("llama3.2")).toBe(8192);
    expect(windows.has("no-ctx:1b")).toBe(false);
    expect(windows.has("bad:1b")).toBe(false);
  });
  it("tolerates payloads that are not a ps listing", () => {
    expect(contextWindowsFromPs(null).size).toBe(0);
    expect(contextWindowsFromPs({ data: [] }).size).toBe(0);
  });
});

describe("resolveInjectId", () => {
  it("keeps an already-encoded inject id", () => {
    expect(resolveInjectId("unsloth::orcarouter/Qwen3.8-27B-Uncensored-GGUF", [])).toBe(
      "unsloth::orcarouter/Qwen3.8-27B-Uncensored-GGUF",
    );
  });

  it("maps a leftover API id onto the live host:: row", () => {
    expect(
      resolveInjectId("orcarouter/Qwen3.8-27B-Uncensored-GGUF", [
        {
          id: "unsloth::orcarouter/Qwen3.8-27B-Uncensored-GGUF",
          host: "unsloth",
          model: "orcarouter/Qwen3.8-27B-Uncensored-GGUF",
          label: "orcarouter/Qwen3.8-27B-Uncensored-GGUF (Unsloth)",
        },
      ]),
    ).toBe("unsloth::orcarouter/Qwen3.8-27B-Uncensored-GGUF");
  });

  it("prefers a loaded host when several serve the same API id", () => {
    expect(
      resolveInjectId("GLM-5.2-fp8", [
        { id: "omlx::GLM-5.2-fp8", host: "omlx", model: "GLM-5.2-fp8", label: "GLM-5.2-fp8 (oMLX)" },
        { id: "lmstudio::GLM-5.2-fp8", host: "lmstudio", model: "GLM-5.2-fp8", label: "GLM-5.2-fp8 (LM Studio)", loaded: true },
      ]),
    ).toBe("lmstudio::GLM-5.2-fp8");
  });
});

describe("loadedIdsFromPayloads", () => {
  const omlx = LOCAL_HOSTS.find((host) => host.id === "omlx")!;
  const ollama = LOCAL_HOSTS.find((host) => host.id === "ollama")!;
  const lmstudio = LOCAL_HOSTS.find((host) => host.id === "lmstudio")!;

  it("uses oMLX /health default_model when no per-model loaded flags exist", () => {
    const loaded = loadedIdsFromPayloads(
      omlx,
      { data: [{ id: "gemma-4-31b-it-bf16" }, { id: "GLM-5.2-fp8" }] },
      { default_model: "gemma-4-31b-it-bf16", engine_pool: { loaded_count: 1 } },
    );
    expect([...loaded]).toEqual(["gemma-4-31b-it-bf16"]);
  });

  it("pins every oMLX /v1/models/status loaded row, not the default_model", () => {
    const loaded = loadedIdsFromPayloads(
      omlx,
      {
        data: [
          { id: "Qwen3.8-27B-Abliterated-MLX-BF16" },
          { id: "gemma-4-31b-it-bf16" },
          { id: "GLM-5.2-fp8" },
        ],
      },
      {
        default_model: "Qwen3.8-27B-Abliterated-MLX-BF16",
        loaded_count: 2,
        models: [
          { id: "Qwen3.8-27B-Abliterated-MLX-BF16", loaded: false },
          { id: "gemma-4-31b-it-bf16", loaded: true },
          { id: "GLM-5.2-fp8", loaded: true },
        ],
      },
    );
    expect([...loaded].sort()).toEqual(["GLM-5.2-fp8", "gemma-4-31b-it-bf16"]);
  });

  it("uses Ollama /api/ps running models", () => {
    const loaded = loadedIdsFromPayloads(
      ollama,
      { data: [{ id: "llama3.2:latest" }, { id: "mistral:latest" }] },
      { models: [{ name: "llama3.2:latest", size: 1 }] },
    );
    expect([...loaded]).toEqual(["llama3.2:latest"]);
  });

  it("pins the catalog id when /api/ps reports a tagged name", () => {
    const loaded = loadedIdsFromPayloads(
      ollama,
      { data: [{ id: "llama3.2" }, { id: "mistral" }] },
      { models: [{ name: "llama3.2:latest", size: 1 }] },
    );
    expect(loaded.has("llama3.2")).toBe(true);
    expect(loaded.has("llama3.2:latest")).toBe(true);
  });

  it("uses LM Studio state=loaded and skips not-loaded", () => {
    const loaded = loadedIdsFromPayloads(
      lmstudio,
      { data: [{ id: "qwen" }, { id: "other" }] },
      { data: [{ id: "qwen", state: "loaded" }, { id: "other", state: "not-loaded" }] },
    );
    expect([...loaded]).toEqual(["qwen"]);
  });

  it("does not pin a default_model that is not in the catalog", () => {
    const loaded = loadedIdsFromPayloads(
      omlx,
      { data: [{ id: "gemma-4-31b-it-bf16" }] },
      { default_model: "someone-elses-model" },
    );
    expect(loaded.size).toBe(0);
  });
});

describe("mergeLocalInject", () => {
  it("marks oMLX /v1/models/status loaded rows, not the default_model", async () => {
    const catalog = await mergeLocalInject(
      { default: "keep", options: [{ id: "keep", label: "Keep" }] },
      { VITEST: "true", OPENMAUSBOT_PROBE_LOCAL_INJECT: "1" },
      async (url) => {
        const href = String(url);
        if (href.includes("/v1/models/status")) {
          return new Response(
            JSON.stringify({
              default_model: "Qwen3.8-27B-Abliterated-MLX-BF16",
              models: [
                { id: "Qwen3.8-27B-Abliterated-MLX-BF16", loaded: false },
                { id: "gemma-4-31b-it-bf16", loaded: true },
                { id: "GLM-5.2-fp8", loaded: true },
              ],
            }),
            { status: 200 },
          );
        }
        if (href.includes(":8080/v1/models")) {
          return new Response(
            JSON.stringify({
              data: [
                { id: "Qwen3.8-27B-Abliterated-MLX-BF16" },
                { id: "gemma-4-31b-it-bf16" },
                { id: "GLM-5.2-fp8" },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response("nope", { status: 500 });
      },
    );
    expect(catalog.options.find((option) => option.id === "omlx::gemma-4-31b-it-bf16")).toMatchObject({
      custom: true,
      loaded: true,
    });
    expect(catalog.options.find((option) => option.id === "omlx::GLM-5.2-fp8")).toMatchObject({
      custom: true,
      loaded: true,
    });
    expect(catalog.options.find((option) => option.id === "omlx::Qwen3.8-27B-Abliterated-MLX-BF16")?.loaded).toBeUndefined();
  });

  it("appends live host models as custom without touching official rows", async () => {
    const catalog = await mergeLocalInject(
      { default: "claude-sonnet-5", options: [{ id: "claude-sonnet-5", label: "Claude Sonnet 5" }] },
      { VITEST: "true", OPENMAUSBOT_PROBE_LOCAL_INJECT: "1" },
      async (url) => {
        if (String(url).includes(":8080")) {
          return new Response(JSON.stringify({ data: [{ id: "GLM-5.2-fp8" }, { id: "nomic-embed" }] }), { status: 200 });
        }
        return new Response("nope", { status: 500 });
      },
    );
    expect(catalog.options[0]).toEqual({ id: "claude-sonnet-5", label: "Claude Sonnet 5" });
    expect(catalog.options.some((option) => option.id === "omlx::GLM-5.2-fp8" && option.custom)).toBe(true);
    expect(catalog.options.some((option) => option.id.includes("nomic"))).toBe(false);
  });

  it("drops a leftover custom API id that a live inject already covers", async () => {
    const catalog = await mergeLocalInject(
      {
        default: "claude-sonnet-5",
        options: [
          { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
          { id: "orcarouter/Qwen3.8-27B-Uncensored-GGUF", label: "orcarouter/Qwen3.8-27B-Uncensored-GGUF", custom: true },
        ],
      },
      { VITEST: "true", OPENMAUSBOT_PROBE_LOCAL_INJECT: "1" },
      async (url) => {
        if (String(url).includes(":8888")) {
          return new Response(JSON.stringify({ data: [{ id: "orcarouter/Qwen3.8-27B-Uncensored-GGUF" }] }), { status: 200 });
        }
        return new Response("nope", { status: 500 });
      },
    );
    expect(catalog.options.some((option) => option.id === "orcarouter/Qwen3.8-27B-Uncensored-GGUF")).toBe(false);
    expect(catalog.options.some((option) => option.id === "unsloth::orcarouter/Qwen3.8-27B-Uncensored-GGUF" && option.custom)).toBe(
      true,
    );
  });
});

describe("applyOpenAIInject", () => {
  it("points an OpenAI-compatible CLI at the local host", () => {
    const env: Record<string, string | undefined> = {};
    const applied = applyOpenAIInject(env, "omlx::MiniMax-M3-4bit");
    expect(applied).toEqual({ model: "MiniMax-M3-4bit", injected: true });
    expect(env.OPENAI_BASE_URL).toBe("http://127.0.0.1:8080/v1");
    expect(env.OPENAI_API_KEY).toBe("omlx");
  });
});

describe("applyClaudeInject", () => {
  it("points Claude at the local host instead of Anthropic", () => {
    const env: Record<string, string | undefined> = {};
    const applied = applyClaudeInject(env, "omlx::MiniMax-M3-4bit");
    expect(applied).toEqual({ model: "MiniMax-M3-4bit", injected: true });
    expect(env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:8080");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("omlx");
    expect(env.ANTHROPIC_MODEL).toBe("MiniMax-M3-4bit");
  });
});

describe("codexLocalProviderArgs", () => {
  it("configures custom providers through env keys without putting credentials on argv", () => {
    const env: Record<string, string | undefined> = { UNSLOTH_STUDIO_AUTH_TOKEN: "unsloth-secret" };
    const args = codexLocalProviderArgs(env, "unsloth::local-model");
    const rendered = JSON.stringify(args);
    expect(rendered).toContain("model_providers.unsloth.base_url");
    expect(rendered).toContain("OPENMAUSBOT_LOCAL_UNSLOTH_API_KEY");
    expect(rendered).not.toContain("unsloth-secret");
    expect(rendered).not.toContain("model_providers.ollama.base_url");
    expect(rendered).not.toContain("model_providers.lmstudio.base_url");
    expect(env.OPENMAUSBOT_LOCAL_UNSLOTH_API_KEY).toBe("unsloth-secret");
  });
});

describe("ensureGrokInjectSlug", () => {
  it("writes a config block the first time and reuses it after", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-grok-inject-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".grok"), { recursive: true });
    writeFileSync(join(home, ".grok", "config.toml"), "[cli]\nchannel = \"alpha\"\n");
    const first = ensureGrokInjectSlug("omlx::GLM-5.2-fp8", { HOME: home });
    const again = ensureGrokInjectSlug("omlx::GLM-5.2-fp8", { HOME: home });
    expect(first).toBe(again);
    const text = readFileSync(join(home, ".grok", "config.toml"), "utf8");
    expect(text).toContain(`model = "GLM-5.2-fp8"`);
    expect(text).toContain(`base_url = "http://127.0.0.1:8080/v1"`);
  });

  it("writes the resolved Unsloth credential instead of a placeholder", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-grok-unsloth-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".grok"), { recursive: true });
    ensureGrokInjectSlug("unsloth::local-model", {
      HOME: home,
      UNSLOTH_STUDIO_AUTH_TOKEN: "unsloth-secret",
    });
    const text = readFileSync(join(home, ".grok", "config.toml"), "utf8");
    expect(text).toContain(`api_key = "unsloth-secret"`);
  });

  it("puts the resolved oMLX slug after agent on the Grok child argv", async () => {
    const home = mkdtempSync(join(tmpdir(), "omb-grok-argv-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".grok"), { recursive: true });
    const dump = join(home, "dump.json");
    const instance = await GrokAgentDriver.create({
      instanceId: "grok-omlx-argv",
      displayName: "Grok",
      environment: { HOME: home, FAKE_ACP_DUMP: dump },
      enabled: true,
      config: { cli: FAKE_ACP, fullAuto: false },
    });
    const recorder = recordEvents(instance.adapter);
    try {
      await instance.adapter.sendTurn({
        threadId: "t-omlx",
        text: "hi",
        model: "omlx::GLM-5.2-fp8",
      });
      await recorder.until((e) => e.type === "turn.completed");
      const argv = JSON.parse(readFileSync(dump, "utf8")).argv as string[];
      const agent = argv.indexOf("agent");
      const modelFlag = argv.indexOf("-m");
      expect(agent).toBeGreaterThan(-1);
      expect(modelFlag).toBeGreaterThan(agent);
      expect(argv.indexOf("stdio")).toBeGreaterThan(modelFlag);
      expect(argv[modelFlag + 1]).toBe("omlx-glm-5.2-fp8");
      const configCalls = JSON.parse(readFileSync(`${dump}.config.json`, "utf8")) as Array<{
        method: string;
        params: { modelId?: string };
      }>;
      expect(configCalls).toContainEqual({
        method: "session/set_model",
        params: { sessionId: "fake-acp-session", modelId: "omlx-glm-5.2-fp8" },
      });
      expect(readFileSync(join(home, ".grok", "config.toml"), "utf8")).toContain(`model = "GLM-5.2-fp8"`);
    } finally {
      await instance.dispose();
    }
  });
});

describe("ensureKimiInjectAlias", () => {
  it("writes an openai_legacy provider and model alias without touching hooks", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-inject-"));
    scratchDirs.push(home);
    const root = join(home, ".kimi-code");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "config.toml"), "# keep me\n[[hooks]]\nevent = \"Stop\"\n");
    const first = ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home });
    const again = ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home });
    expect(first).toBe("omlx/GLM-5.2-fp8");
    expect(again).toBe(first);
    const text = readFileSync(join(root, "config.toml"), "utf8");
    expect(text).toContain("[[hooks]]");
    expect(text.match(/\[providers\.omlx\]/g)?.length).toBe(1);
    expect(text).toContain(`base_url = "http://127.0.0.1:8080/v1"`);
    expect(text).toContain(`model = "GLM-5.2-fp8"`);
    expect(text).toContain(`protocol = "openai"`);
    expect(text).toContain(`max_context_size = 262144`);
  });

  it("amends an existing alias with protocol and context size and leaves user keys", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-patch-"));
    scratchDirs.push(home);
    const root = join(home, ".kimi-code");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "config.toml"),
      [
        "[[hooks]]",
        'event = "Stop"',
        "",
        "[providers.omlx]",
        'type = "openai_legacy"',
        'base_url = "http://127.0.0.1:8080/v1"',
        'api_key = "omlx"',
        "",
        '[models."omlx/GLM-5.2-fp8"]',
        'provider = "omlx"',
        'model = "GLM-5.2-fp8"',
        'display_name = "keep me"',
        "",
      ].join("\n"),
    );
    expect(ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home })).toBe("omlx/GLM-5.2-fp8");
    expect(ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home })).toBe("omlx/GLM-5.2-fp8");
    const text = readFileSync(join(root, "config.toml"), "utf8");
    expect(text).toContain("[[hooks]]");
    expect(text).toContain('display_name = "keep me"');
    expect(text).toContain('provider = "omlx"');
    expect(text).toContain('model = "GLM-5.2-fp8"');
    expect(text.match(/protocol = "openai"/g)?.length).toBe(1);
    expect(text.match(/max_context_size = 262144/g)?.length).toBe(1);
  });

  it("does not overwrite a user's protocol or context size", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-keep-"));
    scratchDirs.push(home);
    const root = join(home, ".kimi-code");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "config.toml"),
      [
        '[models."omlx/GLM-5.2-fp8"]',
        'provider = "omlx"',
        'model = "GLM-5.2-fp8"',
        'protocol = "openai_responses"',
        "max_context_size = 8192",
        "",
      ].join("\n"),
    );
    ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home });
    const text = readFileSync(join(root, "config.toml"), "utf8");
    expect(text).toContain('protocol = "openai_responses"');
    expect(text).toContain("max_context_size = 8192");
    expect(text).not.toContain('protocol = "openai"');
    expect(text).not.toContain("max_context_size = 262144");
  });

  it("treats a quoted protocol key as already set and does not duplicate it", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-quoted-"));
    scratchDirs.push(home);
    const root = join(home, ".kimi-code");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "config.toml"),
      [
        '[models."omlx/GLM-5.2-fp8"]',
        'provider = "omlx"',
        'model = "GLM-5.2-fp8"',
        '"protocol" = "openai"',
        "",
      ].join("\n"),
    );
    ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home });
    const text = readFileSync(join(root, "config.toml"), "utf8");
    expect(text.match(/protocol/g)?.length).toBe(1);
    expect(text).toContain("max_context_size = 262144");
  });

  it("finds a heading with a trailing comment and does not append a second table", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-heading-"));
    scratchDirs.push(home);
    const root = join(home, ".kimi-code");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "config.toml"),
      ['[models."omlx/GLM-5.2-fp8"] # keep', 'provider = "omlx"', 'model = "GLM-5.2-fp8"', ""].join("\n"),
    );
    ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home });
    const text = readFileSync(join(root, "config.toml"), "utf8");
    expect(text.match(/\[models\./g)?.length).toBe(1);
    expect(text).toContain("# keep");
    expect(text).toContain('protocol = "openai"');
  });

  it("does not hide a model table behind an apostrophe in a preceding comment", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-apos-"));
    scratchDirs.push(home);
    const root = join(home, ".kimi-code");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "config.toml"),
      [
        "# user's setting",
        '[models."omlx/GLM-5.2-fp8"]',
        'provider = "omlx"',
        'model = "GLM-5.2-fp8"',
        "",
      ].join("\n"),
    );
    ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home });
    const text = readFileSync(join(root, "config.toml"), "utf8");
    expect(text.match(/\[models\./g)?.length).toBe(1);
    expect(text).toContain("# user's setting");
    expect(text).toContain('protocol = "openai"');
    expect(text).toContain("max_context_size = 262144");
  });

  it("stops a model table before a following array-of-tables heading", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-aot-"));
    scratchDirs.push(home);
    const root = join(home, ".kimi-code");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "config.toml"),
      [
        '[models."omlx/GLM-5.2-fp8"]',
        'provider = "omlx"',
        'model = "GLM-5.2-fp8"',
        "",
        "[[hooks]]",
        'event = "Stop"',
        "",
      ].join("\n"),
    );
    ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home });
    const text = readFileSync(join(root, "config.toml"), "utf8");
    expect(text.indexOf('protocol = "openai"')).toBeLessThan(text.indexOf("[[hooks]]"));
    expect(text.indexOf("max_context_size = 262144")).toBeLessThan(text.indexOf("[[hooks]]"));
    expect(text).toMatch(/\[\[hooks\]\]\s*event = "Stop"/);
  });

  it("treats a unicode-escaped model key as the same table as the literal alias", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-unicode-"));
    scratchDirs.push(home);
    const root = join(home, ".kimi-code");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "config.toml"),
      ['[models."omlx/GLM-\\u0035.2-fp8"]', 'provider = "omlx"', 'model = "GLM-5.2-fp8"', ""].join("\n"),
    );
    ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home });
    const text = readFileSync(join(root, "config.toml"), "utf8");
    expect(text.match(/\[models\./g)?.length).toBe(1);
    expect(text).toContain("GLM-\\u0035.2-fp8");
    expect(text).toContain('protocol = "openai"');
    expect(text).toContain("max_context_size = 262144");
  });

  it("does not treat a malformed escape as a canonical alias", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-badesc-"));
    scratchDirs.push(home);
    const root = join(home, ".kimi-code");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "config.toml"),
      ['[models."omlx/GLM-\\q.2-fp8"]', 'provider = "omlx"', 'model = "nope"', ""].join("\n"),
    );
    ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home });
    const text = readFileSync(join(root, "config.toml"), "utf8");
    expect(text).toContain("GLM-\\q.2-fp8");
    expect(text).toContain('model = "nope"');
    expect(text.match(/\[models\./g)?.length).toBe(2);
    expect(text).toContain('model = "GLM-5.2-fp8"');
    expect(text).toContain('protocol = "openai"');
  });

  it("treats whitespace around dotted heading keys as the same table", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-dots-"));
    scratchDirs.push(home);
    const root = join(home, ".kimi-code");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "config.toml"),
      ['[models . "omlx/GLM-5.2-fp8"]', 'provider = "omlx"', 'model = "GLM-5.2-fp8"', ""].join("\n"),
    );
    ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home });
    const text = readFileSync(join(root, "config.toml"), "utf8");
    expect(text.match(/\[models/g)?.length).toBe(1);
    expect(text).toContain('protocol = "openai"');
    expect(text).toContain("max_context_size = 262144");
  });

  it("does not treat a triple-quote inside a single-line string as multiline", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-squote-"));
    scratchDirs.push(home);
    const root = join(home, ".kimi-code");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "config.toml"),
      [
        '[models."omlx/GLM-5.2-fp8"]',
        'provider = "omlx"',
        'model = "GLM-5.2-fp8"',
        `note = '"""'`,
        'protocol = "openai"',
        "",
      ].join("\n"),
    );
    ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home });
    const text = readFileSync(join(root, "config.toml"), "utf8");
    expect(text.match(/protocol = "openai"/g)?.length).toBe(1);
    expect(text).toContain("max_context_size = 262144");
  });

  it("does not treat a triple-quote inside a comment as multiline", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-hash-"));
    scratchDirs.push(home);
    const root = join(home, ".kimi-code");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "config.toml"),
      [
        '[models."omlx/GLM-5.2-fp8"]',
        'provider = "omlx"',
        'model = "GLM-5.2-fp8"',
        'note = "x" # """',
        'protocol = "openai"',
        "",
      ].join("\n"),
    );
    ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home });
    const text = readFileSync(join(root, "config.toml"), "utf8");
    expect(text.match(/protocol = "openai"/g)?.length).toBe(1);
    expect(text).toContain("max_context_size = 262144");
  });

  it("does not treat a bracket line inside a multiline string as a table", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-ml-"));
    scratchDirs.push(home);
    const root = join(home, ".kimi-code");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "config.toml"),
      [
        '[models."omlx/GLM-5.2-fp8"]',
        'provider = "omlx"',
        'model = "GLM-5.2-fp8"',
        'notes = """',
        "[providers.evil]",
        'protocol = "skip"',
        '"""',
        "",
      ].join("\n"),
    );
    ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: home });
    const text = readFileSync(join(root, "config.toml"), "utf8");
    expect(text).toContain('protocol = "skip"');
    expect(text).toContain('protocol = "openai"');
    const notesOpen = text.indexOf('"""', text.indexOf("notes"));
    const notesClose = text.indexOf('"""', notesOpen + 3);
    const protocolAt = text.indexOf('protocol = "openai"');
    expect(protocolAt).toBeGreaterThan(notesClose);
    expect(text).toContain("[providers.omlx]");
    expect(text).toContain("[providers.evil]");
  });

  it("treats USERPROFILE as the same home for credentials and config", async () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-userprofile-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".kimi-code", "credentials"), { recursive: true });
    writeFileSync(join(home, ".kimi-code", "credentials", "kimi-code.json"), "{}");
    const instance = await KimiAgentDriver.create({
      instanceId: "kimi-userprofile",
      displayName: "Kimi",
      environment: { HOME: "", USERPROFILE: home },
      enabled: true,
      config: { cli: FAKE_ACP, fullAuto: false },
    });
    try {
      const snap = await instance.snapshot();
      expect(snap.state).toBe("available");
      expect(snap.authenticated).toBe(true);
      expect(ensureKimiInjectAlias("omlx::GLM-5.2-fp8", { HOME: undefined, USERPROFILE: home })).toBe("omlx/GLM-5.2-fp8");
      expect(readFileSync(join(home, ".kimi-code", "config.toml"), "utf8")).toContain("[providers.omlx]");
    } finally {
      await instance.dispose();
    }
  });
});

describe("applyKimiLocalModelEnv", () => {
  it("overlays an OpenAI-compatible default for a local inject pick", () => {
    const env: Record<string, string | undefined> = {};
    applyKimiLocalModelEnv(env, "ollama::ornith:35b-bf16");
    expect(env).toMatchObject({
      KIMI_MODEL_NAME: "ornith:35b-bf16",
      KIMI_MODEL_API_KEY: "ollama",
      KIMI_MODEL_BASE_URL: "http://127.0.0.1:11434/v1",
      KIMI_MODEL_PROVIDER_TYPE: "openai",
    });
  });

  it("leaves subscription slugs and already-resolved aliases alone", () => {
    const env: Record<string, string | undefined> = { KIMI_MODEL_NAME: "keep-me" };
    applyKimiLocalModelEnv(env, "kimi-code/k3");
    applyKimiLocalModelEnv(env, "ollama/ornith:35b-bf16");
    applyKimiLocalModelEnv(env, undefined);
    expect(env.KIMI_MODEL_NAME).toBe("keep-me");
    expect(env.KIMI_MODEL_API_KEY).toBeUndefined();
  });

  it("reads the Unsloth token from the turn env", () => {
    const env: Record<string, string | undefined> = { UNSLOTH_STUDIO_AUTH_TOKEN: "unsloth-secret" };
    applyKimiLocalModelEnv(env, "unsloth::qwen3-coder");
    expect(env.KIMI_MODEL_API_KEY).toBe("unsloth-secret");
    expect(env.KIMI_MODEL_BASE_URL).toBe("http://127.0.0.1:8888/v1");
  });

  it("puts the overlay on the Kimi child only for a local inject pick", async () => {
    const home = mkdtempSync(join(tmpdir(), "omb-kimi-overlay-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".kimi-code"), { recursive: true });
    const dump = join(home, "dump.json");
    const instance = await KimiAgentDriver.create({
      instanceId: "kimi-overlay",
      displayName: "Kimi",
      environment: { HOME: home, FAKE_ACP_DUMP: dump, KIMI_MODEL_NAME: "from-shell" },
      enabled: true,
      config: { cli: FAKE_ACP, fullAuto: false },
    });
    const recorder = recordEvents(instance.adapter);
    try {
      await instance.adapter.sendTurn({
        threadId: "t-inject",
        text: "hi",
        model: "ollama::ornith:35b-bf16",
      });
      await recorder.until((e) => e.type === "turn.completed");
      const injectDump = JSON.parse(readFileSync(dump, "utf8")) as { env: Record<string, string> };
      expect(injectDump.env).toMatchObject({
        KIMI_MODEL_NAME: "ornith:35b-bf16",
        KIMI_MODEL_API_KEY: "ollama",
        KIMI_MODEL_BASE_URL: "http://127.0.0.1:11434/v1",
        KIMI_MODEL_PROVIDER_TYPE: "openai",
      });

      await instance.adapter.sendTurn({
        threadId: "t-cloud",
        text: "hi",
        model: "kimi-code/k3",
      });
      await recorder.until((e) => e.type === "turn.completed" && e.threadId === "t-cloud");
      const cloudDump = JSON.parse(readFileSync(dump, "utf8")) as { env: Record<string, string> };
      expect(cloudDump.env.KIMI_MODEL_NAME).toBeUndefined();
    } finally {
      await instance.dispose();
    }
  });
});

describe("ensureDroidInjectModel", () => {
  it("upserts a generic-chat-completion BYOK row and reuses it", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-droid-inject-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".factory"), { recursive: true });
    writeFileSync(join(home, ".factory", "settings.json"), JSON.stringify({ hooks: { Stop: [] } }));
    const first = ensureDroidInjectModel("omlx::MiniMax-M3-4bit", { HOME: home });
    const again = ensureDroidInjectModel("omlx::MiniMax-M3-4bit", { HOME: home });
    expect(first).toBe("custom:openmausbot-omlx-MiniMax-M3-4bit");
    expect(again).toBe(first);
    const settings = JSON.parse(readFileSync(join(home, ".factory", "settings.json"), "utf8")) as {
      hooks: unknown;
      customModels: Array<{ id: string; model: string; baseUrl: string; provider: string }>;
    };
    expect(settings.hooks).toEqual({ Stop: [] });
    expect(settings.customModels).toHaveLength(1);
    expect(settings.customModels[0]).toMatchObject({
      id: first,
      model: "MiniMax-M3-4bit",
      baseUrl: "http://127.0.0.1:8080/v1",
      provider: "generic-chat-completion-api",
    });
  });

  it("persists a generated id onto a matching customModels row that has none", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-droid-inject-noid-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".factory"), { recursive: true });
    writeFileSync(
      join(home, ".factory", "settings.json"),
      JSON.stringify({
        customModels: [{ model: "MiniMax-M3-4bit", baseUrl: "http://127.0.0.1:8080/v1", displayName: "local" }],
      }),
    );
    const id = ensureDroidInjectModel("omlx::MiniMax-M3-4bit", { HOME: home });
    const settings = JSON.parse(readFileSync(join(home, ".factory", "settings.json"), "utf8")) as {
      customModels: Array<{ id?: string; model: string }>;
    };
    expect(id).toBe("custom:openmausbot-omlx-MiniMax-M3-4bit");
    expect(settings.customModels).toHaveLength(1);
    expect(settings.customModels[0]?.id).toBe(id);
  });
});

describe("applyDroidLocalAuthEnv", () => {
  it("fills a placeholder Factory key only for a local inject pick", () => {
    const env: Record<string, string | undefined> = {};
    applyDroidLocalAuthEnv(env, "ollama::ornith:35b-bf16");
    expect(env.FACTORY_API_KEY).toBe("openmausbot-local");
    applyDroidLocalAuthEnv(env, "ollama::ornith:35b-bf16");
    expect(env.FACTORY_API_KEY).toBe("openmausbot-local");
  });

  it("leaves a real Factory key and cloud slugs alone", () => {
    const kept: Record<string, string | undefined> = { FACTORY_API_KEY: "fk-real" };
    applyDroidLocalAuthEnv(kept, "ollama::ornith:35b-bf16");
    expect(kept.FACTORY_API_KEY).toBe("fk-real");
    const cloud: Record<string, string | undefined> = {};
    applyDroidLocalAuthEnv(cloud, "claude-opus-5");
    applyDroidLocalAuthEnv(cloud, undefined);
    expect(cloud.FACTORY_API_KEY).toBeUndefined();
  });

  it("does not invent a Factory key when a Droid auth file already exists", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-droid-authfile-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".factory"), { recursive: true });
    writeFileSync(join(home, ".factory", "auth.v2.file"), "signed-in");
    const env: Record<string, string | undefined> = { FACTORY_HOME_OVERRIDE: home };
    applyDroidLocalAuthEnv(env, "ollama::ornith:35b-bf16");
    expect(env).toEqual({ FACTORY_HOME_OVERRIDE: home });
  });

  it("puts the placeholder on the Droid child only for a local inject pick", async () => {
    const home = mkdtempSync(join(tmpdir(), "omb-droid-overlay-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".factory"), { recursive: true });
    const dump = join(home, "dump.json");
    const instance = await DroidAgentDriver.create({
      instanceId: "droid-overlay",
      displayName: "Droid",
      environment: { HOME: home, FACTORY_HOME_OVERRIDE: home, FAKE_ACP_DUMP: dump, FACTORY_API_KEY: "" },
      enabled: true,
      config: { cli: FAKE_ACP, fullAuto: false },
    });
    const recorder = recordEvents(instance.adapter);
    try {
      await instance.adapter.sendTurn({
        threadId: "t-inject",
        text: "hi",
        model: "ollama::ornith:35b-bf16",
      });
      await recorder.until((e) => e.type === "turn.completed");
      expect(JSON.parse(readFileSync(dump, "utf8")).env.FACTORY_API_KEY).toBe("openmausbot-local");

      await instance.adapter.sendTurn({
        threadId: "t-cloud",
        text: "hi",
        model: "claude-opus-5",
      });
      await recorder.until((e) => e.type === "turn.completed" && e.threadId === "t-cloud");
      expect(JSON.parse(readFileSync(dump, "utf8")).env.FACTORY_API_KEY).not.toBe(
        "openmausbot-local",
      );
    } finally {
      await instance.dispose();
    }
  });
});

describe("ensureOpenCodeInjectModel", () => {
  it("merges a host provider into opencode.json without dropping existing models", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-opencode-inject-"));
    scratchDirs.push(home);
    const dir = join(home, ".config", "opencode");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "opencode.json"),
      JSON.stringify({
        provider: {
          omlx: {
            npm: "@ai-sdk/openai-compatible",
            name: "oMLX",
            options: { baseURL: "http://127.0.0.1:8080/v1" },
            models: { "already-there": { name: "Keep me" } },
          },
        },
      }),
    );
    const native = ensureOpenCodeInjectModel("omlx::GLM-5.2-fp8", { HOME: home });
    expect(native).toBe("omlx/GLM-5.2-fp8");
    const config = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf8")) as {
      provider: { omlx: { models: Record<string, { name: string }>; options: { baseURL: string } } };
    };
    expect(config.provider.omlx.models["already-there"]).toEqual({ name: "Keep me" });
    expect(config.provider.omlx.models["GLM-5.2-fp8"]).toBeTruthy();
    expect(config.provider.omlx.options.baseURL).toBe("http://127.0.0.1:8080/v1");
  });

  it("injects into a default object when opencode.json is malformed", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-opencode-bad-json-"));
    scratchDirs.push(home);
    const dir = join(home, ".config", "opencode");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "opencode.json"), "{not-json");
    expect(ensureOpenCodeInjectModel("omlx::GLM-5.2-fp8", { HOME: home })).toBe("omlx/GLM-5.2-fp8");
    const config = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf8")) as {
      provider: { omlx: { models: Record<string, unknown> } };
    };
    expect(config.provider.omlx.models["GLM-5.2-fp8"]).toBeTruthy();
  });
});

describe("ensureHermesInjectProvider", () => {
  it("writes a named custom provider and returns the ACP model id", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-inject-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".hermes"), { recursive: true });
    writeFileSync(join(home, ".hermes", "config.yaml"), "model:\n  provider: auto\n  base_url: https://openrouter.ai/api/v1\n");
    const native = ensureHermesInjectProvider("omlx::gemma-4-31b-it-bf16", { HOME: home });
    expect(native).toBe("custom:omlx:gemma-4-31b-it-bf16");
    const again = ensureHermesInjectProvider("omlx::gemma-4-31b-it-bf16", { HOME: home });
    expect(again).toBe(native);
    const text = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
    expect(text).toContain("provider: auto");
    expect(text).toContain("https://openrouter.ai/api/v1");
    expect(text.match(/^  omlx:$/gm)?.length).toBe(1);
    expect(text).toContain("base_url: http://127.0.0.1:8080/v1");
    expect(text).toContain("api_key: omlx");
  });

  it("replaces a nested provider block without leaving orphan YAML lines", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-nested-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".hermes"), { recursive: true });
    writeFileSync(
      join(home, ".hermes", "config.yaml"),
      [
        "providers:",
        "  omlx:",
        "    base_url: http://old",
        "    extras:",
        "      nested: keep-sibling-not-this",
        "    api_key: old",
        "  other:",
        "    base_url: http://other",
        "",
      ].join("\n"),
    );
    ensureHermesInjectProvider("omlx::gemma-4-31b-it-bf16", { HOME: home });
    const text = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
    expect(text).toContain("  other:\n    base_url: http://other");
    expect(text).toContain("base_url: http://127.0.0.1:8080/v1");
    expect(text).not.toContain("nested: keep-sibling-not-this");
    expect(text).not.toContain("http://old");
    expect(text.match(/^  omlx:$/gm)?.length).toBe(1);
  });
});

describe("selectHermesInjectProvider", () => {
  it("selects the host and leaves model.default and model.base_url alone", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-select-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".hermes"), { recursive: true });
    writeFileSync(
      join(home, ".hermes", "config.yaml"),
      "model:\n  default: anthropic/claude-opus-4.6\n  provider: auto\n  base_url: https://openrouter.ai/api/v1\n",
    );
    expect(selectHermesInjectProvider("ollama::ibm/granite4.1:3b", { HOME: home })).toBe(
      "custom:ollama:ibm/granite4.1:3b",
    );
    const text = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
    expect(text).toContain("provider: ollama");
    expect(text).not.toContain("provider: auto");
    expect(text).toContain("default: anthropic/claude-opus-4.6");
    expect(text).toContain("https://openrouter.ai/api/v1");
  });

  it("replaces a quoted auto value the installer writes", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-quoted-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".hermes"), { recursive: true });
    writeFileSync(join(home, ".hermes", "config.yaml"), 'model:\n  provider: "auto"\n');
    selectHermesInjectProvider("ollama::ibm/granite4.1:3b", { HOME: home });
    expect(readFileSync(join(home, ".hermes", "config.yaml"), "utf8")).toContain("provider: ollama");
  });

  it("selects inside a CRLF stock config instead of prepending a stub", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-crlf-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".hermes"), { recursive: true });
    writeFileSync(
      join(home, ".hermes", "config.yaml"),
      "database:\r\n  journal_mode: wal\r\nmodel:\r\n  default: anthropic/claude-opus-4.6\r\n  provider: \"auto\"\r\n  base_url: https://openrouter.ai/api/v1\r\n",
    );
    selectHermesInjectProvider("ollama::ibm/granite4.1:3b", { HOME: home });
    const text = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
    expect(text.match(/^model:/gm)?.length).toBe(1);
    expect(text).toContain("provider: ollama");
    expect(text).not.toContain("provider: auto");
    expect(text).not.toContain('provider: "auto"');
  });

  it("rewrites every model.provider when a stub was already prepended", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-dup-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".hermes"), { recursive: true });
    writeFileSync(
      join(home, ".hermes", "config.yaml"),
      "model:\n  provider: ollama\n# stock\nmodel:\n  provider: \"auto\"\n",
    );
    selectHermesInjectProvider("ollama::ibm/granite4.1:3b", { HOME: home });
    const text = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
    expect(text).not.toContain("provider: auto");
    expect(text).not.toContain('provider: "auto"');
    expect([...text.matchAll(/provider: ollama/g)]).toHaveLength(2);
  });

  it("writes into HERMES_HOME, not ~/.hermes", () => {
    const user = mkdtempSync(join(tmpdir(), "omb-hermes-user-"));
    const profile = mkdtempSync(join(tmpdir(), "omb-hermes-profile-"));
    scratchDirs.push(user, profile);
    mkdirSync(join(user, ".hermes"), { recursive: true });
    const original = "model:\n  provider: auto\n";
    writeFileSync(join(user, ".hermes", "config.yaml"), original);
    selectHermesInjectProvider("ollama::ibm/granite4.1:3b", { HOME: user, HERMES_HOME: profile });
    expect(readFileSync(join(user, ".hermes", "config.yaml"), "utf8")).toBe(original);
    expect(readFileSync(join(profile, "config.yaml"), "utf8")).toContain("provider: ollama");
  });

  it("on Windows prefers %LOCALAPPDATA%\\hermes over ~/.hermes", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-win-home-"));
    const local = mkdtempSync(join(tmpdir(), "omb-hermes-win-local-"));
    scratchDirs.push(home, local);
    mkdirSync(join(home, ".hermes"), { recursive: true });
    mkdirSync(join(local, "hermes"), { recursive: true });
    writeFileSync(join(home, ".hermes", "config.yaml"), "model:\n  provider: auto\n");
    writeFileSync(join(local, "hermes", "config.yaml"), "model:\n  provider: auto\n");
    expect(resolveHermesHome({ HOME: home, LOCALAPPDATA: local }, "win32")).toBe(join(local, "hermes"));
    selectHermesInjectProvider("ollama::ibm/granite4.1:3b", {
      HOME: home,
      LOCALAPPDATA: local,
    });
    // select uses process.platform; on this Windows box it must hit LocalAppData
    if (process.platform === "win32") {
      expect(readFileSync(join(local, "hermes", "config.yaml"), "utf8")).toContain("provider: ollama");
      expect(readFileSync(join(home, ".hermes", "config.yaml"), "utf8")).toContain("provider: auto");
    }
  });

  it("on POSIX ignores LOCALAPPDATA even when a native config exists", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-posix-"));
    const local = mkdtempSync(join(tmpdir(), "omb-hermes-posix-local-"));
    scratchDirs.push(home, local);
    mkdirSync(join(home, ".hermes"), { recursive: true });
    mkdirSync(join(local, "hermes"), { recursive: true });
    writeFileSync(join(home, ".hermes", "config.yaml"), "model:\n  provider: auto\n");
    writeFileSync(join(local, "hermes", "config.yaml"), "model:\n  provider: auto\n");
    expect(resolveHermesHome({ HOME: home, LOCALAPPDATA: local }, "linux")).toBe(join(home, ".hermes"));
  });

  it("on Windows defaults to %LOCALAPPDATA%\\hermes when neither config exists", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-win-empty-"));
    const local = mkdtempSync(join(tmpdir(), "omb-hermes-win-empty-local-"));
    scratchDirs.push(home, local);
    expect(resolveHermesHome({ HOME: home, LOCALAPPDATA: local }, "win32")).toBe(join(local, "hermes"));
  });

  it("does not rewrite a cloud slug", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-cloudsel-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".hermes"), { recursive: true });
    const original = "model:\n  provider: auto\n";
    writeFileSync(join(home, ".hermes", "config.yaml"), original);
    expect(selectHermesInjectProvider("anthropic/claude-opus-4.6", { HOME: home })).toBe("anthropic/claude-opus-4.6");
    expect(readFileSync(join(home, ".hermes", "config.yaml"), "utf8")).toBe(original);
  });
});

describe("resolveHermesGitBashPath", () => {
  it("is a no-op off Windows", () => {
    const pf = mkdtempSync(join(tmpdir(), "omb-git-posix-"));
    scratchDirs.push(pf);
    mkdirSync(join(pf, "Git", "bin"), { recursive: true });
    writeFileSync(join(pf, "Git", "bin", "bash.exe"), "");
    expect(resolveHermesGitBashPath({ ProgramFiles: pf }, "linux")).toBeUndefined();
  });

  it("prefers portable Git under HERMES_HOME over Program Files", () => {
    const local = mkdtempSync(join(tmpdir(), "omb-git-local-"));
    const pf = mkdtempSync(join(tmpdir(), "omb-git-pf-"));
    scratchDirs.push(local, pf);
    mkdirSync(join(local, "hermes", "git", "bin"), { recursive: true });
    mkdirSync(join(pf, "Git", "bin"), { recursive: true });
    writeFileSync(join(local, "hermes", "git", "bin", "bash.exe"), "");
    writeFileSync(join(pf, "Git", "bin", "bash.exe"), "");
    expect(resolveHermesGitBashPath({ LOCALAPPDATA: local, ProgramFiles: pf }, "win32")).toBe(
      join(local, "hermes", "git", "bin", "bash.exe"),
    );
  });

  it("skips a pinned WSL launcher and uses Git for Windows", () => {
    const local = mkdtempSync(join(tmpdir(), "omb-git-wsl-"));
    const pf = mkdtempSync(join(tmpdir(), "omb-git-wsl-pf-"));
    scratchDirs.push(local, pf);
    mkdirSync(join(local, "Windows", "System32"), { recursive: true });
    mkdirSync(join(pf, "Git", "bin"), { recursive: true });
    const wsl = join(local, "Windows", "System32", "bash.exe");
    writeFileSync(wsl, "");
    writeFileSync(join(pf, "Git", "bin", "bash.exe"), "");
    expect(
      resolveHermesGitBashPath(
        { LOCALAPPDATA: local, ProgramFiles: pf, HERMES_GIT_BASH_PATH: wsl },
        "win32",
      ),
    ).toBe(join(pf, "Git", "bin", "bash.exe"));
  });

  it("keeps a pinned Git-for-Windows path", () => {
    const pf = mkdtempSync(join(tmpdir(), "omb-git-pin-"));
    scratchDirs.push(pf);
    mkdirSync(join(pf, "Git", "bin"), { recursive: true });
    const pinned = join(pf, "Git", "bin", "bash.exe");
    writeFileSync(pinned, "");
    expect(resolveHermesGitBashPath({ HERMES_GIT_BASH_PATH: pinned, ProgramFiles: "C:\\missing" }, "win32")).toBe(
      pinned,
    );
  });
});

const STOCK_BASH_STARTS = `def _bash_starts(bash: str) -> bool:
    cached = _bash_starts_cache.get(bash)
    if cached is not None:
        return cached
    try:
        result = subprocess.run(
            [bash, "--noprofile", "--norc", "-c", _BASH_EXTERNAL_PROGRAM_PROBE],
            capture_output=True,
            text=True, encoding="utf-8", errors="replace",
            timeout=15,
        )
    except Exception:
        return False
    return result.returncode == 0
`;

describe("patchHermesBashProbeSource", () => {
  it("inserts stdin=DEVNULL on the 0.20.x probe and is idempotent", () => {
    const once = patchHermesBashProbeSource(STOCK_BASH_STARTS);
    expect(once).toContain("stdin=subprocess.DEVNULL,  # openmausbot-b24");
    expect(patchHermesBashProbeSource(once)).toBe(once);
  });

  it("leaves source alone when the probe is missing", () => {
    expect(patchHermesBashProbeSource("def other():\n    pass\n")).toBe("def other():\n    pass\n");
  });
});

describe("ensureHermesBashProbeClosesStdin", () => {
  it("is a no-op off Windows", () => {
    expect(ensureHermesBashProbeClosesStdin({ LOCALAPPDATA: "C:\\\\missing" }, "linux")).toBe(false);
  });

  it("patches the installed local.py once", () => {
    const local = mkdtempSync(join(tmpdir(), "omb-hermes-localpy-"));
    scratchDirs.push(local);
    const dir = join(local, "hermes", "hermes-agent", "tools", "environments");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "local.py");
    writeFileSync(path, STOCK_BASH_STARTS);
    expect(ensureHermesBashProbeClosesStdin({ LOCALAPPDATA: local }, "win32")).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("openmausbot-b24");
    expect(ensureHermesBashProbeClosesStdin({ LOCALAPPDATA: local }, "win32")).toBe(false);
  });
});

const STOCK_ACP_MCP_REGISTER = `
    async def _register_session_mcp_servers(
        self,
        state: SessionState,
        mcp_servers: list[McpServerStdio | McpServerHttp | McpServerSse] | None,
    ) -> None:
            enabled_toolsets = _expand_acp_enabled_toolsets(
                getattr(state.agent, "enabled_toolsets", None) or ["hermes-acp"],
                mcp_server_names=[server.name for server in mcp_servers],
            )
            state.agent.enabled_toolsets = enabled_toolsets
            disabled_toolsets = getattr(state.agent, "disabled_toolsets", None)
            state.agent.tools = get_tool_definitions(
                enabled_toolsets=enabled_toolsets,
                disabled_toolsets=disabled_toolsets,
                quiet_mode=True,
            )
`;

describe("patchHermesComputerDisablesWebSource", () => {
  it("disables web and browser when a computer MCP server is mounted", () => {
    const once = patchHermesComputerDisablesWebSource(STOCK_ACP_MCP_REGISTER);
    expect(once).toContain("openmausbot-b24a");
    expect(once).toContain('extra = ["web", "browser"]');
    expect(once).toContain("state.agent.disabled_toolsets = disabled_toolsets");
    expect(once.indexOf("openmausbot-b24a")).toBeLessThan(once.indexOf("state.agent.tools = get_tool_definitions"));
    expect(patchHermesComputerDisablesWebSource(once)).toBe(once);
  });

  it("patches CRLF source and leaves unrelated files alone", () => {
    const crlf = STOCK_ACP_MCP_REGISTER.replaceAll("\n", "\r\n");
    const patched = patchHermesComputerDisablesWebSource(crlf);
    expect(patched).toContain("\r\n");
    expect(patched).toContain("openmausbot-b24a");
    expect(patchHermesComputerDisablesWebSource("def other():\n    pass\n")).toBe("def other():\n    pass\n");
  });
});

describe("ensureHermesComputerDisablesWeb", () => {
  it("patches the installed ACP server.py once", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-acp-"));
    scratchDirs.push(home);
    const dir = join(home, "hermes-agent", "acp_adapter");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "server.py");
    writeFileSync(path, STOCK_ACP_MCP_REGISTER);
    expect(ensureHermesComputerDisablesWeb({ HERMES_HOME: home })).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("openmausbot-b24a");
    expect(ensureHermesComputerDisablesWeb({ HERMES_HOME: home })).toBe(false);
  });
});

const STOCK_ACP_MCP_WAIT = [
  "            await asyncio.to_thread(register_mcp_servers, config_map)",
  "        except Exception:",
  '            logger.warning(',
  '                "Session %s: failed to register ACP MCP servers",',
  "                state.session_id,",
  "                exc_info=True,",
  "            )",
  "            return",
  "",
  "        try:",
  "            from model_tools import get_tool_definitions",
  "            from agent.memory_manager import inject_memory_provider_tools",
  "",
].join("\n");

describe("patchHermesAcpMcpWaitSource", () => {
  it("waits for ACP MCP servers to register tools before refreshing the snapshot", () => {
    const once = patchHermesAcpMcpWaitSource(STOCK_ACP_MCP_WAIT);
    expect(once).toContain("openmausbot-b24a-mcpwait");
    expect(once).toContain("get_registered_mcp_server_names");
    expect(once).toContain("await asyncio.sleep(0.2)");
    expect(once.indexOf("openmausbot-b24a-mcpwait")).toBeLessThan(once.indexOf("from model_tools import get_tool_definitions"));
    expect(patchHermesAcpMcpWaitSource(once)).toBe(once);
  });

  it("patches CRLF source and leaves unrelated files alone", () => {
    const crlf = STOCK_ACP_MCP_WAIT.replaceAll("\n", "\r\n");
    const patched = patchHermesAcpMcpWaitSource(crlf);
    expect(patched).toContain("\r\n");
    expect(patched).toContain("openmausbot-b24a-mcpwait");
    expect(patchHermesAcpMcpWaitSource("def other():\n    pass\n")).toBe("def other():\n    pass\n");
  });
});

describe("ensureHermesAcpMcpWait", () => {
  it("patches the installed ACP server.py once", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-mcpwait-"));
    scratchDirs.push(home);
    const dir = join(home, "hermes-agent", "acp_adapter");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "server.py");
    writeFileSync(path, STOCK_ACP_MCP_WAIT);
    expect(ensureHermesAcpMcpWait({ HERMES_HOME: home })).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("openmausbot-b24a-mcpwait");
    expect(ensureHermesAcpMcpWait({ HERMES_HOME: home })).toBe(false);
  });
});

const STOCK_ACP_MCP_REBIND = [
  '            current_api_mode = None if provider_changed else getattr(state.agent, "api_mode", None)',
  "            state.agent = self.session_manager._make_agent(",
  "                session_id=session_id,",
  "                cwd=state.cwd,",
  "                model=resolved_model,",
  "                requested_provider=requested_provider,",
  "                base_url=current_base_url,",
  "                api_mode=current_api_mode,",
  "            )",
  "            self.session_manager.save_session(session_id)",
  "            logger.info(",
  '                "Session %s: model switched to %s via provider %s",',
  "",
].join("\n");

describe("patchHermesAcpMcpRebindSource", () => {
  it("rebinds MCP toolsets after session/set_model rebuilds the agent", () => {
    const once = patchHermesAcpMcpRebindSource(STOCK_ACP_MCP_REBIND);
    expect(once).toContain("openmausbot-b24a-rebind");
    expect(once).toContain("_omb_prev_enabled");
    expect(once).toContain("refresh_agent_mcp_tools");
    expect(once.indexOf("_omb_prev_enabled")).toBeLessThan(once.indexOf("state.agent = self.session_manager._make_agent"));
    expect(patchHermesAcpMcpRebindSource(once)).toBe(once);
  });

  it("patches CRLF source and leaves unrelated files alone", () => {
    const crlf = STOCK_ACP_MCP_REBIND.replaceAll("\n", "\r\n");
    const patched = patchHermesAcpMcpRebindSource(crlf);
    expect(patched).toContain("\r\n");
    expect(patched).toContain("openmausbot-b24a-rebind");
    expect(patchHermesAcpMcpRebindSource("def other():\n    pass\n")).toBe("def other():\n    pass\n");
  });
});

describe("ensureHermesAcpMcpRebind", () => {
  it("patches the installed ACP server.py once", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-mcprebind-"));
    scratchDirs.push(home);
    const dir = join(home, "hermes-agent", "acp_adapter");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "server.py");
    writeFileSync(path, STOCK_ACP_MCP_REBIND);
    expect(ensureHermesAcpMcpRebind({ HERMES_HOME: home })).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("openmausbot-b24a-rebind");
    expect(ensureHermesAcpMcpRebind({ HERMES_HOME: home })).toBe(false);
  });
});

const STOCK_BRIDGE_NO_CALL = [
  "    result = visible + bridge",
  "    # Tier 1 = per-tool listing for at least part of the catalog (full,",
  '    # names, or mixed). Tier 2 = search-only discovery; the server-level',
  "",
].join("\n");

describe("patchHermesBridgeNoCallSource", () => {
  it("drops the tool_call bridge name when the local catalog env is set", () => {
    const once = patchHermesBridgeNoCallSource(STOCK_BRIDGE_NO_CALL);
    expect(once).toContain("openmausbot-b24a-nocall");
    expect(once).toContain("OPENMAUSBOT_ACP_TOOLSETS");
    expect(once).toContain("TOOL_CALL_NAME");
    expect(patchHermesBridgeNoCallSource(once)).toBe(once);
  });

  it("patches CRLF source and leaves unrelated files alone", () => {
    const crlf = STOCK_BRIDGE_NO_CALL.replaceAll("\n", "\r\n");
    expect(patchHermesBridgeNoCallSource(crlf)).toContain("\r\n");
    expect(patchHermesBridgeNoCallSource("def other():\n    pass\n")).toBe("def other():\n    pass\n");
  });
});

describe("ensureHermesBridgeNoCall", () => {
  it("patches the installed tool_search.py once", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-nocall-"));
    scratchDirs.push(home);
    const dir = join(home, "hermes-agent", "tools");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "tool_search.py");
    writeFileSync(path, STOCK_BRIDGE_NO_CALL);
    expect(ensureHermesBridgeNoCall({ HERMES_HOME: home })).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("openmausbot-b24a-nocall");
    expect(ensureHermesBridgeNoCall({ HERMES_HOME: home })).toBe(false);
  });
});

const STOCK_BRIDGE_UNWRAP = [
  "        if function_name == _ts_mod.TOOL_CALL_NAME:",
  "            underlying_name, underlying_args, err = _ts_mod.resolve_underlying_call(function_args or {})",
  "            if err or not underlying_name:",
  "",
].join("\n");

describe("patchHermesBridgeUnwrapSource", () => {
  it("unwraps a nameless tool_call({url}) onto vm_open", () => {
    const once = patchHermesBridgeUnwrapSource(STOCK_BRIDGE_UNWRAP);
    expect(once).toContain("openmausbot-b24a-unwrap");
    expect(once).toContain('function_name=_eager');
    expect(once).toContain("vm_open");
    expect(once.indexOf("openmausbot-b24a-unwrap")).toBeLessThan(
      once.indexOf("resolve_underlying_call(function_args or {})"),
    );
    expect(patchHermesBridgeUnwrapSource(once)).toBe(once);
  });

  it("patches CRLF source and leaves unrelated files alone", () => {
    const crlf = STOCK_BRIDGE_UNWRAP.replaceAll("\n", "\r\n");
    expect(patchHermesBridgeUnwrapSource(crlf)).toContain("\r\n");
    expect(patchHermesBridgeUnwrapSource("def other():\n    pass\n")).toBe("def other():\n    pass\n");
  });
});

describe("ensureHermesBridgeUnwrap", () => {
  it("patches the installed model_tools.py once", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-unwrap-"));
    scratchDirs.push(home);
    const dir = join(home, "hermes-agent");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "model_tools.py");
    writeFileSync(path, STOCK_BRIDGE_UNWRAP);
    expect(ensureHermesBridgeUnwrap({ HERMES_HOME: home })).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("openmausbot-b24a-unwrap");
    expect(ensureHermesBridgeUnwrap({ HERMES_HOME: home })).toBe(false);
  });
});

describe("ensureHermesComputerToolsEager", () => {
  it("patches the installed tool_search.py once", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-eager-"));
    scratchDirs.push(home);
    const dir = join(home, "hermes-agent", "tools");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "tool_search.py");
    writeFileSync(path, STOCK_TOOL_SEARCH_DEFER);
    expect(ensureHermesComputerToolsEager({ HERMES_HOME: home })).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("openmausbot-b24a-eager");
    expect(readFileSync(path, "utf8")).toContain('name.startswith("vm_")');
    expect(ensureHermesComputerToolsEager({ HERMES_HOME: home })).toBe(false);
  });
});

const STOCK_TOOL_SEARCH_DEFER = `
def is_deferrable_tool_name(name: str) -> bool:
    """Return True if a tool with this name is *eligible* for deferral."""
    if name in BRIDGE_TOOL_NAMES:
        return False
    if name in _core_tool_names():
        return False
`;

describe("patchHermesComputerToolsEagerSource", () => {
  it("keeps computer tools off the tool_search deferral list", () => {
    const once = patchHermesComputerToolsEagerSource(STOCK_TOOL_SEARCH_DEFER);
    expect(once).toContain("openmausbot-b24a-eager");
    expect(once).toContain('if name.startswith("mcp__computer__") or name.startswith("vm_")');
    expect(once.indexOf("mcp__computer__")).toBeLessThan(once.indexOf("_core_tool_names"));
    expect(patchHermesComputerToolsEagerSource(once)).toBe(once);
  });

  it("upgrades the older mcp__computer__-only eager line", () => {
    const old =
      STOCK_TOOL_SEARCH_DEFER.replace(
        "    if name in BRIDGE_TOOL_NAMES:\n        return False\n",
        '    if name in BRIDGE_TOOL_NAMES:\n        return False\n    if name.startswith("mcp__computer__"):  # openmausbot-b24a-eager\n        return False\n',
      );
    const upgraded = patchHermesComputerToolsEagerSource(old);
    expect(upgraded).toContain('if name.startswith("mcp__computer__") or name.startswith("vm_")');
    expect(upgraded).not.toContain('if name.startswith("mcp__computer__"):  # openmausbot-b24a-eager');
    expect(patchHermesComputerToolsEagerSource(upgraded)).toBe(upgraded);
  });
});

const STOCK_MCP_PREFIXED = [
  "def mcp_prefixed_tool_name(server_name: str, tool_name: str) -> str:",
  '    """Build the registry/wire name for an MCP tool.',
  "",
  "    Produces mcp__<sanitizedServer>__<sanitizedTool>.",
  '    """',
  "    safe_server = sanitize_mcp_name_component(server_name)",
  "    safe_tool = sanitize_mcp_name_component(tool_name)",
  '    return f"{MCP_TOOL_NAME_PREFIX}{safe_server}{_MCP_NAME_DELIM}{safe_tool}"',
  "",
].join("\n");

describe("patchHermesComputerShortNamesSource", () => {
  it("returns vm_* computer tools without the mcp__ prefix", () => {
    const once = patchHermesComputerShortNamesSource(STOCK_MCP_PREFIXED);
    expect(once).toContain("openmausbot-b24a-short");
    expect(once).toContain('if safe_server == "computer" and safe_tool.startswith("vm_")');
    expect(once.indexOf("openmausbot-b24a-short")).toBeLessThan(once.indexOf("MCP_TOOL_NAME_PREFIX}{safe_server}"));
    expect(patchHermesComputerShortNamesSource(once)).toBe(once);
  });

  it("patches CRLF source and leaves unrelated files alone", () => {
    const crlf = STOCK_MCP_PREFIXED.replaceAll("\n", "\r\n");
    const patched = patchHermesComputerShortNamesSource(crlf);
    expect(patched).toContain("\r\n");
    expect(patched).toContain("openmausbot-b24a-short");
    expect(patchHermesComputerShortNamesSource("def other():\n    pass\n")).toBe("def other():\n    pass\n");
  });
});

describe("ensureHermesComputerShortNames", () => {
  it("patches the installed mcp_tool.py once", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-short-"));
    scratchDirs.push(home);
    const dir = join(home, "hermes-agent", "tools");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "mcp_tool.py");
    writeFileSync(path, STOCK_MCP_PREFIXED);
    expect(ensureHermesComputerShortNames({ HERMES_HOME: home })).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("openmausbot-b24a-short");
    expect(ensureHermesComputerShortNames({ HERMES_HOME: home })).toBe(false);
  });
});

const STOCK_ACP_EXPAND = [
  "def _expand_acp_enabled_toolsets(",
  "    toolsets: List[str] | None = None,",
  "    mcp_server_names: List[str] | None = None,",
  ") -> List[str]:",
  '    """Return ACP toolsets plus explicit MCP server toolsets for this session."""',
  "    expanded: List[str] = []",
  '    for name in list(toolsets or ["hermes-acp"]):',
  "        if name and name not in expanded:",
  "            expanded.append(name)",
  "",
].join("\n");

describe("patchHermesLocalCatalogSource", () => {
  it("replaces the hermes-acp default when the child env names toolsets", () => {
    const once = patchHermesLocalCatalogSource(STOCK_ACP_EXPAND);
    expect(once).toContain("openmausbot-b24a-catalog");
    expect(once).toContain(LOCAL_HERMES_ACP_TOOLSETS_ENV);
    expect(once).toContain('if override and "hermes-acp" in list(toolsets or ["hermes-acp"])');
    expect(once.indexOf("openmausbot-b24a-catalog")).toBeLessThan(once.indexOf("expanded: List[str]"));
    expect(patchHermesLocalCatalogSource(once)).toBe(once);
  });

  it("patches CRLF source and leaves unrelated files alone", () => {
    const crlf = STOCK_ACP_EXPAND.replaceAll("\n", "\r\n");
    const patched = patchHermesLocalCatalogSource(crlf);
    expect(patched).toContain("\r\n");
    expect(patched).toContain("openmausbot-b24a-catalog");
    expect(patchHermesLocalCatalogSource("def other():\n    pass\n")).toBe("def other():\n    pass\n");
  });
});

describe("ensureHermesLocalCatalog", () => {
  it("patches the installed session.py once", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-hermes-catalog-"));
    scratchDirs.push(home);
    const dir = join(home, "hermes-agent", "acp_adapter");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "session.py");
    writeFileSync(path, STOCK_ACP_EXPAND);
    expect(ensureHermesLocalCatalog({ HERMES_HOME: home })).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("openmausbot-b24a-catalog");
    expect(ensureHermesLocalCatalog({ HERMES_HOME: home })).toBe(false);
  });
});

describe("applyLocalHermesAcpToolsets", () => {
  it("grants named toolsets only for a local-inject pick", () => {
    const cloud = { OPENMAUSBOT_ACP_TOOLSETS: "leak" };
    applyLocalHermesAcpToolsets(cloud, "claude-opus");
    expect(cloud.OPENMAUSBOT_ACP_TOOLSETS).toBeUndefined();

    const local = { OPENMAUSBOT_ACP_TOOLSETS: "leak" };
    applyLocalHermesAcpToolsets(local, "ollama::ibm/granite4.1:3b");
    expect(local.OPENMAUSBOT_ACP_TOOLSETS).toBe(LOCAL_HERMES_ACP_TOOLSETS.join(","));
  });
});

describe("ensureQwenInjectModel", () => {
  it("upserts an OpenAI-compatible provider without dropping existing rows", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-qwen-inject-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".qwen"), { recursive: true });
    writeFileSync(
      join(home, ".qwen", "settings.json"),
      JSON.stringify({
        modelProviders: {
          openai: [{ id: "keep-me", name: "Keep me", baseUrl: "http://127.0.0.1:9/v1", envKey: "KEEP" }],
        },
      }),
    );
    const native = ensureQwenInjectModel("omlx::GLM-5.2-fp8", { HOME: home });
    expect(native).toBe("GLM-5.2-fp8");
    const settings = JSON.parse(readFileSync(join(home, ".qwen", "settings.json"), "utf8")) as {
      env: Record<string, string>;
      modelProviders: { openai: Array<{ id: string }> };
    };
    expect(settings.modelProviders.openai.map((row) => row.id)).toEqual(["keep-me", "GLM-5.2-fp8"]);
    expect(settings.env.OPENMAUSBOT_QWEN_OMLX_API_KEY).toBe("omlx");
    if (process.platform !== "win32") {
      expect(statSync(join(home, ".qwen", "settings.json")).mode & 0o777).toBe(0o600);
    }
  });

  it("injects into a default object when settings.json is malformed", () => {
    const home = mkdtempSync(join(tmpdir(), "omb-qwen-bad-json-"));
    scratchDirs.push(home);
    mkdirSync(join(home, ".qwen"), { recursive: true });
    writeFileSync(join(home, ".qwen", "settings.json"), "{not-json");
    expect(ensureQwenInjectModel("omlx::GLM-5.2-fp8", { HOME: home })).toBe("GLM-5.2-fp8");
    const settings = JSON.parse(readFileSync(join(home, ".qwen", "settings.json"), "utf8")) as {
      modelProviders: { openai: Array<{ id: string }> };
    };
    expect(settings.modelProviders.openai.map((row) => row.id)).toEqual(["GLM-5.2-fp8"]);
  });
});

describe("live Custom lists on every local CLI harness", () => {
  it("merges probed host models onto Kimi, Droid, and Antigravity", async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL) => {
      if (String(url).includes(":8080")) {
        return new Response(JSON.stringify({ data: [{ id: "GLM-5.2-fp8" }] }), { status: 200 });
      }
      return new Response("nope", { status: 500 });
    }) as typeof fetch;
    const home = mkdtempSync(join(tmpdir(), "omb-all-inject-"));
    scratchDirs.push(home);
    const environment = { HOME: home, OPENMAUSBOT_PROBE_LOCAL_INJECT: "1" };
    const instances: Array<Awaited<ReturnType<typeof KimiAgentDriver.create>>> = [];
    try {
      instances.push(
        await KimiAgentDriver.create({
          instanceId: "kimi",
          displayName: "Kimi",
          environment,
          enabled: true,
          config: { cli: FAKE_ACP, fullAuto: false },
        }),
      );
      instances.push(
        await DroidAgentDriver.create({
          instanceId: "droid",
          displayName: "Droid",
          environment,
          enabled: true,
          config: { cli: FAKE_ACP, fullAuto: false },
        }),
      );
      instances.push(
        await AntigravityDriver.create({
          instanceId: "agy",
          displayName: "Antigravity",
          environment,
          enabled: true,
          config: { cli: FAKE_AGY, fullAuto: true },
        }),
      );
      for (const instance of instances) {
        expect(instance.models.options.some((option) => option.id === "omlx::GLM-5.2-fp8" && option.custom)).toBe(
          true,
        );
      }
    } finally {
      globalThis.fetch = previous;
      for (const instance of instances) await instance.dispose();
    }
  });
});
