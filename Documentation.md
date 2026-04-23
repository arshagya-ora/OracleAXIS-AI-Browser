# Oracle AXIS

Oracle AXIS is a Manifest V3 browser extension monorepo that runs an AI web agent inside the browser.
It combines:

- a React side panel for chat-style task execution
- a React options page for model and runtime configuration
- a background service worker that acts as the execution backend
- a browser automation layer built on Chrome APIs plus `puppeteer-core`
- local extension storage for settings, chat history, replay data, and prompt favorites

Important architectural fact:

- There is no standalone backend server in this repository.
- The "backend" is the extension background service worker in `chrome-extension/src/background/index.ts`.
- External LLM provider APIs are the only remote services used for inference.

This document describes the current implementation in the repository as it exists in code.

## Table of Contents

- [What This Project Does](#what-this-project-does)
- [High-Level Architecture](#high-level-architecture)
- [What Runs Where](#what-runs-where)
- [How Frontend and Backend Are Connected](#how-frontend-and-backend-are-connected)
- [End-to-End Task Execution Flow](#end-to-end-task-execution-flow)
- [Repository Layout](#repository-layout)
- [Workspace Packages](#workspace-packages)
- [Tech Stack](#tech-stack)
- [How Browser Automation Works](#how-browser-automation-works)
- [AI Agent System](#ai-agent-system)
- [Model and Provider Layer](#model-and-provider-layer)
- [Storage and Persistence](#storage-and-persistence)
- [Security, Guardrails, and Permissions](#security-guardrails-and-permissions)
- [Side Panel Features and Commands](#side-panel-features-and-commands)
- [Development, Build, and Packaging](#development-build-and-packaging)
- [Expected Build Output](#expected-build-output)
- [Testing and Quality Checks](#testing-and-quality-checks)
- [Current Implementation Notes and Caveats](#current-implementation-notes-and-caveats)
- [License](#license)

## What This Project Does

Oracle AXIS lets a user describe a web task in natural language from a browser side panel, then tries to complete that task by:

1. reading the current page state
2. planning the next steps with an LLM-powered Planner agent
3. executing browser actions with an LLM-powered Navigator agent
4. feeding execution results back into the next planning/navigation cycle
5. streaming status updates back to the side panel UI

Core user-facing capabilities currently implemented in the repo include:

- AI-guided browser automation in a side panel
- multi-step planning and navigation
- model/provider configuration in an options page
- firewall allow/deny URL controls
- persistent chat sessions
- replay of historical task steps
- prompt favorites/bookmarks
- text file attachment support in chat input
- localized extension messages through Chrome `_locales`

## High-Level Architecture

```text
User
  |
  v
Side Panel UI (React) --------------------+
                                          |
Options UI (React) ---- chrome.storage ---+----> Background Service Worker
                                          |            |
                                          |            +--> LangChain chat model clients
                                          |            |      (OpenAI, Gemini, Ollama, etc.)
                                          |            |
                                          |            +--> BrowserContext / Page
                                          |                    |
                                          |                    +--> chrome.tabs
                                          |                    +--> chrome.scripting
                                          |                    +--> chrome.webNavigation
                                          |                    +--> chrome.debugger
                                          |                    +--> puppeteer-core ExtensionTransport
                                          |
                                          +<--- execution events over runtime Port
                                                               |
                                                               v
                                                     Browser tabs / DOM / injected scripts
```

In short:

- Frontend = side panel page + options page
- Backend = background service worker
- Automation surface = active browser tabs and injected page scripts
- Persistence = `chrome.storage.local`
- Remote compute = external LLM APIs configured by the user

## What Runs Where

| Component | Location | Runtime role |
| --- | --- | --- |
| Side panel UI | `pages/side-panel` | Main chat interface for task entry, progress display, history, replay, and favorites |
| Options UI | `pages/options` | Settings screen for providers, agent model selection, general settings, and firewall |
| Content script | `pages/content` | Injected into all pages, but currently only logs that it loaded |
| Background service worker | `chrome-extension/src/background` | Real execution engine and orchestration backend |
| Injected DOM script | `chrome-extension/public/buildDomTree.js` | Runs in page context to build a structured DOM/action model |
| Shared storage package | `packages/storage` | Wraps `chrome.storage` and exposes typed stores |
| Shared UI/helpers | `packages/ui`, `packages/shared`, `packages/i18n` | Shared components, hooks, HOCs, and i18n utilities |
| Build/dev tooling | `packages/hmr`, `packages/vite-config`, `packages/dev-utils`, `packages/zipper` | Manifest generation, HMR/refresh, packaging, workspace build helpers |

## How Frontend and Backend Are Connected

This project does not use HTTP between its frontend and backend. The connection is entirely extension-internal.

### Side panel -> background

- The side panel opens a long-lived runtime port with `chrome.runtime.connect({ name: 'side-panel-connection' })`.
- The background service worker listens on `chrome.runtime.onConnect`.
- The background explicitly verifies:
  - the port name
  - the sender extension ID
  - the sender URL matches the extension side-panel page
- The side panel sends messages such as:
  - `new_task`
  - `follow_up_task`
  - `cancel_task`
  - `pause_task`
  - `resume_task`
  - `state`
  - `nohighlight`
  - `replay`
- The background posts execution events and errors back over the same port.

### Options page -> storage

- The options page does not talk to the background service worker for normal settings changes.
- It reads and writes directly to typed storage wrappers in `packages/storage`.
- Those wrappers persist to `chrome.storage.local`.

### Background -> browser tabs

- The background uses Chrome extension APIs to query tabs, update tabs, inject scripts, and inspect frame structure.
- For advanced interaction it attaches to the active tab through `chrome.debugger` and `puppeteer-core`'s extension transport.

### Background -> LLM providers

- The background constructs LangChain chat model clients from the user's configured provider settings.
- API keys and model selections are pulled from local extension storage.
- There is no proxy service in this repository; requests go directly from the extension runtime to the configured provider endpoint.

## End-to-End Task Execution Flow

The real execution loop is:

1. The user submits a task from the side panel.
2. The side panel creates or reuses a chat session ID and sends `new_task` or `follow_up_task` to the background.
3. The background validates that:
   - at least one provider exists
   - configured agent models reference valid providers
   - a Navigator model is configured
4. The background loads:
   - provider configs
   - agent model configs
   - firewall settings
   - general settings
5. The background creates an `Executor`.
6. The `Executor` creates:
   - a `PlannerAgent`
   - a `NavigatorAgent`
   - an `AgentContext`
   - a `MessageManager`
   - an `EventManager`
7. The Navigator asks the browser layer for current page state.
8. The browser layer:
   - ensures the current tab is attached
   - injects `buildDomTree.js` when needed
   - builds a structured DOM tree
   - assigns highlight indices to interactive elements
   - optionally captures a screenshot if vision is enabled
9. The Navigator sends the current state to the LLM and receives structured actions.
10. The action builder validates and executes those actions against the browser.
11. Action results are written back into agent memory.
12. Every `planningInterval` steps, or when the Navigator believes it is done, the Planner runs and decides whether the overall task is complete.
13. Execution events are emitted throughout the run and streamed back to the side panel.
14. If replay storage is enabled, the detailed step history is saved for later replay.

## Repository Layout

### Top-level directories

| Path | Purpose |
| --- | --- |
| `chrome-extension/` | Extension manifest, background service worker, browser automation engine, agent runtime |
| `pages/` | Extension UI pages and content script package |
| `packages/` | Shared workspace libraries and build tooling |
| `.github/` | Issue templates and funding metadata |
| `.claude/` | Local assistant-related project metadata |

### Pages

| Path | Purpose |
| --- | --- |
| `pages/side-panel/` | React side panel application |
| `pages/options/` | React options/settings application |
| `pages/content/` | Content script package |

### Key root files

| File | Purpose |
| --- | --- |
| `package.json` | Root workspace scripts and shared dependencies |
| `pnpm-workspace.yaml` | Workspace package registration |
| `turbo.json` | Turborepo pipeline configuration |
| `.env.example` | Example env file with PostHog placeholders |
| `.example.env` | Minimal example env file |
| `generate-icons.mjs` | Icon generation helper |

### Key runtime entry points

| File | Role |
| --- | --- |
| `chrome-extension/manifest.js` | Manifest V3 definition and browser-specific manifest shaping |
| `chrome-extension/src/background/index.ts` | Background service worker entry point |
| `pages/side-panel/src/index.tsx` | Side panel React entry point |
| `pages/options/src/index.tsx` | Options React entry point |
| `pages/content/src/index.ts` | Content script entry point |
| `chrome-extension/public/buildDomTree.js` | Injected page-context DOM extraction script |

## Workspace Packages

| Package | Path | Purpose |
| --- | --- | --- |
| `@extension/storage` | `packages/storage` | Typed wrappers around `chrome.storage` for settings, history, favorites, profile, and STT config |
| `@extension/shared` | `packages/shared` | Shared React hooks and HOCs |
| `@extension/ui` | `packages/ui` | Shared UI components and global CSS |
| `@extension/i18n` | `packages/i18n` | Locale generation and translation helpers |
| `@extension/hmr` | `packages/hmr` | Dev-time refresh/HMR support for extension pages |
| `@extension/vite-config` | `packages/vite-config` | Shared Vite config helpers for extension pages |
| `@extension/dev-utils` | `packages/dev-utils` | Manifest parsing and build helper utilities |
| `@extension/schema-utils` | `packages/schema-utils` | JSON schema helper utilities |
| `@extension/tailwindcss-config` | `packages/tailwind-config` | Shared Tailwind configuration |
| `@extension/tsconfig` | `packages/tsconfig` | Shared TypeScript config presets |
| `zipper` | `packages/zipper` | Zips the final extension build into `.zip` or `.xpi` |

## Tech Stack

### Language and framework

- TypeScript
- React 18
- Vite 6
- Turborepo
- pnpm workspaces

### Browser extension platform

- Chrome Extension Manifest V3
- Chrome `sidePanel` API
- Chrome `scripting`, `tabs`, `webNavigation`, `storage`, and `debugger` APIs

### Styling

- Tailwind CSS
- PostCSS
- shared UI package CSS

### AI / model layer

- LangChain chat model adapters
- OpenAI
- Anthropic
- DeepSeek
- Gemini
- xAI / Grok
- Groq
- Cerebras
- Ollama
- OpenRouter
- Azure OpenAI
- Llama API
- custom OpenAI-compatible providers

### Browser automation

- `puppeteer-core`
- Chrome debugger transport
- custom DOM extraction and interactive element indexing

### Validation and schemas

- Zod
- `zod-to-json-schema`
- `jsonrepair`

### Quality / tooling

- ESLint
- Prettier
- Husky
- lint-staged
- Vitest

### Runtime requirements

- Node.js `>= 22.12.0`
- pnpm `9.15.1` (declared package manager)

## How Browser Automation Works

This is the most important implementation detail in the project.

### 1. Tab attachment

- `BrowserContext` tracks the active tab and a map of attached `Page` instances.
- When automation starts, the background either:
  - attaches to the current active tab, or
  - creates a new tab if none is available

### 2. Debugger + Puppeteer connection

- A `Page` attaches via `ExtensionTransport.connectTab(tabId)`.
- This uses Chrome's debugger API instead of launching a separate browser process.
- Once attached, Oracle AXIS can drive the live browser tab with Puppeteer APIs.

### 3. DOM extraction

- The extension injects `buildDomTree.js` into the page context.
- That script produces a structured DOM tree plus a selector map.
- Interactive elements receive numeric `highlightIndex` values.
- The LLM sees the page as a compact textual list such as indexed clickable elements and selected attributes.

### 4. Cross-frame handling

- The DOM service uses `chrome.webNavigation.getAllFrames` to inspect frame structure.
- If some iframe DOMs cannot be stitched during the main pass, the background re-builds those frames individually and merges them into the tree when possible.

### 5. Navigation and stability waits

- After actions such as navigation, refresh, click, or typing, the page layer waits for a custom "stable enough" state.
- The implementation uses a custom network-idle heuristic instead of only relying on `load`.
- It ignores many background requests such as analytics, tracking, media, websocket, and streaming traffic.

### 6. Highlighting and vision

- The DOM extraction layer can highlight interactive elements visually in-page.
- If vision is enabled, the page layer also captures a JPEG screenshot and sends it as multimodal input.

### 7. Anti-detection shims

- After Puppeteer attaches, the page injects a few shims such as:
  - hiding `navigator.webdriver`
  - forcing open shadow DOM attachment
  - stubbing parts of `window.chrome`
  - patching permissions queries

These are implementation details of the current automation layer, not a separate product subsystem.

## AI Agent System

### Main classes

| Class | Role |
| --- | --- |
| `Executor` | Owns the main task loop and coordinates Planner + Navigator |
| `PlannerAgent` | Decides whether the task is complete and what should happen next |
| `NavigatorAgent` | Chooses concrete browser actions to execute |
| `ActionBuilder` | Registers all supported browser actions |
| `MessageManager` | Maintains prompt history, tool-call history, state messages, and task wrapping |
| `EventManager` | Emits execution events back to the UI |

### Planner responsibilities

The Planner runs periodically and returns structured fields such as:

- `observation`
- `challenges`
- `done`
- `next_steps`
- `final_answer`
- `reasoning`
- `web_task`

The `Executor` treats the task as complete only when the Planner confirms `done === true`.

### Navigator responsibilities

The Navigator:

- gets the current browser state
- builds the user prompt from indexed page elements and tab info
- asks the LLM for structured action output
- validates the action list
- executes actions
- records results for the next step

### Supported actions

The default action registry currently includes:

- `done`
- `search_google`
- `go_to_url`
- `go_back`
- `click_element`
- `input_text`
- `switch_tab`
- `open_tab`
- `close_tab`
- `cache_content`
- `scroll_to_percent`
- `scroll_to_top`
- `scroll_to_bottom`
- `previous_page`
- `next_page`
- `scroll_to_text`
- `send_keys`
- `get_dropdown_options`
- `select_dropdown_option`
- `wait`

### Replay system

If replay history is enabled:

- each executor run stores the agent step history in storage
- replay loads the saved model output and action history
- historical interacted elements are matched back against the current DOM tree
- element indices are rewritten if the page structure changed
- the actions are then re-executed with retry support

## Model and Provider Layer

### Provider support implemented in code

The provider enum and model helper layer support:

- OpenAI
- Anthropic
- DeepSeek
- Gemini
- Grok
- Ollama
- Azure OpenAI
- OpenRouter
- Groq
- Cerebras
- Llama
- custom OpenAI-compatible providers

### Default model presets in code

The repository currently ships these default model lists in `packages/storage/lib/settings/types.ts`:

| Provider | Default model presets |
| --- | --- |
| OpenAI | `gpt-5.1`, `gpt-5`, `gpt-5-pro`, `gpt-5-mini`, `gpt-5-chat-latest`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o` |
| Anthropic | `claude-sonnet-4-5`, `claude-haiku-4-5`, `claude-opus-4-1` |
| DeepSeek | `deepseek-chat`, `deepseek-reasoner` |
| Gemini | `gemini-3-pro-preview`, `gemini-2.5-flash`, `gemini-2.5-pro` |
| Grok | `grok-4`, `grok-4-fast-non-reasoning`, `grok-3`, `grok-3-fast` |
| Ollama | `qwen3:14b`, `falcon3:10b`, `qwen2.5-coder:14b`, `mistral-small:24b` |
| Azure OpenAI | `gpt-5`, `gpt-5-mini`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o` |
| OpenRouter | `google/gemini-2.5-pro`, `google/gemini-2.5-flash`, `openai/gpt-4o-2024-11-20` |
| Groq | `llama-3.3-70b-versatile` |
| Cerebras | `llama-3.3-70b` |
| Llama | `Llama-3.3-70B-Instruct`, `Llama-3.3-8B-Instruct`, `Llama-4-Maverick-17B-128E-Instruct-FP8`, `Llama-4-Scout-17B-16E-Instruct-FP8` |

### Provider-specific handling in code

- OpenAI and Azure reasoning-capable models support `reasoning_effort`
- Azure uses deployment names instead of plain model names
- OpenRouter requests attach `HTTP-Referer` and `X-Title` headers
- Ollama defaults to `http://localhost:11434`
- Llama API uses a custom response adapter because its response shape differs from OpenAI-style chat completions
- custom providers fall back to an OpenAI-compatible client path

### Agent roles

There are two configurable agent roles:

- `planner`
- `navigator`

At runtime:

- the Navigator model is mandatory
- the Planner model is optional and will fall back to the Navigator model if not set

### Current options UI exposure

The current add-provider dropdown in the Options page only exposes:

- OpenAI
- Gemini
- Ollama
- Grok

However, the codebase already contains support paths for additional providers such as Azure OpenAI and custom OpenAI-compatible providers.

## Storage and Persistence

All persistent data in the inspected runtime is stored in `chrome.storage.local` through the `createStorage()` wrapper in `packages/storage/lib/base/base.ts`.

### Main storage records

| Storage key | Purpose |
| --- | --- |
| `llm-api-keys` | Provider configurations and API keys |
| `agent-models` | Planner/Navigator model selections and parameters |
| `general-settings` | Task/runtime settings |
| `firewall-settings` | Allow/deny URL rules and firewall enabled flag |
| `speech-to-text-model` | Selected speech-to-text model config |
| `chat_sessions_meta` | Chat session metadata index |
| `chat_messages_<sessionId>` | Chat messages for a session |
| `chat_agent_step_<sessionId>` | Replayable step history for a session |
| `favorites` | Prompt favorites/bookmarks |
| `user-profile` | Lightweight user profile with generated user ID |

### What is persisted

| Data | Where it is used |
| --- | --- |
| Provider configs and API keys | Background model creation |
| Agent model mapping | Determines which model each agent uses |
| General settings | Step counts, planning interval, page wait timing, replay toggle |
| Firewall lists | URL permission checks during automation |
| Chat messages | Side panel session history |
| Step history | Replay support |
| Favorites | Side panel saved prompts |
| Speech-to-text model | Background Gemini-based transcription path |

### Chat history model

- Sessions have metadata (`id`, `title`, `createdAt`, `updatedAt`, `messageCount`)
- Messages are stored separately per session
- Replay history is stored separately from visible chat messages
- If replay history is disabled, normal chat messages are still stored but step history is skipped

### Favorites behavior

- Favorites are stored separately from chat sessions
- On first use, the store seeds a few default prompt templates
- Favorites can be edited, deleted, and reordered

## Security, Guardrails, and Permissions

### Prompt/content guardrails

The project includes a dedicated guardrails service in `chrome-extension/src/background/services/guardrails`.

It sanitizes untrusted content for threats such as:

- task override attempts
- prompt injection references
- fake internal tag references
- basic sensitive data patterns
- strict-mode credential and email patterns

The message layer wraps page and attachment content in explicit blocks such as:

- `<nano_untrusted_content>`
- `<nano_user_request>`
- `<nano_attached_files>`
- `<nano_file_content>`

This is used to reduce prompt injection risk from:

- page content
- copied text
- attached files
- model outputs that echo malicious instructions

### Firewall behavior

Firewall settings are applied directly to the browser context.

Behavior summary:

- if both allow and deny lists are empty, all normal web URLs are allowed
- dangerous URLs are always blocked
- deny checks and allow checks work on both full URL and domain
- domains are normalized to lowercase and stripped of `http://` / `https://` in settings storage

Hard-blocked prefixes currently include:

- `https://chromewebstore.google.com`
- `chrome-extension://`
- `chrome://`
- `javascript:`
- `data:`
- `file:`
- `vbscript:`
- `ws:`
- `wss:`

### Manifest permissions

The extension requests broad permissions because full-page automation needs them.

| Permission | Why it is needed |
| --- | --- |
| `storage` | Persist settings, providers, history, and favorites |
| `scripting` | Inject DOM-processing scripts into tabs |
| `tabs` | Query, switch, create, update, and close tabs |
| `activeTab` | Interact with the currently active tab |
| `debugger` | Attach CDP transport for Puppeteer-based control |
| `unlimitedStorage` | Keep larger chat/replay histories locally |
| `webNavigation` | Inspect frame structure for DOM stitching |
| `sidePanel` | Open the Chrome side panel UI |
| host permissions `<all_urls>` | Allow automation across arbitrary websites |

### Port hardening

The background service worker rejects unauthorized side-panel port connections by checking:

- port name
- sender extension ID
- sender URL

## Side Panel Features and Commands

### Main side panel features

- start a new task
- send follow-up tasks
- stop a running task
- load historical sessions
- replay a session if step-history replay is enabled
- bookmark a session into favorites
- reuse a favorite prompt
- attach text-based files

### Supported file attachments

The side panel currently accepts text-oriented files only:

- `.txt`
- `.md`
- `.markdown`
- `.json`
- `.csv`
- `.log`
- `.xml`
- `.yaml`
- `.yml`

Current attachment limits in code:

- max file size: 1 MB per file
- files are read client-side as text
- file contents are wrapped and sanitized before being added to agent context

### Side panel commands

The command handler currently supports:

- `/state`
- `/nohighlight`
- `/replay <historySessionId>`

### Event model shown in the UI

The UI receives execution events for:

- `task.start`
- `task.ok`
- `task.fail`
- `task.pause`
- `task.resume`
- `task.cancel`
- `step.start`
- `step.ok`
- `step.fail`
- `step.cancel`
- `act.start`
- `act.ok`
- `act.fail`

### Options page tabs

The Options UI currently has:

- General
- Models
- Firewall
- Help

The Help tab opens an external docs URL instead of rendering local repository docs.

## Development, Build, and Packaging

### Prerequisites

```bash
node --version
pnpm --version
```

Expected:

- Node.js `>= 22.12.0`
- pnpm `9.x`

### Install dependencies

```bash
pnpm install --frozen-lockfile
```

### Start development mode

```bash
pnpm dev
```

What this does:

- runs `turbo ready`
- builds workspace libraries that need precompiled output
- runs watch-mode builds across the monorepo
- enables extension refresh/HMR support where configured

This is not a classic single dev server.
It is a multi-package watch pipeline that writes extension assets into `dist/`.

### Build production bundles

```bash
pnpm build
```

What this does:

- removes previous bundle output
- runs `turbo ready`
- runs the monorepo build pipeline

### Package the extension

```bash
pnpm zip
```

This:

- builds the workspace
- packages `dist/` into `dist-zip/extension-<timestamp>.zip`
- produces `.xpi` instead when Firefox mode is enabled

### Other useful scripts

```bash
pnpm clean
pnpm clean:bundle
pnpm clean:turbo
pnpm clean:node_modules
pnpm type-check
pnpm lint
pnpm lint:fix
pnpm prettier
pnpm e2e
```

### How to load the extension locally

1. Run `pnpm build`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Choose "Load unpacked".
5. Select the repository `dist/` directory.
6. Click the extension action icon to open the side panel.

### Build flags and browser variants

The build is influenced by these flags:

- `__DEV__=true`
  - enables development-oriented watch and refresh behavior
- `__FIREFOX__=true`
  - disables side panel manifest support
  - changes packaged archive extension to `.xpi`
- `__OPERA__=true`
  - adds Opera `sidebar_action` support in the manifest

### Environment files currently present

The repository contains:

- `.env.example`
- `.example.env`

Currently visible env entries:

- `VITE_POSTHOG_API_KEY`
- `VITE_POSTHOG_HOST`
- `VITE_EXAMPLE`

In the inspected runtime code, these env vars do not appear to be wired into current application behavior.

### Ollama note

If using Ollama from the extension, the UI reminds the user to allow extension origins, for example:

```bash
OLLAMA_ORIGINS=chrome-extension://*
```

## Expected Build Output

Based on the Vite and packaging configuration, the main production bundle is expected to be written under `dist/`.

Primary outputs include:

| Output path | Source |
| --- | --- |
| `dist/manifest.json` | generated from `chrome-extension/manifest.js` |
| `dist/background.iife.js` | background service worker bundle |
| `dist/content/index.iife.js` | content script bundle |
| `dist/options/index.html` and assets | options page build |
| `dist/side-panel/index.html` and assets | side panel build |
| `dist/_locales/*` | copied/generated extension locale files |
| icons, SVGs, CSS, public assets | copied from extension/page public directories |

The manifest is generated dynamically at build time by a custom Vite plugin.

## Testing and Quality Checks

### Available checks

- `pnpm type-check`
- `pnpm lint`
- `pnpm prettier`
- `pnpm -F chrome-extension test`

### Current test coverage visible in the repo

The checked-in automated tests found during inspection are centered on the guardrails subsystem:

- `chrome-extension/src/background/services/guardrails/__tests__/guardrails.test.ts`

Those tests cover:

- task override detection
- sanitization behavior
- strict vs non-strict mode
- sensitive data redaction
- message utility integration

### E2E note

- The root workspace has an `e2e` script.
- A dedicated checked-in end-to-end test suite was not found in the inspected repository tree.

## Current Implementation Notes and Caveats

These are important if you are trying to understand the project as it actually behaves today.

### 1. There is no standalone backend service

If you are looking for Express, Fastify, Next.js API routes, a database server, or REST endpoints, they are not part of this repository.

### 2. The content script is currently minimal

`pages/content/src/index.ts` only logs `"content script loaded"`.
The real DOM intelligence comes from the separately injected `buildDomTree.js` script, not from the content script bundle itself.

### 3. The code supports more providers than the current add-provider UI exposes

The provider layer contains support for many providers, but the add-provider dropdown currently only surfaces OpenAI, Gemini, Ollama, and Grok.

### 4. Speech-to-text exists in the background layer, but it is not obviously surfaced in the current side panel UI

- there is a `speech_to_text` message type in the background
- there is a `speechToTextModelStore`
- there is a Gemini-based `SpeechToTextService`
- the current chat input component does not expose a visible speech-to-text control

### 5. Vision settings are only partially surfaced

- `general-settings` includes `useVision` and `useVisionForPlanner`
- the current General settings UI does not expose those fields
- the executor currently hardcodes `useVisionForPlanner: true` when constructing agent options

### 6. The side panel readiness check is looser than runtime execution requirements

- the side panel considers the extension "configured" when at least one agent model exists
- the background executor actually requires a Navigator model before it can run a task

### 7. The chat input placeholder mentions `/help`, but `/help` is not implemented

The actual supported commands are `/state`, `/nohighlight`, and `/replay <historySessionId>`.

### 8. Replay history is optional

Replay of detailed action steps only works when `replayHistoricalTasks` was enabled during the original run.

### 9. Locale support exists and is generated into `_locales`

The repository currently includes locale files for:

- `en` (also the manifest `default_locale`)
- `pt_BR`
- `zh_TW`

### 10. A PostHog env example exists, but current runtime usage was not found

That suggests analytics support is either planned, optional, or not currently wired in this code snapshot.

## License

Apache-2.0

## Repository

https://github.com/oracle-axis/oracle-axis.git
