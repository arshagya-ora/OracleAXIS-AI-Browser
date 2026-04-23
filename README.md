# Oracle AXIS

**Oracle AXIS** is an AI-powered browser automation assistant that helps developers, QA engineers, and operations teams execute complex web workflows through plain natural-language instructions. It eliminates manual, repetitive browser work by letting an AI agent navigate, interact, and extract information from any web application — in real time, inside your own browser.

---

## Problem

Modern engineering teams lose significant time to repetitive, browser-heavy workflows — manual testing, data extraction, multi-step form submissions, and operational tasks across web portals. These tasks are too dynamic for traditional scripts, too time-consuming to delegate manually, and too context-heavy for simple automation tools. Mistakes are costly, especially under time pressure.

---

## Solution

Oracle AXIS provides a command-and-observe workflow:

- Issue any natural-language instruction from a browser sidebar
- A dual-agent AI system plans and executes the task autonomously
- Real-time activity feed shows every action as it happens
- Conversational follow-up lets you refine, extend, or redirect mid-task
- Pluggable LLM backend so teams connect their preferred AI provider

---

## Key Features

| Feature | Description |
|---|---|
| Dual-agent architecture | A Planner reasons about goals while a Navigator executes browser actions |
| 20-action browser vocabulary | Navigation, interaction, scrolling, tabs, dropdowns, keyboard shortcuts, and extraction |
| Conversational interface | SageBot-style follow-up and task chaining from the sidebar |
| Pluggable LLM support | OpenAI, Anthropic, Gemini, Ollama, DeepSeek, Grok, Groq, Cerebras, Azure, and more |
| Real-time execution feed | Intent-labelled actions streamed live for full transparency |
| URL firewall and access control | Allow/deny lists scope automation to safe domains |
| Task replay | Record a session once, re-execute it reliably on demand |

---

## How Browser Automation Works

Oracle AXIS controls the browser through **Puppeteer Core** connected over the **Chrome DevTools Protocol (CDP)** — the same low-level wire protocol Chrome itself uses for its DevTools. This means the extension drives a real, fully rendered browser tab rather than a headless simulation or DOM emulator.

### Connection flow

```
Side Panel (React UI)
       │  chrome.runtime.connect()
       ▼
Background Service Worker
       │  ExtensionTransport.connectTab(tabId)
       ▼
Puppeteer Core  ──CDP──▶  Live Chrome Tab
```

1. The user submits a task from the side panel.
2. The background service worker creates a `Page` object and connects Puppeteer to the active tab via `ExtensionTransport.connectTab()` — no separate browser process is spawned.
3. Puppeteer exposes the full CDP surface: DOM inspection, JavaScript execution, screenshot capture, input simulation, and network interception.
4. Anti-detection scripts are injected on attach to mask the `webdriver` flag and normalize permissions and Shadow DOM behaviour — making automation indistinguishable from a human session.
5. Every action result (success, failure, extracted content) is streamed back to the side panel as a structured execution event.

### Anti-detection measures

- `navigator.webdriver` spoofed to `false`
- Permissions API normalised to suppress automation-related prompts
- Shadow DOM piercing utilities injected for SPAs that rely on Web Components

### DOM representation

Before each agent step, Oracle AXIS serialises the visible DOM into a structured element tree annotated with interactive indices. The Navigator agent references these numeric indices when issuing `click_element` or `input_text` actions, so actions are always grounded in the current page state — not stale selectors.

---

## Browser Action Vocabulary

The Navigator agent can issue any combination of these 20 actions per step:

