<div align="center">

# ⬡ COGNITIVE SWARM ENGINE ⬡

### _Decompose a question into a swarm. Research in parallel. Synthesize one dossier._

A multi-agent research console where an **orchestrator** spins up a swarm of specialist AI agents,
each investigates a question from a different angle **in parallel**, and a **synthesizer** compiles
their streamed findings into a single high-density markdown dossier.

<br/>

![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)

![Status](https://img.shields.io/badge/status-working-a3e635?style=flat-square)
![Providers](https://img.shields.io/badge/providers-7-f2b035?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-cd7d12?style=flat-square)
![PRs](https://img.shields.io/badge/PRs-welcome-e89b1c?style=flat-square)

</div>

---

> [!NOTE]
> The swarm is **provider-agnostic**. Each of the three cognitive roles — orchestrator, specialist, synthesizer — can be pointed at a *different* model on a *different* provider. Run a fast local model as your specialists and a frontier model as your synthesizer, or any mix you like.

<details>
<summary><b>📑 Table of Contents</b></summary>

- [How It Works](#-how-it-works)
- [The Pipeline](#-the-pipeline)
- [Features](#-features)
- [Supported Providers](#-supported-providers)
- [Quick Start](#-quick-start)
- [Configuration](#️-configuration)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [Tech Stack](#-tech-stack)
- [Roadmap](#-roadmap)

</details>

---

## 🧠 How It Works

The engine runs a **three-stage cognitive pipeline**. A single query fans out into a swarm, executes concurrently, then collapses back into one artifact.

```mermaid
flowchart LR
    Q([🔎 Research Query]) --> O

    subgraph STAGE1[" ① ORCHESTRATION "]
        O[Orchestrator<br/>designs 5–8 specialists]
    end

    O --> R[🎬 Swarm Director<br/>review + launch]

    subgraph STAGE2[" ② PARALLEL SWARM "]
        direction TB
        A1[Agent · Historian]
        A2[Agent · Economist]
        A3[Agent · Skeptic]
        A4[Agent · Technologist]
        A5[Agent · Ethicist]
    end

    subgraph STAGE3[" ③ SYNTHESIS "]
        S[Report Writer<br/>compiles the dossier]
    end

    R --> A1 & A2 & A3 & A4 & A5
    A1 & A2 & A3 & A4 & A5 --> S
    S --> D([📄 Dossier + follow-up chat])

    classDef stage fill:#1c1917,stroke:#a45d12,color:#f2b035;
    classDef agent fill:#0b0908,stroke:#6d3d14,color:#fde68a;
    class O,S,R stage;
    class A1,A2,A3,A4,A5 agent;
```

---

## 🔗 The Pipeline

Every request streams. Specialist output appears token-by-token in the live telemetry HUD before the synthesizer ever runs.

```mermaid
sequenceDiagram
    autonumber
    participant U as 🧑 Operator
    participant C as ⚛ Client (React)
    participant S as 🖧 Server (Express)
    participant L as 🤖 LLM Providers

    U->>C: Enter research vector
    C->>S: POST /api/orchestrate
    S->>L: "Design 5–8 specialists"
    L-->>S: JSON agent profiles
    S-->>C: validated + de-duped agents
    C-->>U: Swarm Director — review / edit
    U->>C: Launch

    par Parallel swarm execution
        C->>S: POST /api/execute (agent A)
        S->>L: reason + web_search (agentic)
        S-->>C: stream findings ▓▓▓░
    and
        C->>S: POST /api/execute (agent B)
        S-->>C: stream findings ▓▓░░
    end

    C->>S: POST /api/synthesize (successful results)
    S->>L: "Compile a dossier"
    L-->>S: stream markdown
    S-->>C: 📄 dossier ▓▓▓░ (streamed)
    C-->>U: renders live + saved to history
```

---

## ✨ Features

| | Feature | Description |
|:---:|:---|:---|
| 🕵️ | **Investigative Mode** | On by default. The swarm hunts non-obvious connections — biographical/family background, institutional and political ties, timeline coincidences, primary sources, documented-but-underemphasized facts — instead of the canonical summary. Distinguishes established fact from documented-but-obscure from informed inference. Toggle off for a plain encyclopedic pass. |
| 💬 | **Interrogate the Swarm** | Chat with your finished dossier — multi-turn, cited, and **saved with the run** (restored from history). A **Strict / Exploratory** toggle controls grounding: Exploratory (default) can **search the web live** and reason *beyond* the dossier, labeling dossier-fact vs. inference; Strict stays dossier-only. |
| ✍️ | **Editable prompts** | Every system prompt — orchestrator, specialist, report writer, both interrogation modes, and the investigative directive — is editable in the config panel (with per-prompt reset), so you can retune the swarm's disposition per topic. |
| 🌐 | **Web-Grounded Research** | On by default. Put the swarm on the live internet. **Tool-capable models** (OpenAI, Anthropic, most OpenRouter/local models) get a real `web_search` **function tool** and search *agentically* — multiple queries as they reason. **Gemini** uses native Google Search grounding. Models that can't use tools fall back to a one-shot search + inject (never a hallucinated answer). Backends cascade **SearXNG → Brave → Serply**. Every run cites real sources. |
| 🔭 | **Dossier Lenses** | Re-render the finished report for different audiences — Executive Brief, Deep-Dive, ELI5, Skeptic's Cut, Slide Outline — without re-running the swarm. Streams once, then cached; switch instantly. |
| 🎬 | **Swarm Director** | After the orchestrator designs the swarm, review it before launch: rename specialists, rewrite their directives, delete weak angles, add your own, or re-roll the whole swarm. Human-in-the-loop control. |
| 🕸️ | **Live Swarm Constellation** | An animated node-graph view of the swarm — specialist nodes orbit a central core, edges crackle with energy as each agent streams, and everything converges when synthesis ignites. Toggle between Constellation and Grid. |
| 🎛️ | **Per-role model routing** | Assign a distinct provider + model to the orchestrator, specialist swarm, and synthesizer independently. |
| 📡 | **Live telemetry HUD** | Each agent streams its research in real time. Expand any card to read the full markdown output. |
| ⏹️ | **Halt control** | Abort an in-flight run at any stage — orchestration, swarm, or synthesis — via a single `AbortController`. |
| 📤 | **Export & archive** | Copy or download the dossier as `.md`, **Print / Save as PDF**, or export a **full research bundle** (dossier + every specialist's findings + the Q&A) as one archival markdown file. |
| 🕓 | **Run history** | Your last 20 completed runs (with their dossier and Q&A) persist in `localStorage` and reload with one click. |
| 🎨 | **CRT-phosphor UI** | Dark-only, fully responsive, amber-on-black aesthetic with scanlines, glow, and a blinking stream cursor. |
| 🛡️ | **Resilient by design** | Per-request timeouts, mid-stream failure detection, and orchestrator-output validation. |

---

## 🌐 Supported Providers

<div align="center">

| Provider | Type | Key required | Model discovery |
|:---|:---:|:---:|:---:|
| **Gemini** | ☁️ Cloud | Server `.env.local` | Curated list |
| **OpenAI** | ☁️ Cloud | ✅ | Live `/models` |
| **OpenRouter** | ☁️ Cloud | ✅ | Live `/models` |
| **Anthropic** | ☁️ Cloud | ✅ | Live `/models` |
| **Venice.ai** | ☁️ Cloud | ✅ | Live `/models` |
| **Ollama** | 🖥️ Local | — | Live `/api/tags` |
| **LM Studio** | 🖥️ Local | — | Live `/models` |

</div>

> [!TIP]
> Local providers (**Ollama** / **LM Studio**) need no API key — just point the base URL at your running server. The engine probes them directly from the browser first, then falls back to a server-side proxy.

---

## 🚀 Quick Start

> [!IMPORTANT]
> **Prerequisites:** [Node.js](https://nodejs.org) 18+ and a Gemini API key (the default provider). Other providers are configured in-app.

```bash
# 1 — Clone
git clone https://github.com/rustyorb/cognitive-swarm-engine.git
cd cognitive-swarm-engine

# 2 — Install
npm install

# 3 — Add your Gemini key
echo 'GEMINI_API_KEY="your-key-here"' > .env.local

# 4 — Launch
npm run dev
```

Then open **http://localhost:3000** — or set `PORT` to run elsewhere:

```bash
PORT=8080 npm run dev
```

> [!NOTE]
> If the port is already in use, the server **automatically falls back to the next free port** and prints the real URL — it won't crash on a busy `3000`.

### Convenience scripts

Background start/stop wrappers are included (they default to port **3737** and still auto-fall-back if busy):

```bash
# Windows
start.bat            # or:  start.bat 8080
stop.bat

# macOS / Linux / Git Bash
./start.sh           # or:  ./start.sh 8080
./stop.sh
```

`start` launches the server in the background and prints its URL; `stop` reads the PID it recorded (`.swarm.pid`) and shuts it down.

<details>
<summary><b>📦 Build for production</b></summary>

<br/>

```bash
npm run build   # bundles the client (Vite) + server (esbuild → dist/server.cjs)
npm start       # runs the production server from dist/
```

The production server serves the static Vite build and the API from a single Express process.

</details>

---

## ⚙️ Configuration

Open the **⚙ Config** panel (top-right) to wire up providers and assign models per role.

<details>
<summary><b>🔐 Where do secrets live?</b></summary>

<br/>

| Secret | Storage | Scope |
|:---|:---|:---|
| `GEMINI_API_KEY` | `.env.local` (server) | Never sent to the browser |
| All other provider keys | Browser `localStorage` | Sent to your own server only, to proxy provider calls |

> [!CAUTION]
> Keys entered in the Config panel are persisted **unencrypted in your browser's localStorage**. This is a local-first developer tool — don't deploy it to a shared/public host with keys entered.

</details>

<details>
<summary><b>🧩 Environment variables</b></summary>

<br/>

| Variable | Default | Purpose |
|:---|:---:|:---|
| `GEMINI_API_KEY` | — | Default provider key. Loaded from `.env.local`. |
| `SEARXNG_URL` | — | A running [SearXNG](https://docs.searxng.org) instance (e.g. `http://192.168.0.177:8888`) — preferred search backend for grounding: local, private, no key, aggregated. Requires JSON format enabled. |
| `BRAVE_API_KEY` | — | Brave Search API — used if `SEARXNG_URL` is unset or returns nothing. |
| `SERPLY_API_KEY` | — | Serply Search API — last fallback. |
| `PORT` | `3000` | Port the Express server binds to. |
| `NODE_ENV` | `development` | `production` serves the static build instead of Vite middleware. |
| `DISABLE_HMR` | `false` | Disables hot-reload + file watching (used in sandboxed editors). |

> [!TIP]
> Web-Grounded Research works out of the box for **Gemini** (native Google Search — no key needed beyond `GEMINI_API_KEY`). To ground **other providers and local models**, point `SEARXNG_URL` at a SearXNG instance (best for a fully-local setup) or set `BRAVE_API_KEY` / `SERPLY_API_KEY` in `.env.local`. The backends cascade **SearXNG → Brave → Serply**.

</details>

---

## 🎮 Usage

1. Type a research vector, e.g. _"Analyze the socio-economic impacts of asteroid mining by 2050."_ Toggle **Investigative** and **Web-Grounded** as desired.
2. Press <kbd>Enter</kbd> or click **Initialize**.
3. **Review the swarm** in the Director — edit directives, add/remove specialists, or re-roll — then hit **Launch Swarm**.
4. Watch the swarm stream in the **Constellation** (or flip to **Grid**). Hit **Halt** to abort.
5. Read the dossier; reframe it through a **Lens** (Executive Brief, ELI5, Skeptic's Cut…); then <kbd>Copy</kbd>, **Download `.md`**, **Print / PDF**, or export a **full research bundle**.
6. **Interrogate the Swarm** — ask follow-ups (Exploratory can search the web; Strict stays dossier-only). The conversation is saved with the run.
7. Revisit any past run — dossier and Q&A — from **Run History**.

> [!NOTE]
> The orchestrator decides the swarm composition dynamically per query — the agents in your run will differ from the illustration above.

---

## 📂 Project Structure

```text
cognitive-swarm-engine/
├── server.ts                     # Express API + unified multi-provider LLM layer
│   ├── /api/models               #   → list available models per provider
│   ├── /api/orchestrate          #   → design + validate the agent swarm
│   ├── /api/execute              #   → one specialist's research (agentic web_search or native grounding)
│   ├── /api/synthesize           #   → compile the final dossier (streamed)
│   ├── /api/interrogate          #   → follow-up Q&A (strict, or exploratory + web search)
│   └── /api/lens                 #   → re-render the dossier for a different audience
├── src/
│   ├── App.tsx                   # Pipeline state machine + layout
│   ├── prompts.ts                # Editable prompt defaults (single source of truth)
│   ├── types.ts                  # Shared type contracts
│   ├── index.css                 # CRT-phosphor theme + Tailwind
│   └── components/
│       ├── AgentCard.tsx         # Streaming, expandable agent telemetry
│       ├── SwarmDirector.tsx     # Human-in-the-loop swarm review/editor
│       ├── SwarmConstellation.tsx# Animated live node-graph visualization
│       ├── InterrogatePanel.tsx  # Post-run Q&A grounded in the dossier
│       ├── ConfigPanel.tsx       # Provider + per-role model configuration
│       └── GeometricAvatar.tsx   # Deterministic seeded agent sigils
├── index.html
└── vite.config.ts
```

---

## 🛠 Tech Stack

<div align="center">

| Layer | Technologies |
|:---:|:---|
| **Frontend** | React 19 · TypeScript · Tailwind CSS 4 · lucide-react · react-markdown + remark-gfm |
| **Backend** | Express 4 · `@google/genai` · native `fetch` streaming |
| **Tooling** | Vite 6 · tsx · esbuild |
| **AI Providers** | Gemini · OpenAI · OpenRouter · Anthropic · Venice.ai · Ollama · LM Studio |

</div>

---

## 🗺 Roadmap

- [x] Multi-provider orchestration pipeline
- [x] Streaming specialist telemetry
- [x] Expandable per-agent output
- [x] Halt / abort control
- [x] Dossier copy + download
- [x] Run history persistence
- [x] Streaming synthesis[^1] — the dossier renders token-by-token as it compiles
- [x] Human-in-the-loop swarm editing (Swarm Director)
- [x] Live swarm graph visualization (Constellation)
- [x] Conversational dossier Q&A (Interrogate the Swarm)
- [x] Web-grounded research with citations (native Gemini + Brave/Serply/SearXNG)
- [x] Audience lenses for the dossier
- [x] Investigative mode + exploratory (web-searching) interrogation
- [x] Agentic tool-use web search (real `web_search` function tool)
- [x] Editable prompts in the config panel
- [x] Export dossier to PDF + full research bundle
- [x] Persist Q&A threads with run history
- [ ] Shareable run permalinks
- [ ] Live search activity in the telemetry HUD

---

<div align="center">

### ⬡

**Built for parallel minds.**

<sub>Orchestrate · Execute · Synthesize</sub>

</div>

[^1]: Every stage now streams — specialists during execution and the synthesizer during compilation — so a long, multi-page dossier renders progressively instead of appearing all at once at the end.
