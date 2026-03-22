# Open Headers - Developer Documentation

Technical documentation for developers who want to understand, build, test, or contribute to the Open Headers browser extension.

## Architecture Overview

Open Headers is a browser extension built with **TypeScript**, **React 18**, and **Ant Design 5**. It uses a background service worker to manage HTTP header rules via the browser's `declarativeNetRequest` API and communicates with the [OpenHeaders desktop app](https://github.com/OpenHeaders/open-headers-app) over WebSocket.

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict mode) |
| Frontend | React 18, Ant Design 5, styled-components |
| Build | Vite 8 |
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
│   │   ├── components/            # UI components
│   │   │   ├── Header.tsx         # App header with theme toggle
│   │   │   ├── HeaderTable.tsx    # Rules table with sort/filter/search
│   │   │   ├── HeaderEntry.tsx    # Single rule card
│   │   │   ├── DomainTags.tsx     # Multi-domain tag input
│   │   │   ├── TagManager.tsx     # Tag grouping and management
│   │   │   ├── ActiveRules.tsx    # Active rules for current tab
│   │   │   ├── RulesList.tsx      # Rules list wrapper
│   │   │   ├── ConnectionInfo.tsx # Connection status alerts
│   │   │   ├── Footer.tsx         # Recording controls, options, version
│   │   │   ├── RecordingButton.tsx
│   │   │   └── RecordingPreNav.tsx
│   │   ├── utils/
│   │   │   ├── recording.ts       # Recording utilities
│   │   │   └── recording-pre-nav.ts
│   │   └── styles/
│   │       └── popup.less         # Main stylesheet
│   │
│   ├── background/                # Background service worker
│   │   ├── index.ts               # Entry point
│   │   ├── background.ts          # Main orchestrator
│   │   ├── header-manager.ts      # declarativeNetRequest rule management
│   │   ├── websocket.ts           # WebSocket client (ws://127.0.0.1:59210)
│   │   ├── rule-validator.ts      # Header validation
│   │   ├── safari-websocket-adapter.ts
│   │   └── modules/
│   │       ├── badge-manager.ts   # Extension badge state
│   │       ├── message-handler.ts # Popup/content script messages
│   │       ├── recording-handler.ts
│   │       ├── request-monitor.ts # webRequest event tracking
│   │       ├── request-tracker.ts # Active rule tracking per tab
│   │       ├── tab-listeners.ts   # Tab lifecycle events
│   │       ├── url-utils.ts       # URL normalization and matching
│   │       ├── utils.ts           # Debounce, hash generation
│   │       └── welcome-page.ts
│   │
│   ├── types/                     # Shared TypeScript types
│   │   ├── header.ts              # HeaderEntry, ProcessedEntry, HeaderRule, SavedDataMap
│   │   ├── websocket.ts           # Source, RulesData, HeaderRuleFromApp, WS messages
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
│   │   ├── useHeader.ts           # HeaderContext consumer hook
│   │   └── useEnvironmentService.ts # Environment variable resolution
│   │
│   ├── services/
│   │   └── EnvironmentService.ts  # Workspace/environment management
│   │
│   ├── utils/
│   │   ├── browser-api.ts         # Cross-browser API wrapper (Chrome/Firefox/Safari)
│   │   ├── messaging.ts           # sendMessage/sendMessageWithCallback (shared)
│   │   ├── header-validator.ts    # Header name/value/domain validation
│   │   ├── storage-chunking.ts    # chrome.storage.sync chunking (8KB limit)
│   │   ├── utils.ts               # normalizeHeaderName, debounce, formatUrlPattern
│   │   ├── display-detector.ts    # Multi-monitor display detection
│   │   └── app-launcher.ts        # Desktop app launch/focus
│   │
│   ├── components/
│   │   └── ErrorBoundary.tsx
│   │
│   └── assets/
│       ├── images/                # Extension icons
│       ├── welcome/               # Welcome page (raw HTML/JS, not bundled)
│       ├── recording/
│       │   ├── background/recording-service.ts  # Recording service
│       │   ├── shared/            # State machine, constants, message adapter
│       │   ├── content/           # Content script (raw JS, injected into pages)
│       │   ├── inject/            # Recording widget (raw JS)
│       │   └── viewer/            # Record viewer page
│       └── lib/                   # Vendored rrweb libraries
│
├── tests/
│   ├── setup.ts                   # Vitest setup (chrome mock)
│   ├── __mocks__/chrome.ts        # Chrome API mock
│   ├── unit/                      # 28 test files, 795+ tests
│   └── e2e/
│       └── extension.spec.ts      # Playwright e2e (23 tests)
│
├── config/scripts/                # Release and build utility scripts
│   ├── release.js                 # Release packaging
│   ├── build-utils.js             # Post-build reporting
│   └── source-code-zip.js         # Firefox source zip
│
├── manifests/                     # Browser-specific manifests (MV3)
│   ├── chrome/manifest.json
│   ├── firefox/manifest.json
│   ├── edge/manifest.json
│   └── safari/
│       ├── manifest.json
│       └── SafariAPIs.js          # Safari compatibility layer
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
npm run dev              # Watch mode (Chrome)
npm run dev:chrome       # Chrome
npm run dev:firefox      # Firefox
npm run dev:edge         # Edge
npm run dev:safari       # Safari
```

Load the extension from `dist/<browser>/` in your browser's developer mode.

### Build

```bash
npm run build            # All browsers
npm run build:chrome     # Chrome only
npm run build:firefox    # Firefox only
npm run build:edge       # Edge only
npm run build:safari     # Safari only
npm run release          # Build + create .zip packages
```

### Testing

```bash
# Type checking
npm run typecheck