| # | Action | What it does |
|---|---|---|
| 1 | `go_to_url` | Navigate the current tab to a URL |
| 2 | `search_google` | Open a Google search for a query |
| 3 | `go_back` | Navigate back in browser history |
| 4 | `click_element` | Click an element by its DOM index |
| 5 | `input_text` | Type text into an input, textarea, or contenteditable |
| 6 | `send_keys` | Send raw keyboard keys or shortcuts (e.g. `Ctrl+A`, `Enter`) |
| 7 | `get_dropdown_options` | Enumerate all options in a native `<select>` element |
| 8 | `select_dropdown_option` | Select a `<select>` option by visible text |
| 9 | `scroll_to_top` | Jump to the top of the page |
| 10 | `scroll_to_bottom` | Jump to the bottom of the page |
| 11 | `scroll_to_percent` | Scroll to a vertical position (0–100%) |
| 12 | `scroll_to_text` | Scroll until specific text is visible |
| 13 | `previous_page` | Scroll up by one viewport height |
| 14 | `next_page` | Scroll down by one viewport height |
| 15 | `open_tab` | Open a URL in a new tab |
| 16 | `switch_tab` | Focus a tab by its ID |
| 17 | `close_tab` | Close a tab by its ID |
| 18 | `cache_content` | Store extracted content for use in later steps |
| 19 | `wait` | Pause for N seconds (e.g. after a page load or animation) |
| 20 | `done` | Signal task completion and return a final answer |

All actions are defined with **Zod schemas** for runtime type validation, so malformed agent outputs are caught before execution.

---

## Dual-Agent Architecture

```
User Instruction
       │
       ▼
  ┌─────────┐        structured plan
  │ Planner │ ──────────────────────────────────▶ ┌───────────┐
  │  Agent  │ ◀── browser state + action results ─ │ Navigator │
  └─────────┘                                      │   Agent   │
                                                   └───────────┘
                                                         │
                                                    CDP actions
                                                         │
                                                         ▼
                                                   Live Chrome Tab
```

### Planner Agent

- **Role:** Reads the full conversation history and current browser state, then produces a structured reasoning trace.
- **Output fields:** `observation`, `challenges`, `next_steps`, `reasoning`, `done` (boolean), `final_answer`, `web_task`.
- **Vision:** Optionally consumes a screenshot of the current page to ground its reasoning in what is visually rendered.
- **Interval:** Runs every N steps (configurable `planningInterval`, default 3) to avoid re-planning on every micro-action.

### Navigator Agent

- **Role:** Receives the Planner's `next_steps` and the annotated DOM tree, then emits one or more actions per step.
- **Output fields:** `current_state.next_goal` (the immediate sub-goal) + an ordered `action[]` array referencing the 20-action vocabulary.
- **Structured output:** Uses LangChain's `withStructuredOutput()` so the LLM response is always a typed object. Falls back to manual JSON extraction if the provider does not support native tool calling.
- **Replay:** `executeHistoryStep()` can re-run a recorded step against the current DOM, remapping element indices if the page structure has changed.

### Agent Models — Independent Assignment

Each agent can be assigned a different model and provider. A common pattern is:

- **Planner** → large reasoning model (e.g. `claude-opus-4-1`, `gpt-5`)
- **Navigator** → fast, cost-efficient model (e.g. `claude-haiku-4-5`, `gemini-2.5-flash`)

Temperature and `topP` are tunable per agent to balance creativity (Planner) against determinism (Navigator).

---

## Supported LLM Providers

| Provider | Models (examples) |
|---|---|
| OpenAI | gpt-5.1, gpt-5, gpt-4.1, gpt-4o |
| Anthropic | claude-opus-4-1, claude-sonnet-4-5, claude-haiku-4-5 |
| Google Gemini | gemini-2.5-pro, gemini-2.5-flash, gemini-3-pro-preview |
| Ollama (local) | qwen3:14b, falcon3:10b, mistral-small:24b |
| DeepSeek | deepseek-chat, deepseek-reasoner |
| Grok (xAI) | grok-3, grok-3-mini |
| Groq | llama-4-maverick, llama-4-scout, qwen-qwq |
| Azure OpenAI | Custom deployment names + Azure endpoint |
| OpenRouter | Any model routed through OpenRouter |
| Cerebras | Cerebras inference endpoints |
| Llama API | Meta Llama API |
| Custom OpenAI | Any OpenAI-compatible endpoint |

