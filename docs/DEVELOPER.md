# Open Headers - Developer Documentation

Technical documentation for developers who want to understand, build, test, or contribute to the Open Headers browser extension.

## Architecture Overview

Open Headers is a browser extension built with **TypeScript**, **React 18**, and **Ant Design 5**. It uses a background service worker to manage HTTP header rules via the browser's `declarativeNetRequest` API and communicates with the [OpenHeaders desktop app](https://github.com/OpenHeaders/open-headers-app) over WebSocket.

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict mode) |
| Frontend | React 18, Ant Design 5, styled-components |
| Build | Vite 8 (Rolldown bundler, Terser minification) |
| Unit Tests | Vitest 4, @testing-library/react |
| E2E Tests | Playwright |
| Styling | LESS with CSS custom properties |
| State Management | React Context API |
| Package Manager | npm |

### Core Architecture

1. **Popup UI** (`src/popup/`) — React-based interface for managing header rules, recording sessions, and viewing connection state.

2. **Background Service Worker** (`src/background/`) — Manages `declarativeNetRequest` rules, WebSocket connection to the desktop app, request monitoring, and badge state.

3. **Context System** (`src/context/`) — `HeaderContext` for global header/source state, `ThemeContext` for dark/light mode.

4. **Shared Types** (`src/types/`) — Canonical type definitions shared across the extension, aligned with the desktop app's types.

5. **Recording System** (`src/assets/recording/`) — State machine, event accumulation, and content script injection for browser tab recording.

6. **Shared Utilities** (`src/utils/`) — Cross-browser API wrapper, storage chunking, header validation, messaging.

## Project Structure

