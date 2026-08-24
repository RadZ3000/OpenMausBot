# Open computer-use brain (research, 2026-08-23)

**Not a ship decision.** Preference: computer use first, tools second.
Compute unconstrained. Apache-2.0 required for this fork’s weight gate
([`local-model-path.md`](../local-model-path.md) licensing).

We did **not** run these weights. Numbers are vendor/leaderboard claims.
Path A still cannot feed screenshots through Hermes (`MEDIA:path`).

## Pick (if we later host a real GPU)

**`meituan/EvoCUA-32B-20260105`**

| | |
|---|---|
| Why | Best **downloadable** open computer-use model found today. OSWorld **56.7%** (50 steps), #1 open on their Jan 2026 table. Beats OpenCUA-72B (45%) and the **closed** UI-TARS-2 (53.1% on that table). |
| Shape | Qwen3-VL-32B-Thinking finetune. Screenshot in, multi-turn desktop out. They claim general ability is not gutted. Closer to “Granite job + TARS job” than UI-TARS-2B. |
| License | Project README: **Apache 2.0**. Confirm the HF card/`LICENSE` file before bundling. |
| Serve | Their docs: **vLLM** OpenAI-compatible (`vllm serve`, TP=2). Not an Ollama Path A drop-in. |
| Actions | One fake tool named `computer_use` (click/type/scroll/wait). Their eval
puts that schema in the **system prompt** as XML; the HTTP call does **not**
send OpenAI `tools`. Hermes `file` / `terminal` / `vm_*` are a different catalog. |

Sources: [HF model card](https://huggingface.co/meituan/EvoCUA-32B-20260105),
[paper](https://arxiv.org/abs/2601.15876), [GitHub](https://github.com/meituan/EvoCUA).

**Step-down if 32B is too large later:** `meituan/EvoCUA-8B-20260105` — OSWorld
**46.1%**, still above OpenCUA-72B and far above UI-TARS-1.5-7B (**27.5%**).

## Do not pick as “the best open brain”

| Model | Why not |
|---|---|
| **UI-TARS-2** | Best ByteDance *story* (tools + GUI). **Closed weights** (listed 🔒 on EvoCUA’s table as UI-TARS-2-2509). |
| **UI-TARS-1.5** (unnamed 42.5% OSWorld) | That score is **not** the open 7B. Open **UI-TARS-1.5-7B** is **27.5%** OSWorld. |
| **UI-TARS-2B / 7B-DPO (v1)** | Open, Apache-2.0, GUI-native. Weaker OSWorld than EvoCUA-8B. Job B specialist, weak Job A. |
| **Qwen3-VL-32B-Thinking** | Open, Apache-2.0, tools + GUI cookbook. OSWorld ~**41.6%** as EvoCUA’s *base*. Prefer the EvoCUA finetune for computer use. |
| **OpenCUA-72B** | Open. **45%** OSWorld, larger than EvoCUA-32B, worse score. |

## Can it call Hermes-style tools?

**Not run here.** 8B/32B need vLLM + a real GPU. This PC cannot host that probe.

**Their own agent** ([`evocua_agent.py`](https://github.com/meituan/EvoCUA/blob/main/mm_agents/evocua/evocua_agent.py)):
screenshot + instruction → text that contains `<tool_call>{"name":"computer_use",...}</tool_call>`.
`call_llm` only sends `messages`. Mouse/keyboard only. No files, no shell API.

**Someone else did offer extra tools** (OSWorld-MCP, [ToolCUA](https://arxiv.org/abs/2605.12481) Table 1, not our run):

| EvoCUA-32B | Accuracy | Avg tool-calls |
|---|---|---|
| GUI only | 52.6% | — |
| GUI + tools | 40.5% (**−12**) | 7.49 |

So it **will fire extra tools** when they are in that benchmark’s prompt. It got **worse** at finishing the task (they call this tool overuse). Those tools are OSWorld-MCP (150+ desktop helpers), **not** Hermes Path A tools. Live Hermes+EvoCUA is still untested.

Cheap GPU-box probe if we get one: vLLM, **no** Hermes. (1) screenshot → does it emit `computer_use`? (2) add one dummy OpenAI `tools` function — does it call it or ignore/break? (3) only then Hermes.

## Still true for this app

Eyes + memory are unchanged. A 32B CUA on vLLM does not light up Path A until
screenshots reach the model and the session stays up. Action format is
**click-on-screen**, not Granite `vm_click {index}`.