API keys and base URLs are stored in Chrome local storage under `llm-api-keys`. No data is ever sent to Oracle AXIS servers — all inference calls go directly from your browser to the provider.

---

## URL Firewall and Access Control

The firewall evaluates every navigation before Puppeteer executes it.

**Always blocked (hard-coded):**
- `chrome://`, `chrome-extension://` — extension internals
- `javascript:`, `data:`, `vbscript:` — code injection vectors
- `file://` — local filesystem
- `ws://`, `wss://` — raw WebSocket URLs
- `https://chromewebstore.google.com` — extension store (scripts cannot inject)

**Configurable lists:**
- **Allow list** — only these domains/URLs are reachable
- **Deny list** — these domains/URLs are always blocked (checked before allow list)
- Matching is domain-aware: `example.com` in the deny list also blocks `sub.example.com`
- `about:blank` is always allowed

Configure lists in **Options → Firewall**. When both lists are empty and the firewall is enabled, all non-hard-blocked URLs are permitted.

---

## Task Replay

Every Navigator step is persisted as an `AgentStepRecord`:

```ts
{
  modelOutput: string,   // raw JSON from the LLM
  result: ActionResult[], // outcome of each action
  state: BrowserStateHistory, // snapshot of DOM + URL at step time
  metadata: { ... }
}
```

When you click **Replay** on a previous session:

1. The Navigator reads the stored `modelOutput` and re-parses the action list.
2. For each `click_element` or `input_text` action, `updateActionIndices()` searches the current DOM for the same element using `HistoryTreeProcessor.findHistoryElementInTree()`. If the element moved, the index is updated automatically.
3. Steps execute with configurable retry logic (default 3 retries per step).
4. If an element no longer exists, the step is skipped or the replay falls back to live agent execution.

Enable replay in **Options → General → Replay historical tasks**.

---

## Daily Workflow Examples

### Developer workflows

**Populate a staging environment form**
> "Go to staging.myapp.com/admin, log in with my test credentials, navigate to Users, create a new user with email test@example.com, role Editor, and confirm."

**Cross-browser regression check**
> "Open app.myapp.com, navigate through the checkout flow with a Visa test card, and tell me if the order confirmation page loads correctly."

**API key rotation**
> "Go to the AWS console, open IAM, find the access key for ci-deploy, deactivate it, create a new one, and copy the key ID and secret."

### QA engineer workflows

**Smoke test a release**
> "Run through the login, search, add to cart, and checkout flows on the staging URL and report any errors or unexpected redirects."

**Validate a form with edge-case inputs**
> "On the signup page, try submitting with an empty email, a 300-character name, and a password with special characters. Report what validation messages appear."

**Screenshot comparison baseline**
> "Visit these 5 URLs and take a screenshot of each: [list]. Save them and tell me if any page shows a 404 or blank content."

### Operations workflows

**Monitor a deployment dashboard**
> "Go to deploy.internal/pipelines, find the last failed pipeline for the 'backend' service, and give me the error summary from the logs."

**Bulk data extraction**
> "Go to the analytics portal, navigate to the weekly report for each of these 10 projects, and extract the MAU and error rate numbers into a table."

**Ticket triage**
> "Open Jira, filter for P1 bugs assigned to nobody created in the last 24 hours, and list their titles and URLs."

### Conversational task chaining

Once a task completes, you can continue without starting over:

> "Now filter the results to only show items created after March 1st."
> "Go back and do the same thing for the production environment."
> "Save the extracted table to my clipboard."

---

## Architecture Overview