```
open-headers-browser-extension/
├── src/
│   ├── popup/                     # React popup application
│   │   ├── App.tsx                # Main app with providers
│   │   ├── index.tsx              # React entry point
│   │   ├── components/
│   │   │   ├── Header.tsx         # App header with theme/menu dropdowns
│   │   │   ├── HeaderTable.tsx    # Rules table with sort/filter/search
│   │   │   ├── ActiveRules.tsx    # Active rules for current tab
│   │   │   ├── RulesList.tsx      # Tabbed view (Active, Rules, Tags)
│   │   │   ├── TagManager.tsx     # Tag grouping and bulk toggle
│   │   │   ├── ConnectionInfo.tsx # Floating disconnection alert
│   │   │   ├── Footer.tsx         # Recording controls, options, version
│   │   │   └── RecordingButton.tsx
│   │   ├── utils/
│   │   │   └── recording.ts       # Recording start/stop/state utilities
│   │   └── styles/
│   │       └── popup.less         # Main stylesheet
│   │
│   ├── background/                # Background service worker
│   │   ├── index.ts               # Entry point
│   │   ├── background.ts          # Main orchestrator
│   │   ├── header-manager.ts      # declarativeNetRequest rule builder
│   │   ├── websocket.ts           # WebSocket client (ws://127.0.0.1:59210)
│   │   ├── rule-validator.ts      # Header validation wrapper
│   │   ├── safari-websocket-adapter.ts
│   │   └── modules/
│   │       ├── rule-engine.ts     # Debounced rule update scheduler
│   │       ├── badge-manager.ts   # Extension badge state
│   │       ├── message-handler.ts # Popup/content script messages
│   │       ├── recording-handler.ts
│   │       ├── request-monitor.ts # webRequest event tracking
│   │       ├── request-tracker.ts # Active rule tracking per tab
│   │       ├── tab-listeners.ts   # Tab lifecycle events
│   │       ├── url-utils.ts       # URL normalization and pattern matching
│   │       ├── utils.ts           # FNV-1a hashing, debounce
│   │       └── welcome-page.ts
│   │
│   ├── types/                     # Shared TypeScript types
│   │   ├── header.ts              # HeaderEntry, ResolvedEntry, HeaderRule, SavedDataMap
│   │   ├── websocket.ts           # Source, RulesData, HeaderRuleFromApp
│   │   ├── recording.ts           # Recording, RecordingEvent, IRecordingService
│   │   ├── browser.ts             # getBrowserAPI(), ExtensionMessage, BadgeState
│   │   └── index.ts               # Re-exports
│   │
│   ├── context/                   # React Context providers
│   │   ├── HeaderContext.tsx       # Header entries, sources, connection state
│   │   ├── ThemeContext.tsx        # Theme mode (light/dark/auto)
│   │   └── index.ts
│   │
│   ├── hooks/
│   │   └── useHeader.ts           # HeaderContext consumer hook
│   │
│   ├── utils/
│   │   ├── browser-api.ts         # Cross-browser API wrapper (Chrome/Firefox/Safari)
│   │   ├── messaging.ts           # sendMessage/sendMessageWithCallback
│   │   ├── header-validator.ts    # RFC 7230 header name/value validation
│   │   ├── storage-chunking.ts    # chrome.storage.sync chunking (8KB limit)
│   │   ├── logger.ts              # Configurable log levels (error/warn/info/debug)
│   │   ├── utils.ts               # normalizeHeaderName
│   │   ├── display-detector.ts    # Multi-monitor display detection
│   │   └── app-launcher.ts        # Desktop app launch/focus via WS or protocol
│   │
│   ├── components/
│   │   └── ErrorBoundary.tsx
│   │
│   └── assets/
│       ├── images/                # Extension icons (16, 48, 128px)
│       ├── welcome/               # Welcome/setup page (raw HTML/JS)
│       │   ├── welcome.html
│       │   └── welcome.js
│       ├── recording/
│       │   ├── background/recording-service.ts  # Recording lifecycle service
│       │   ├── shared/
│       │   │   ├── state-machine.ts    # Recording state machine
│       │   │   ├── recording-state.ts  # State container with rrweb compression
│       │   │   ├── message-adapter.ts  # UI ↔ core message translation
│       │   │   └── constants.ts        # Message type constants
│       │   ├── content/workflow-recorder.js  # Content script (IIFE bundle)
│       │   └── inject/
│       │       ├── recorder-rrweb.js   # rrweb + console/network/storage capture
│       │       └── recording-widget.js # Draggable timer widget
│       └── lib/                   # Vendored rrweb libraries
│
├── tests/
│   ├── setup.ts                   # Vitest setup (chrome mock)
│   ├── __mocks__/chrome.ts        # Chrome API mock
│   ├── unit/                      # Unit test files
│   └── e2e/
│       └── extension.spec.ts      # Playwright e2e tests
│
├── config/scripts/                # Release and build scripts (TypeScript, run via npx tsx)
│   ├── release.ts                 # Build + zip all browsers (supports --skip-build)
│   ├── build-report.ts            # Post-build size breakdown per browser
│   └── source-zip.ts              # Firefox source code zip for AMO submission
│
├── manifests/                     # Browser-specific manifests (MV3)
│   ├── chrome/manifest.json
│   ├── firefox/manifest.json
│   ├── edge/manifest.json
│   └── safari/
│       ├── manifest.json
│       └── SafariAPIs.js          # Safari compatibility shim
│
├── docs/
│   ├── DEVELOPER.md               # This file
│   ├── PRIVACY.md                 # Privacy policy
│   └── chrome-store-compliance.md # Chrome Web Store compliance guide
│
├── vite.config.ts                 # Vite build config (multi-browser)
├── tsconfig.json                  # TypeScript config (strict)
├── tsconfig.test.json             # TypeScript config for tests
├── vitest.config.ts               # Vitest config
├── playwright.config.ts           # Playwright config
├── popup.html                     # Vite HTML entry point
└── package.json
```

## Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React Popup   │────>│  HeaderContext   │────>│ Browser Storage  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                         │
         │                       v                         v
         │              ┌─────────────────┐     ┌─────────────────┐
         └─────────────>│ Background SW   │────>│ Network Rules    │
                        └─────────────────┘     │ (declarativeNet  │
                                 │              │  Request)        │
                                 v              └─────────────────┘
                        ┌─────────────────┐
                        │ WebSocket Client│
                        │ ws://127.0.0.1  │
                        │    :59210       │
                        └─────────────────┘
                                 │
                                 v
                        ┌─────────────────┐
                        │ Desktop App     │
                        │ (open-headers-  │
                        │  app)           │
                        └─────────────────┘