# Unit tests (795+ tests)
npm test                 # Run once
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage

# E2E tests (23 tests, requires Chrome build)
npm run build:chrome     # Build first
npm run test:e2e         # Run e2e
npm run test:e2e:headed  # Run headed

# Slow-motion e2e (for debugging)
SLOW_MO=500 npm run test:e2e
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
| `header.ts` | `HeaderEntry`, `ProcessedEntry`, `PlaceholderInfo`, `HeaderRule`, `SavedDataMap` |
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
| WebSocket | `ws://` port 59210 | `wss://` port 59211 (cert required) | `ws://` port 59210 |
| Background | Service worker | Background scripts | Background scripts |
| Manifest | MV3 | MV3 (gecko settings) | MV3 (limited perms) |
| Storage sync | Native | Native | Local fallback |

### Messaging

`src/utils/messaging.ts` provides two shared helpers (eliminating 6 prior duplicates):

- `sendMessage(msg)` — Promise-based, used in popup components
- `sendMessageWithCallback(msg, cb)` — Callback-based, used in background scripts

## Storage Architecture

```typescript
// chrome.storage.sync (cross-device, 8KB/item limit — chunked automatically)
{
  savedData: SavedDataMap,        // or savedData_chunked + savedData_chunk_0..N
  isRulesExecutionPaused: boolean,
  useRecordingWidget: boolean
}

// chrome.storage.local (device-specific)
{
  dynamicSources: Source[],
  popupState: { uiState: UiState },
  themeMode: 'light' | 'dark' | 'auto',
  connectionAlertDismissed: boolean,
  lastSuccessfulConnection: LastSuccessfulConnection
}
```

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

### Dynamic Source System

Sources are provided by the desktop app over WebSocket:

```typescript
// Connected with source available
finalValue = prefix + sourceContent + suffix

// Disconnected
finalValue = "[APP_DISCONNECTED]"

// Source not found
finalValue = "[SOURCE_NOT_FOUND:<sourceId>]"

// Source empty
finalValue = "[EMPTY_SOURCE:<sourceId>]"
```

### Badge State Priority

`badge-manager.ts` determines the extension icon badge:

```
placeholders (red !) > disconnected (yellow !, after 3 retries) > paused (gray −) > active (count) > none
```

### Recording State Machine

`state-machine.ts` manages per-tab recording states:

```
idle → starting → recording → stopping → idle
                ↘ pre_navigation ↗
idle → error (recoverable)
```

## Security

- **CSP**: Strict Content Security Policy in manifests, no inline scripts
- **Local-only**: WebSocket connects only to `127.0.0.1`
- **Validation**: All header names/values/domains validated against RFC 7230 and browser restrictions
- **No external transmission**: Extension never sends data to external servers
- **Chrome Web Store compliant**: No minification, no `eval()`, no `Function()` constructor

## Code Style

- **TypeScript strict mode** — no `any`, proper types from `src/types/`
- **Functional React components** with hooks
- **File naming**: PascalCase for components (`.tsx`), camelCase for utilities (`.ts`)
- **Imports**: Use path aliases (`@utils/`, `@context/`, etc.) or relative paths
- **No duplicate interfaces** — single source of truth in `src/types/`

## License

MIT License