```
oracle-axis/
├── chrome-extension/          # Manifest V3 extension + background worker
│   └── src/
│       ├── background/
│       │   ├── agent/         # Planner + Navigator agents, action schemas, history
│       │   └── browser/       # Puppeteer/CDP page control, firewall, DOM utils
│       └── content/           # Content scripts injected into every page
├── pages/
│   ├── side-panel/            # Chat UI — task input, message feed, history, replay
│   └── options/               # Settings — models, providers, firewall, general
└── packages/
    ├── storage/               # Chrome storage abstraction (providers, agents, settings)
    ├── ui/                    # Shared React components + Tailwind tokens
    ├── shared/                # Common hooks and utilities
    ├── i18n/                  # Chrome extension locale helpers
    └── schema-utils/          # Zod/JSON schema utilities
```

### Messaging

The side panel and background worker communicate over a long-lived `chrome.runtime.connect()` port:

| Message | Direction | Purpose |
|---|---|---|
| `new_task` | Panel → Background | Start a new automation task |
| `follow_up_task` | Panel → Background | Continue with a follow-up instruction |
| `cancel_task` / `pause_task` / `resume_task` | Panel → Background | Lifecycle control |
| `execution_event` | Background → Panel | Stream agent actions and results in real time |
| `heartbeat` / `heartbeat_ack` | Bidirectional | Detect and recover from disconnections |

---

## Technical Stack

| Layer | Technology |
|---|---|
| Extension platform | Chrome Manifest V3, `side_panel` API |
| UI framework | React 18 + TypeScript |
| Styling | Tailwind CSS |
| Build system | Vite (per workspace) + Turborepo (monorepo orchestration) |
| Package manager | pnpm workspaces |
| Browser automation | Puppeteer Core + Chrome DevTools Protocol (CDP) |
| Agent framework | LangChain.js (`withStructuredOutput`, chat models) |
| Schema validation | Zod (action schemas, storage types) |
| Storage | Chrome Local Storage with live-update reactive wrappers |
| Type checking | TypeScript (strict mode across all workspaces) |
| Linting / formatting | ESLint + Prettier + Husky + lint-staged |
| Testing | Vitest (unit), end-to-end build-and-zip pipeline |
| Node.js | >= 22.12.0 (enforced via `.nvmrc` + `engine-strict=true`) |

---

## Installation and Setup

### Prerequisites

- Node.js >= 22.12.0 (`nvm use` to match `.nvmrc`)
- pnpm (`npm install -g pnpm`)
- Chrome or Edge (Manifest V3 required)

### Build and load

```bash
# Install dependencies
pnpm install

# Development mode with hot reload
pnpm dev

# Production build
pnpm build

# Package as zip for distribution
pnpm zip
```

Load the extension:

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` directory

### Configure your LLM provider

1. Click the Oracle AXIS icon → **Options**
2. Under **Model Settings**, add your provider (e.g. OpenAI) and API key
3. Assign a model to the **Planner** and **Navigator** agents independently
4. (Optional) Configure the **Firewall** to restrict which domains the agent can visit

---

## Development Scripts

```bash
pnpm dev               # Start all workspaces in watch mode
pnpm build             # Full production build
pnpm type-check        # TypeScript checks across all workspaces
pnpm lint              # ESLint with auto-fix
pnpm prettier          # Prettier formatting
pnpm clean             # Remove dist, Turbo cache, and node_modules
pnpm clean:bundle      # Remove build outputs only
pnpm zip               # Build + package as .zip

# Workspace-scoped (faster)
pnpm -F chrome-extension build
pnpm -F pages/side-panel type-check
pnpm -F chrome-extension test
pnpm -F chrome-extension test -- -t "Sanitizer"
```

---

## Impact

Oracle AXIS eliminates hours of manual browser work per incident or workflow cycle. It gives engineers the ability to delegate any web task to AI — without writing scripts, setting up automation frameworks, or waiting on QA cycles. Teams move faster, make fewer errors, and stay focused on what only humans should decide.

---

## Vision

Our vision is to make browser automation conversational, transparent, and universally accessible — so any engineer, regardless of automation expertise, can command the web and get reliable results in seconds.

---

## License

Apache-2.0

## Repository

https://github.com/oracle-axis/oracle-axis.git
