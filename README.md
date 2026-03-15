# @inglorious/storm ⚡

A local, privacy-first, multi-agent coding orchestrator — powered by [Ollama](https://ollama.com) and the [SKILL.md](https://agentskills.io) open standard.

```
You ask → Planner selects skills + breaks down task → Coder implements
→ Tester runs tests → Critic approves or rejects → loop → files land on disk
→ you review in VS Code → you commit
```

No auto-commits. No cloud. No subscriptions. No npm dependencies.

---

## Honest expectations

This tool works. Whether it works _well enough_ for your daily workflow depends almost entirely on the local model you can run.

**What it does well:**

- Greenfield feature additions ("add a --dry-run flag")
- Scaffolding new components or modules
- Writing tests for existing code
- Answering questions about your codebase (REPL chat mode)
- Any task where generating new content is more valuable than surgical precision

**What it struggles with:**

- Small, precise edits ("remove this typo", "rename this variable") — LLMs regenerate entire files from scratch, which is slow and risky for tiny changes. Use your editor for those.
- Large codebases — context window limits mean agents may not see all relevant files
- Tasks requiring deep cross-file reasoning across 10+ files simultaneously

**The model problem:**

On consumer hardware (RTX 4070, 64GB RAM), a generative task takes 4–6 minutes end-to-end with `qwen2.5-coder:7b`. That's often slower than just writing the code yourself. This is a model capability and speed problem, not an architecture problem — and it's improving fast. When faster local models arrive, or when you point storm at an API, the loop becomes genuinely competitive.

**Compared to the alternatives:**

[Claude Code](https://claude.ai/code), [Aider](https://aider.chat), and [Plandex](https://plandex.ai) are more mature and better tested. They also support [SKILL.md](https://agentskills.io) natively — that's not a differentiator. Storm's only real differentiator is that you own the orchestration code. You can read every line of the loop, change the prompts, swap a model per role, or add a new agent. With the alternatives you're a user. With Storm you're the author.

---

## Install

```bash
pnpm add -g @inglorious/storm
```

Or with npm:

```bash
npm install -g @inglorious/storm
```

---

## Requirements

- Node.js 18+
- [Ollama](https://ollama.com) running locally or on a network machine

---

## Setup

### 1. Pull models

```bash
ollama pull qwen2.5:7b
ollama pull qwen2.5-coder:7b
```

For better results at the cost of speed, use 14b models:

```bash
ollama pull qwen2.5-coder:14b
```

### 2. Extend context windows (important — Ollama's default 4K is too small)

```bash
printf "FROM qwen2.5-coder:7b\nPARAMETER num_ctx 32768" > Modelfile
ollama create qwen2.5-coder:7b -f Modelfile
```

### 3. Expose Ollama over the network (optional — if running on a separate machine)

```powershell
# Windows PowerShell
$env:OLLAMA_HOST = "0.0.0.0"
ollama serve
```

Then set `OLLAMA_HOST` on the machine running storm:

```bash
export OLLAMA_HOST=http://192.168.x.x:11434
```

---

## Usage

```bash
# Run the full swarm on a task
storm "add input validation to the registration form"

# Preview what would change without writing any files
storm "dry-run: add input validation to the registration form"

# Start the interactive REPL
storm --repl

# Specify project path explicitly
storm "add input validation" --project /path/to/myproject
```

### REPL mode

```
storm --repl

> what does tools/files.js do?       ← direct chat, streamed, fast
> run: add a --verbose flag           ← triggers full swarm loop
> dry-run: refactor the auth module   ← swarm without writing files
> exit
```

Plain messages chat directly with the model using your codebase as context — no agents, no overhead, just fast answers. `run:` and `dry-run:` trigger the full pipeline.

---

## Skills

Storm supports the [SKILL.md](https://agentskills.io) open standard. If your project has skills installed, the agents automatically discover and use them to produce framework-aware code.

The Planner reads the SKILL.md index, picks only the files relevant to your task, and injects them into the Coder and Tester prompts. This means if you're working on an `@inglorious/web` project, the coder will write `render(entity, api)` — not React.

```bash
# Install Inglorious Forge skills (covers @inglorious/store, web, charts, engine, etc.)
npx skills add https://github.com/ingloriouscoderz/forge-skills --skill forge-skills
```

Any skill set compatible with the SKILL.md standard works automatically.

---

## Configuration

All settings via environment variables:

| Variable               | Default                             | Description                             |
| ---------------------- | ----------------------------------- | --------------------------------------- |
| `OLLAMA_HOST`          | `http://localhost:11434`            | Ollama server URL                       |
| `MODEL_PLANNER`        | `qwen2.5:7b`                        | Planning and skill selection            |
| `MODEL_CODER`          | `qwen2.5-coder:7b`                  | Code implementation                     |
| `MODEL_TESTER`         | `qwen2.5-coder:7b`                  | Test generation                         |
| `MODEL_CRITIC`         | `qwen2.5:7b`                        | Code review                             |
| `TEST_COMMAND`         | `npx vitest run --reporter=verbose` | Test runner                             |
| `MAX_ITERATIONS`       | `3`                                 | Max coder→critic loops before giving up |
| `MAX_FILE_CHARS`       | `8000`                              | Max chars per file in prompts           |
| `OLLAMA_TIMEOUT`       | `300000`                            | Timeout per agent call (ms)             |
| `OLLAMA_CODER_TIMEOUT` | `600000`                            | Timeout for the coder specifically (ms) |

Per-project tip — create a `.stormrc.sh` and source it before running:

```bash
export OLLAMA_HOST=http://192.168.x.x:11434
export TEST_COMMAND="npm test"
export MAX_ITERATIONS=2
```

---

## How it works

```
┌─────────────────────────────────────────────┐
│                    You                       │
│  "add a filterable table component"         │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
             ┌─────────────┐
             │   PLANNER   │  reads SKILL.md index → selects relevant skills
             │             │  reads codebase → produces step-by-step plan
             │             │  identifies which files need to change
             └──────┬──────┘
                    │ plan + skills + relevant files
                    ▼
             ┌─────────────┐ ◄───────────────────────┐
             │    CODER    │  receives focused context │ critique
             │             │  implements the plan      │
             │             │  writes files to disk     │
             └──────┬──────┘                           │
                    │ changes                          │
                    ▼                                  │
             ┌─────────────┐                           │
             │   TESTER    │  writes missing tests     │
             │             │  runs the test suite      │
             └──────┬──────┘                           │
                    │ test results                     │
                    ▼                                  │
             ┌─────────────┐  REJECTED ───────────────┘
             │   CRITIC    │  compares against baseline
             └──────┬──────┘  only rejects new failures
                    │ APPROVED
                    ▼
             ┌─────────────┐
             │     YOU     │  diff in VS Code, commit when happy
             └─────────────┘
```

---

## Project structure

```
inglorious-storm/
├── storm.js           # entry point, CLI, REPL
├── config.js          # all settings
├── package.json
├── agents/
│   ├── planner.js     # skill selection + implementation plan
│   ├── coder.js       # file implementation (skill-aware)
│   ├── tester.js      # test generation and execution (skill-aware)
│   └── critic.js      # approval with baseline comparison
└── tools/
    ├── ollama.js      # Ollama client (single-turn, multi-turn, streaming)
    ├── skills.js      # SKILL.md discovery and loading
    ├── files.js       # project file read/write/focus
    ├── shell.js       # test runner
    └── timer.js       # step timing
```

---

## Roadmap

- [ ] Cloud model support (`MODEL_CODER=claude-sonnet-4-6` via Anthropic API)
- [ ] Git diff preview before applying changes
- [ ] Watch mode for continuous task processing
- [ ] Per-agent model configuration in a config file

---

_Built by [Inglorious Coderz](https://ingloriouscoderz.it). MIT license._
