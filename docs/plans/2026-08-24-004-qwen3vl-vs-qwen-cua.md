# Path A: Qwen3-VL vs Qwen-CUA

Status: **evaluated 2026-08-24. Qwen-CUA is still not first-run.**
The Qwen3-VL **Instruct 4B** first-run pick in this file is
**overridden** by
[2026-08-24-005](2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md)
(Thinking 8B @ 32k). Do not retarget first-run to Qwen-CUA. Do not
execute [003](2026-08-24-003-path-a-qwen3vl-first-run-plan.md).

check-upstream-first: fetched `upstream/main` (`df32587` in the gap).
No Qwen-CUA, no `qwen3-vl` first-run, no compact-observe. Catch-up stays
a separate merge.

## What the names are

These are **not** two Ollama tags of the same job.

| | **Qwen3-VL 4B Instruct** | **Qwen-CUA** |
|---|---|---|
| What | General vision-language model with GUI/agent training. Cookbook can emit a `computer_use` XML tool. | Native computer-use **policy**: screenshot in, keyboard/mouse out. Same family as the EvoCUA *job*, not the 4B first-run job. |
| Size | Dense **4.4B**. Ollama Q4_K_M ~**3.3 GB**. | **397B-A17B** (17B active). Scale-up **Qwen-CUA-Max >1T**. |
| Serve | Official `qwen3-vl:4b-instruct` on Ollama (this box: 0.32.15, digest `ee4b975b58c1…`). | Repo ships **report + Playwright demo**. README: **weights are not in the repository.** Demo wants an OpenAI-compatible multimodal endpoint. Not an Ollama Path A pull. |
| License we can check | Weights: Apache-2.0 ([HF](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct), Ollama library). | Demo/report: Apache-2.0 ([xlang-ai/Qwen-CUA](https://github.com/xlang-ai/Qwen-CUA)). **CUA-finetuned weights: not released there.** Do not treat the demo licence as a shippable 397B blob. |
| Hands | Through **our** Hermes + eight `vm_*` (AX indexes). Native cookbook is click-on-screen on a **1000×1000** grid. | One `computer_use` function; coords on **0..999**. No DOM, AX, shell, or task APIs in the native protocol. Demo executor is Playwright, not Cua XFCE. |
| Eyes | Sees pixels skip-Hermes. Hermes+JPEG+tools **overflows 8k** (8500 vs 8192); wrap captions. | Scaffold keeps **20** active screenshots, then folds older ones. Path A 8k cannot hold that. |
| Talk + files | Teed 2026-08-23: Hermes ACP `write_file` / `read` / `terminal` / `vm_open`. Workspace file `8241`. | Native recipe is mouse/keyboard only. Paper also studies pairing with Bash; that is still not Hermes `file`/`terminal`/`vm_*`. |
| Vendor computer-use score | Qwen3-VL **32B**: OSWorld **~41** (their [tech report](https://arxiv.org/html/2511.21631v2)). **4B OSWorld not claimed here** (not our run). | **86.2** OSWorld-Verified (100-step); Max **87.6**. [arXiv:2608.02352](https://arxiv.org/abs/2608.02352). Different suite/year than EvoCUA’s Jan 2026 table — do not subtract from 56.7. |

Sources: Instruct live tee
[006](2026-08-23-006-qwen3vl-replace-granite-plan.md);
eyes [007](2026-08-23-007-hermes-eyes-plan.md);
open CUA pick [003](2026-08-23-003-open-computer-use-brain.md);
Qwen-CUA README (weights note, 20-image history, 86.2);
demo README (Playwright, XML `computer_use`, Chromium-first, not a full desktop).

We did **not** run Qwen-CUA. This box cannot host 397B.

## Path A scorecard (the only bar that matters)

Path A = no API key, pinned Ollama zip, in-app Hermes, Local VM, 16 GB
laptop (this box: 15.7 GB RAM, RTX 2060 6 GB), eight `vm_*`, P8.

| Requirement | 4B Instruct | Qwen-CUA |
|---|---|---|
| Fits this laptop + VM | **Yes, tight.** 2026-08-23: ~3.57 GB in VRAM, GPU 5554/6144 MiB, **2.09 GB** RAM free. | **No.** 397B-A17B / >1T. |
| Ollama first-run pull | **Yes.** Tag already teed. | **No** official tag; weights not in the GitHub release. |
| Hermes tools + chat | **Yes** (Instruct). Thinking fills 8k and emits none. | Would need a **new driver** (pictures + `computer_use` loop). Hermes stays for Path A. |
| Drive **our** VM | Open/read via `vm_*`. Same-turn recover-and-click **not** a gold-turn winner (not scored as coworker). | Native actions are x,y clicks, not `vm_click {index}`. Adapter would be EvoCUA-shaped work, not a first-run flip. |
| Do not drive host Windows | Holds if we stay on compact `vm_*`. | Native CUA on the **host** is B-19-class. Path A sandbox is the Local VM. |
| One installer, no sysadmin | Matches the wedge. | Cloud fleet / huge MoE / missing weights. Opposite of plan 003. |

## Decision

**Laptop Path A stays Qwen3-VL through Hermes, not Qwen-CUA.** Against
this scorecard, CUA is the wrong product. The Qwen3-VL **weight** is
no longer Instruct 4B: [005](2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md)
ships Thinking 8B @ 32k. Qwen-CUA is still a better *computer-use
specialist on paper* and still the wrong *first-run*.

Do not:

- Point `RECOMMENDED_MODEL` at anything named cua.
- Pull Qwen3.5-397B-A17B and call it Qwen-CUA (that HF card is the
  general 397B VL/LM, not the CUA policy; still unhostable here).
- Mount Qwen Code `computer_use__*` as a substitute (B-19, host desktop).
- Treat 86.2 OSWorld-Verified as a reason to drop Hermes or the eight
  tools on the 16 GB default.

**GPU-box coworker goal is still EvoCUA**, not Qwen-CUA, until CUA
weights are actually downloadable and licensed for this fork.
[004](2026-08-23-004-evocua-path-a-goal.md) / [003](2026-08-23-003-open-computer-use-brain.md):
EvoCUA-32B is Apache-2.0 on the HF card we cited, vLLM, one
`computer_use` tool — same *shape* as Qwen-CUA, size we can name.

What we *can* take from Qwen-CUA later (GPU box, our driver, not
first-run): screenshot history with folding, 1000-grid clicks through
Cua, keep files/shell as extra tools only after a live probe (EvoCUA
got worse when OSWorld-MCP tools were piled on).

## “Do the 8B trick” — RAM bar still true; first-run override is 005

Asked 2026-08-24 as a Qwen-CUA workaround; answered **no, Qwen-CUA has
no 8B SKU.** The **RAM** measurement still holds: Granite 8B on this
15.7 GB / 6 GB VRAM box left **0.6 GB RAM** with the VM up
([002](2026-08-23-002-path-a-drive-sites-bakeoff.md)). That is why 005
puts 16 GB in **tight** and raises comfortable to **24 GB**, not why we
keep Granite.

The Path A size workaround *was* **`qwen3-vl:4b-instruct` (~3.3 GB)**
(003). Official unsuffixed **`qwen3-vl:8b`** is **~6.1 GB** Q4_K_M
Thinking. **005 is the executive first-run pick anyway.** This section
does not veto 005. It still vetoes treating Qwen-CUA as an 8B pull.

Qwen-CUA is **not** “a better Qwen3-VL with an 8B SKU.” It is a
screenshot→click **policy** trained on a **397B-A17B** MoE (Max **>1T**).
The paper and [README](https://github.com/xlang-ai/Qwen-CUA) name those
two sizes only. The GitHub release still has **no weights**. There is
no `qwen-cua:8b` on Ollama.

Quantizing 397B does not produce an 8B Qwen3-VL. Different architecture;
86.2 OSWorld-Verified does not travel with a dense 8B blob.

The actual downloadable “small CUA on Qwen3-VL” is already named:
**`meituan/EvoCUA-8B-20260105`** (Apache-2.0, OSWorld **46.1%**, vLLM,
one `computer_use` tool) —
[003](2026-08-23-003-open-computer-use-brain.md). That is the GPU-box
step-down from EvoCUA-32B. It is still **not** Path A: not Ollama, not
Hermes `vm_*`, and 8B already failed the 16 GB + VM RAM bar.

`qwen3-vl:8b-instruct` would still be Qwen3-VL, not Qwen-CUA. 005
pulls unsuffixed **Thinking** `qwen3-vl:8b`, not Instruct 8B.

## Qwen3.8 ([blog](https://qwen.ai/blog?id=qwen3.8)) — different family, still not Path A

Asked 2026-08-24. **Yes, this is different from Qwen3-VL.** It is the
Aug 2026 generation (Qwen3.5 → 3.6 → **3.8**), not a rename of
Qwen3-VL and not Qwen-CUA.

| | **Qwen3-VL 4B Instruct** (Path A) | **Qwen3.8-27B** | **Qwen-CUA** |
|---|---|---|---|
| What | 2025 VL series, dense 4B | 2026 native VL, dense **27B** | 397B-A17B click policy |
| Ollama | `qwen3-vl:4b-instruct` ~3.3 GB | `qwen3.8:27b` **18 GB**, vision+tools+thinking | none |
| Apache-2.0 | Yes | Yes ([HF card](https://huggingface.co/Qwen/Qwen3.8-27B)) | Demo yes; CUA weights not in repo |
| Fits this 16 GB + VM | Tight, teed | **No.** Download alone is 18 GB. | No |
| 4B/8B SKU | Yes | **No** in this release (only 27B + 2.4T-A95B) | No |

Vendor computer-use (their card, not our run): OSWorld-Verified
**84.3** for 27B vs **63.9** for Qwen3.6-27B. Same *named* suite as
Qwen-CUA’s 86.2 — do not treat as a live VM tee. Thinking is **on by
default**; Path A 8k already filled on Qwen3-VL Thinking.

**Quants exist; they do not make it Path A.** Official Ollama
([tags](https://ollama.com/library/qwen3.8/tags), fetched 2026-08-24):
`qwen3.8:27b` **is already Q4_K_M (18 GB)**. Also `q8_0` 30 GB and
`bf16` 56 GB. No Q3/Q2 tag on that library. Community GGUFs go smaller
(~9–14 GB 2-/3-bit); that is still a **27B** model, not a 4B SKU, and
this box still has the 6 GiB Local VM. Granite 8B left **0.6 GB RAM**.
Do not import Unsloth/llama.cpp into first-run. Path A stays the
pinned Ollama zip. First-run weight is [005](2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md),
not 27B.

Do not retarget `RECOMMENDED_MODEL` except by executing 005. GPU-box later: 27B is a general
VL (talk + tools + vision), unlike EvoCUA’s CUA finetune that dropped
MMMU. Still a vLLM/big-RAM job, not first-run.

Sources: [Qwen3.8 README](https://github.com/QwenLM/Qwen3.8),
[Ollama `qwen3.8`](https://ollama.com/library/qwen3.8), HF 27B card.

## Next (only if asked)

1. Execute [005](2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md) — ship
   Thinking 8B @ 32k as first-run. Do not execute 003.
2. GPU-box EvoCUA cheap tests in [004](2026-08-23-004-evocua-path-a-goal.md).
3. Revisit Qwen-CUA **if** they publish a small or 8B/32B CUA checkpoint
   we can host.