```

## Development Setup

### Prerequisites

- Node.js 22+
- npm 10+
- Git

### Getting Started

```bash
git clone https://github.com/OpenHeaders/open-headers-browser-extension.git
cd open-headers-browser-extension
npm install
```

### Development

```bash
npm run dev              # Watch mode (Chrome, no minification, fast rebuilds)
npm run dev:chrome       # Chrome
npm run dev:firefox      # Firefox
npm run dev:edge         # Edge
npm run dev:safari       # Safari
```

Dev mode skips Terser minification for fast rebuilds (~500ms vs ~4s).

Load the extension from `dist/<browser>/` in your browser's developer mode.

### Build

```bash
npm run build            # All browsers (production, Terser minified)
npm run build:chrome     # Chrome only
npm run build:firefox    # Firefox only (with inline sourcemaps)
npm run build:edge       # Edge only
npm run build:safari     # Safari only
npm run release          # Build all + create .zip packages in releases/
npm run release -- --skip-build  # Zip existing builds (skip rebuild)
npm run source-zip       # Source code zip for Firefox AMO submission
```

Production builds use Terser with `keep_classnames` and `keep_fnames` to comply with Chrome Web Store readability requirements. See `docs/chrome-store-compliance.md` for details.

### Testing

```bash
# Type checking
npm run typecheck

# Unit tests
npm test                 # Run once
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage

# E2E tests (requires Chrome build)
npm run build:chrome     # Build first
npm run test:e2e         # Run e2e
npm run test:e2e:headed  # Run headed
```

### Test Architecture

Tests follow enterprise-grade standards:

- **Factory functions** at the top of each file (`makeSource()`, `makeHeaderEntry()`) with `Partial<T>` overrides
- **Realistic test data**: UUIDs, JWT tokens, enterprise URLs, ISO timestamps
- **Full shape assertions**: `toEqual` for complete objects, not shallow checks
- **Types from source**: import from `src/types/`, never re-declare in tests
- **Chrome mock**: `tests/__mocks__/chrome.ts` provides full `chrome.*` API stubs

## Type System

Shared types in `src/types/` are the single source of truth, aligned with the desktop app's types:

| File | Key Types |
|------|-----------|
| `header.ts` | `HeaderEntry`, `ResolvedEntry`, `PlaceholderInfo`, `HeaderRule`, `SavedDataMap` |
| `websocket.ts` | `Source`, `HeaderRuleFromApp`, `RulesData`, WS message types |
| `recording.ts` | `Recording`, `RecordingEvent`, `IRecordingService`, `RecordingMetadata` |
| `browser.ts` | `getBrowserAPI()`, `ExtensionMessage`, `BadgeState`, `MessageHandlerContext` |

The extension is the **source of truth for recording types** (recordings originate here and are sent to the desktop app).

## Cross-Browser Compatibility

### browser-api.ts

The `src/utils/browser-api.ts` module wraps Chrome/Firefox/Safari API differences:

- Chrome uses callback-based APIs
- Firefox uses promise-based APIs (`browser.*`)
- Safari has limited API support with polyfills in `SafariAPIs.js`

`getBrowserAPI()` from `src/types/browser.ts` returns the correct API object.

### Browser-Specific Behavior

| Feature | Chrome/Edge | Firefox | Safari |
|---------|------------|---------|--------|
| WebSocket | `ws://` port 59210 | `ws://` port 59210 | `ws://` port 59210 |
| Background | Service worker | Background scripts | Background scripts |
| Manifest | MV3 | MV3 (gecko settings) | MV3 (limited perms) |
| Storage sync | Native | Native | Local fallback |
| Sourcemaps | Disabled | Inline (for AMO review) | Disabled |
| Extra perms | `system.display`, `windows` | `webRequestBlocking` | — |

### Messaging

`src/utils/messaging.ts` provides two shared helpers:

- `sendMessage(msg)` — Promise-based, used in popup components
- `sendMessageWithCallback(msg, cb)` — Callback-based, used in background scripts

## Storage Architecture

```typescript
// chrome.storage.sync (cross-device, 8KB/item limit — chunked automatically)
{
  savedData: SavedDataMap,        // or savedData_chunked + savedData_chunk_0..N
  isRulesExecutionPaused: boolean,
  useRecordingWidget: boolean,
  logLevel: 'error' | 'warn' | 'info' | 'debug'
}

// chrome.storage.local (device-specific)
{
  dynamicSources: Source[],
  popupState: { uiState: UiState },
  themeMode: 'light' | 'dark' | 'auto',
  compactMode: boolean,
  connectionAlertDismissed: boolean,
  activeRulesTab: string,
  hotkeyCommand: HotkeyCommand,
  recordingHotkey: string,
  recordingHotkeyEnabled: boolean,
  rulesData: RulesData,
  hasSeenWelcome: boolean,
  setupCompleted: boolean
}
```

## Build Configuration

