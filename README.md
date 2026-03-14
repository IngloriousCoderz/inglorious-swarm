# @inglorious/swarm 🐝

A multi-agent coding orchestrator powered by local Ollama models.

```
You ask → Planner breaks it down → Coder implements → Tester runs tests
→ Critic approves or rejects → loop → files land on disk → you review in VS Code
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

### 4. Install globally from local source

```bash
cd /path/to/swarm
npm install -g .
```

Or link it for development (changes take effect immediately):

```bash
npm link
```

---

## Usage

```bash
# From your project root
swarm "add input validation to the login form"

# Or specify the project path explicitly
swarm "add input validation to the login form" --project /path/to/myproject

# Point at your Windows machine
OLLAMA_HOST=http://192.168.x.x:11434 swarm "your task"
```

After the swarm finishes, open VS Code and review the diff. Commit when happy.

---

## Configuration

All settings via environment variables — no config files to manage:

| Variable         | Default                             | Description                   |
| ---------------- | ----------------------------------- | ----------------------------- |
| `OLLAMA_HOST`    | `http://localhost:11434`            | Ollama server URL             |
| `MODEL_PLANNER`  | `qwen2.5:7b`                        | Model for planning            |
| `MODEL_CODER`    | `qwen2.5-coder:14b`                 | Model for implementation      |
| `MODEL_TESTER`   | `qwen2.5-coder:7b`                  | Model for test generation     |
| `MODEL_CRITIC`   | `qwen2.5:7b`                        | Model for code review         |
| `TEST_COMMAND`   | `npx vitest run --reporter=verbose` | Test command                  |
| `MAX_ITERATIONS` | `3`                                 | Max coder→critic loops        |
| `MAX_FILE_CHARS` | `12000`                             | Max chars per file in prompts |

Per-project tip — add a `.swarmrc.sh` in your project and source it before running:

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
│  "add validation to the registration form" │
└──────────────────┬─────────────────────────┘
                   │
                   ▼
            ┌─────────────┐
            │   PLANNER   │  reads codebase, creates step-by-step plan
            └──────┬──────┘
                   │ plan
                   ▼
            ┌─────────────┐ ◄──────────────────────┐
            │    CODER    │  implements plan         │ critique
            └──────┬──────┘  writes files to disk   │
                   │ changes                         │
                   ▼                                 │
            ┌─────────────┐                          │
            │   TESTER    │  writes missing tests    │
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
inglorious-swarm/
├── swarm.js          # entry point + CLI
├── config.js         # all settings
├── package.json
├── agents/
│   ├── planner.js
│   ├── coder.js
│   ├── tester.js
│   └── critic.js
└── tools/
    ├── files.js      # read/write project files
    ├── shell.js      # run shell commands
    └── ollama.js     # Ollama API client
```
