# @inglorious/storm 🐝

A multi-agent coding orchestrator powered by local Ollama models.

```
You ask → Planner selects skills + breaks down task → Coder implements
→ Tester runs tests → Critic approves or rejects → loop → files land on disk
→ you review in VS Code
```

No auto-commits. No cloud. No subscriptions. No npm dependencies.

---

## Requirements

- Node.js 18+
- [Ollama](https://ollama.com) running locally or on a network machine

---

## Setup

### 1. Pull the models in Ollama

```bash
ollama pull qwen2.5:7b
ollama pull qwen2.5-coder:14b
ollama pull qwen2.5-coder:7b
```

### 2. Set extended context windows (important — default 4K is too small)

```bash
printf "FROM qwen2.5-coder:14b\nPARAMETER num_ctx 32768" > Modelfile.coder
ollama create qwen2.5-coder:14b -f Modelfile.coder

printf "FROM qwen2.5:7b\nPARAMETER num_ctx 16384" > Modelfile.planner
ollama create qwen2.5:7b -f Modelfile.planner
```

### 3. Expose Ollama on the network (Windows machine)

In PowerShell, before starting Ollama:

```powershell
$env:OLLAMA_HOST = "0.0.0.0"
ollama serve
```

### 4. Install globally

```bash
pnpm add -g @inglorious/storm
```

Or if you prefer npm:

```bash
npm install -g @inglorious/storm
```

For local development (changes take effect immediately):

```bash
cd /path/to/inglorious-storm
pnpm link --global
```

---

## Usage

```bash
# From your project root
storm "add input validation to the login form"

# Specify the project path explicitly
storm "add input validation to the login form" --project /path/to/myproject

# Point at a remote Ollama instance (e.g. your Windows machine)
OLLAMA_HOST=http://192.168.x.x:11434 storm "your task"

# Skip skill loading for a plain project
storm "your task" --no-skills
```

After the storm finishes, open VS Code and review the diff. Commit when happy.

---

## Skills

storm supports the [SKILL.md](https://agentskills.io) open standard. If your
project has skills installed, the agents will automatically discover and use them
to produce idiomatic, framework-aware code.

### How it works

1. On startup, storm scans for a skills directory in your project (`.claude/skills/`,
   `.agents/skills/`, `.codex/skills/`, or `skills/`).
2. If found, the **Planner** reads the `SKILL.md` index and selects only the skill
   files relevant to your task.
3. The selected skill files are loaded in full and injected into the **Coder** and
   **Tester** prompts, grounding them in your actual patterns and conventions.

This means if you're working on an `@inglorious/web` project and ask the storm to
add a table component, it will write `render(entity, api)` code — not React.

### Installing skills

```bash
# Inglorious Forge skills (covers @inglorious/store, web, charts, engine, etc.)
npx skills add https://github.com/ingloriouscoderz/forge-skills --skill forge-skills
```

Skills are installed once per project and reused across all subsequent storm runs.
Any skill set compatible with the SKILL.md standard works automatically.

---

## Configuration

All settings via environment variables — no config files to manage:

| Variable         | Default                             | Description                            |
| ---------------- | ----------------------------------- | -------------------------------------- |
| `OLLAMA_HOST`    | `http://localhost:11434`            | Ollama server URL                      |
| `MODEL_PLANNER`  | `qwen2.5:7b`                        | Model for planning and skill selection |
| `MODEL_CODER`    | `qwen2.5-coder:14b`                 | Model for implementation               |
| `MODEL_TESTER`   | `qwen2.5-coder:7b`                  | Model for test generation              |
| `MODEL_CRITIC`   | `qwen2.5:7b`                        | Model for code review                  |
| `TEST_COMMAND`   | `npx vitest run --reporter=verbose` | Test command                           |
| `MAX_ITERATIONS` | `3`                                 | Max coder→critic loops                 |
| `MAX_FILE_CHARS` | `12000`                             | Max chars per file in prompts          |

Per-project tip — add a `.stormrc.sh` in your project and source it before running:

```bash
export OLLAMA_HOST=http://192.168.x.x:11434
export TEST_COMMAND="npm test"
export MAX_ITERATIONS=2
```

---

## How the loop works

```
┌────────────────────────────────────────────┐
│                  You                        │
│  "add a filterable table component"        │
└──────────────────┬─────────────────────────┘
                   │
                   ▼
            ┌─────────────┐
            │   PLANNER   │  reads SKILL.md index → selects relevant skills
            │             │  reads codebase → creates step-by-step plan
            └──────┬──────┘
                   │ plan + selected skills
                   ▼
            ┌─────────────┐ ◄──────────────────────┐
            │    CODER    │  grounded by skill files │ critique
            │             │  implements plan          │
            │             │  writes files to disk    │
            └──────┬──────┘                          │
                   │ changes                         │
                   ▼                                 │
            ┌─────────────┐                          │
            │   TESTER    │  grounded by skill files │
            │             │  writes missing tests    │
            │             │  runs test suite          │
            └──────┬──────┘                          │
                   │ test results                    │
                   ▼                                 │
            ┌─────────────┐  REJECTED ──────────────┘
            │   CRITIC    │
            └──────┬──────┘
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
├── storm.js          # entry point + CLI
├── config.js         # all settings
├── package.json
├── agents/
│   ├── planner.js    # selects skills, breaks task into steps
│   ├── coder.js      # implements changes (skill-aware)
│   ├── tester.js     # writes/runs tests (skill-aware)
│   └── critic.js     # approves or rejects
└── tools/
    ├── skills.js     # skill discovery and loading
    ├── files.js      # read/write project files
    ├── shell.js      # run shell commands
    └── ollama.js     # Ollama API client
```