### Vite Config (`vite.config.ts`)

Key build decisions:

| Setting | Value | Why |
|---------|-------|-----|
| `minify` | `'terser'` (prod) / `false` (dev) | Chrome Web Store compliance with fast dev rebuilds |
| `terserOptions.mangle.keep_classnames` | `true` | Preserve readable names for store review |
| `terserOptions.mangle.keep_fnames` | `true` | Preserve readable names for store review |
| `target` | `'es2022'` | All MV3 browsers support ES2022 |
| `modulePreload` | `false` | Polyfill references `document`, crashes service worker |
| `sourcemap` | `'inline'` (Firefox) / `false` (others) | Firefox AMO requires source for review |
| `chunkSizeWarningLimit` | `1200` | Vendor chunk (React + Ant Design) is ~1.1MB |

### Custom Plugins

- **`chromeSafePlugin`** — Replaces `new Function('return this')()` with `globalThis` (CSP compliance)
- **`copyAssetsPlugin`** — Copies manifests, icons, welcome page, vendored libs to dist
- **`buildContentScriptPlugin`** — Builds content script as separate IIFE (required for `chrome.scripting.executeScript`)

## CI/CD

### CI Pipeline (`.github/workflows/ci.yml`)

Runs on push/PR to main:
1. TypeScript typecheck (`tsc --noEmit`)
2. Unit tests (`vitest run`)
3. Build Chrome extension (`vite build`)
4. E2E tests (`playwright test` via `xvfb-run`)

Playwright browsers are cached between runs.

### Release Pipeline (`.github/workflows/release.yml`)

Triggered by `v*` tags:
1. Builds all 4 browser packages
2. Creates GitHub release with `.zip` downloads

## Key Implementation Details

### Rule Engine (`rule-engine.ts`)

All rule updates go through `scheduleUpdate(reason, options)`. The engine debounces rapid calls (150ms) and deduplicates by source hash to ensure exactly one `updateNetworkRules()` call per logical change.

Reasons: `sources`, `rules`, `savedData`, `pause`, `import`, `init`, `rulesUpdated`, `periodic`.

### Dynamic Source System

Sources are provided by the desktop app over WebSocket:

```typescript
// Connected with source available
finalValue = prefix + sourceContent + suffix

// Source states when not injecting:
// - app_disconnected: WebSocket not connected, no cached value
// - source_not_found: Source was deleted from the app
// - empty_source: Source exists but has no content
// - empty_value: Static header with no value set
```

### Badge State Priority

`badge-manager.ts` determines the extension icon badge:

```
disconnected (yellow !, after 3 retries) > paused (gray −) > active (count) > none
```

Recording state overrides all badge states while active (red dot).

### Recording State Machine

`state-machine.ts` manages per-tab recording states:

```
idle → starting → recording → stopping → idle
                ↘ pre_navigation ↗
any active state → error → idle (via RESET)
```

The `RecordingService` owns all state transitions and tab notifications. Stop operations are protected by a per-tab lock to make concurrent stop calls idempotent.

### URL Pattern Matching

`url-utils.ts` pre-compiles domain patterns into RegExp objects and caches them. Patterns are recompiled when rules change. Supports wildcards (`*.example.com`), IP addresses, localhost with ports, and IDN domains.

### Logger

`src/utils/logger.ts` provides structured logging with configurable levels:

```
2026-03-23T13:35:17.674Z INFO  [Module] message
```

Log level is persisted in `chrome.storage.sync` and can be changed from the popup menu.

## Security

- **CSP**: Strict Content Security Policy in manifests, no inline scripts
- **Local-only**: WebSocket connects only to `127.0.0.1:59210`
- **Validation**: All header names/values validated against RFC 7230 and browser restrictions
- **No external transmission**: Extension never sends data to external servers
- **Chrome Web Store compliant**: Terser minification with preserved names, no `eval()`, no `Function()` constructor
- **chromeSafePlugin**: Strips any `new Function()` patterns from bundled vendor code

## Code Style

- **TypeScript strict mode** — no `any`, proper types from `src/types/`
- **Functional React components** with hooks
- **File naming**: PascalCase for components (`.tsx`), camelCase for utilities (`.ts`)
- **Imports**: Use path aliases (`@utils/`, `@context/`, etc.) or relative paths
- **No duplicate interfaces** — single source of truth in `src/types/`

## License

See [LICENSE.md](../LICENSE.md).
