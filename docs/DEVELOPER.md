# Open Headers - Developer Documentation

This document contains technical information for developers who want to understand, build, or contribute to the Open Headers browser extension.

## 🏗️ Architecture Overview

Open Headers is a modern browser extension built with **React 18** and **Ant Design 5**, featuring a professional, Apple-inspired design. The extension uses a hybrid architecture combining React for the frontend UI with vanilla JavaScript for the background service worker to ensure maximum browser compatibility.

### Technology Stack

- **Frontend Framework**: React 18 with functional components and hooks
- **UI Library**: Ant Design 5 with custom theming
- **Build System**: Webpack 5 with Babel for ES6+ and JSX compilation
- **State Management**: React Context API for global application state
- **Styling**: LESS with CSS custom properties for theming
- **Background Service**: Vanilla JavaScript for cross-browser compatibility
- **Module Bundling**: Browser-specific webpack configurations
- **Package Management**: npm
- **Version Control**: Git

### Core Components

1. **React Popup UI** (`src/popup/`)
   - Modern React-based interface with Ant Design components
   - Component-based architecture with reusable UI elements
   - Real-time state updates and validation

2. **Background Service Worker** (`src/background/`)
   - Manages header rules using browser's declarativeNetRequest API
   - WebSocket client for companion app communication
   - Request tracking and badge updates

3. **React Context System** (`src/context/`)
   - `HeaderContext`: Global state for header entries and dynamic sources
   - `ThemeContext`: Dark/light mode management

4. **Welcome Experience** (`src/assets/welcome/`)
   - Interactive multi-step onboarding
   - Browser-specific setup instructions
   - Connection verification flow

5. **Import/Export System** (`src/assets/import/`, `src/assets/export/`)
   - Dedicated pages for configuration management
   - Browser-specific implementations (Firefox uses separate pages)

## 📁 Project Structure

```
open-headers-browser-extension/
├── src/                          # Source code
│   ├── popup/                    # React popup application
│   │   ├── App.jsx              # Main app component with providers
│   │   ├── index.jsx            # React entry point
│   │   ├── popup.html           # HTML template
│   │   ├── components/          # React components
│   │   │   ├── Header.jsx       # App header with theme toggle
│   │   │   ├── HeaderForm.jsx   # Form for adding/editing headers
│   │   │   ├── HeaderTable.jsx  # Professional table view
│   │   │   ├── HeaderList.jsx   # Wrapper for table
│   │   │   ├── DomainTags.jsx   # Multi-domain input component
│   │   │   ├── ConnectionInfo.jsx # Connection status alerts
│   │   │   └── Footer.jsx       # Import/export and links
│   │   └── styles/
│   │       └── popup.less       # Main stylesheet with Ant Design theming
│   │
│   ├── background/              # Background service worker
│   │   ├── index.js            # Entry point
│   │   ├── background.js       # Main background logic
│   │   ├── header-manager.js   # DeclarativeNetRequest rule management
│   │   ├── websocket.js        # WebSocket client
│   │   ├── rule-validator.js   # Header validation
│   │   └── safari-websocket-adapter.js # Safari-specific handling
│   │
│   ├── context/                 # React Context providers
│   │   ├── HeaderContext.jsx    # Global header state management
│   │   ├── ThemeContext.jsx     # Theme management
│   │   └── index.js            # Context exports
│   │
│   ├── hooks/                   # Custom React hooks
│   │   └── useHeader.js        # Header context hook
│   │
│   ├── components/              # Shared components
│   │   └── ErrorBoundary.jsx   # Error handling wrapper
│   │
│   ├── utils/                   # Shared utilities
│   │   ├── browser-api.js      # Cross-browser API wrapper
│   │   ├── header-validator.js  # Validation functions
│   │   └── utils.js            # Common utilities
│   │
│   └── assets/                  # Static assets
│       ├── images/             # Extension icons
│       ├── welcome/            # Welcome page
│       ├── import/             # Import page
│       └── export/             # Export success page
│
├── config/                      # Build configuration
│   ├── webpack/                # Webpack configs
│   │   ├── webpack.common.js   # Shared config
│   │   ├── webpack.chrome.js   # Chrome-specific
│   │   ├── webpack.firefox.js  # Firefox-specific
│   │   ├── webpack.edge.js     # Edge-specific
│   │   └── webpack.safari.js   # Safari-specific
│   └── scripts/                # Build scripts
│       ├── build-utils.js      # Build helpers
│       └── release.js          # Release packaging
│
├── manifests/                   # Browser manifests
│   ├── chrome/manifest.json
│   ├── firefox/manifest.json
│   ├── edge/manifest.json
│   └── safari/
│       ├── manifest.json
│       └── SafariAPIs.js       # Safari compatibility layer
│
├── docs/                        # Documentation
├── package.json                 # Dependencies and scripts
└── .babelrc                     # Babel configuration
```

## 🔄 Data Flow Architecture

### State Management Flow

1. **User Interaction** → React Components
2. **State Updates** → React Context (HeaderContext)
3. **Persistence** → Browser Storage API
4. **Background Sync** → Service Worker
5. **Rule Application** → DeclarativeNetRequest API
6. **Dynamic Updates** → WebSocket → Companion App

### Component Communication

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React Popup   │────▶│  Header Context │────▶│ Browser Storage │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                         │
         │                       ▼                         ▼
         │              ┌─────────────────┐     ┌─────────────────┐
         └─────────────▶│ Background SW   │────▶│ Network Rules   │
                        └─────────────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ WebSocket Client│
                        └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Companion App   │
                        └─────────────────┘
```

## 🛠️ Development Setup

### Prerequisites

- Node.js 16.0 or higher
- npm 8.0 or higher
- Git
- A code editor (VS Code recommended)
- Browser(s) for testing

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/OpenHeaders/open-headers-browser-extension.git
   cd open-headers-browser-extension
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development build**
   ```bash
   # Watch mode for all browsers
   npm run dev

   # Or for specific browser
   npm run dev:chrome    # Chrome development
   npm run dev:firefox   # Firefox development
   npm run dev:edge      # Edge development
   npm run dev:safari    # Safari development
   ```

4. **Load the extension**
   - Chrome/Edge: Navigate to extensions page, enable Developer Mode, click "Load unpacked", select `dist/chrome` or `dist/edge`
   - Firefox: Navigate to `about:debugging`, click "Load Temporary Add-on", select `manifest.json` in `dist/firefox`
   - Safari: Run `npm run safari:convert` after building, then open in Xcode

### Build Commands

```bash
# Production builds
npm run build          # Build all browsers
npm run build:chrome   # Chrome only
npm run build:firefox  # Firefox only
npm run build:edge     # Edge only
npm run build:safari   # Safari only

# Create release packages
npm run release        # Creates .zip files in releases/
```

## 🏛️ Architecture Details

### React Components

#### Core Components

1. **App.jsx**
   - Main application wrapper
   - Provides context providers and error boundary
   - Handles popup lifecycle events

2. **HeaderForm.jsx**
   - Complex form with real-time validation
   - Dynamic source selection
   - Domain pattern management
   - Prefix/suffix formatting

3. **HeaderTable.jsx**
   - Advanced table with sorting and filtering
   - Real-time status indicators
   - Inline enable/disable toggles
   - Search functionality

4. **DomainTags.jsx**
   - Tag-based domain input
   - Comma/Enter separated input
   - Validation on input
   - Edit capabilities

#### State Management

**HeaderContext** manages:
- Header entries (CRUD operations)
- Dynamic sources from companion app
- Connection status
- Edit mode state
- Form draft values
- UI state persistence

**ThemeContext** manages:
- Theme mode (light/dark/auto)
- System preference detection
- Ant Design theme configuration

### Background Service Architecture

#### Key Modules

1. **background.js**
   - Main coordination point
   - Message handling from popup
   - Request monitoring
   - Badge updates

2. **header-manager.js**
   - Creates declarativeNetRequest rules
   - Handles dynamic value substitution
   - Manages placeholder values

3. **websocket.js**
   - WebSocket client implementation
   - Browser-specific connection handling
   - Automatic reconnection
   - Source synchronization

4. **rule-validator.js**
   - Header name/value validation
   - Browser API compliance
   - Sanitization functions

### Browser-Specific Implementations

#### Chrome/Edge
- Standard WebSocket on port 59210
- Direct file input for import
- Service worker with full API support

#### Firefox
- Secure WebSocket (wss://) on port 59211
- Certificate acceptance flow
- Separate import/export pages
- Enhanced CSP handling

#### Safari
- Custom API adapters in SafariAPIs.js
- Xcode project generation
- WebKit-specific optimizations

## 🔧 Key Implementation Details

### Dynamic Source System

1. **Source Types**
   - HTTP requests
   - Environment variables
   - Local files

2. **Value Resolution**
   ```javascript
   // When connected and source available
   finalValue = prefix + sourceContent + suffix

   // When disconnected
   finalValue = "[APP_DISCONNECTED]"

   // When source not found
   finalValue = "[SOURCE_NOT_FOUND:id]"

   // When source empty
   finalValue = "[EMPTY_SOURCE:id]"
   ```

3. **Real-time Updates**
   - WebSocket receives source changes
   - Background script updates rules
   - Badge reflects current state

### Validation System

The extension implements comprehensive validation:

1. **Header Names**
   - Checks against browser-forbidden headers
   - RFC 7230 compliance
   - Context-aware (request vs response)

2. **Header Values**
   - Character validation
   - Length limits (8192 chars)
   - Control character detection

3. **Domain Patterns**
   - URL pattern validation
   - Wildcard support
   - Conflict detection
   - IPv4/IPv6 support

### Storage Architecture

```javascript
// Sync storage (cross-device)
{
  savedData: {
    "entryId": {
      headerName: string,
      headerValue: string,
      domains: string[],
      isDynamic: boolean,
      sourceId: string,
      prefix: string,
      suffix: string,
      isResponse: boolean,
      isEnabled: boolean
    }
  }
}

// Local storage (device-specific)
{
  dynamicSources: [...],
  popupState: {...},
  themeMode: "light" | "dark" | "auto",
  connectionAlertDismissed: boolean
}
```

## 🧪 Testing & Debugging

### React DevTools

1. Install React Developer Tools extension
2. Open Open Headers popup
3. Inspect component tree and state
4. Monitor re-renders and performance

### Debug Mode

Enable verbose logging:
```javascript
// In background.js
console.log('Info: Detailed logging enabled');
```

### Common Debugging Areas

1. **WebSocket Connection**
   - Check port availability (59210/59211)
   - Verify companion app is running
   - Check browser console for errors

2. **Header Application**
   - Use browser DevTools Network tab
   - Check for rule conflicts
   - Verify domain patterns match

3. **State Management**
   - Use React DevTools
   - Check browser storage
   - Monitor Context updates

## 🚀 Performance Considerations

### Optimization Strategies

1. **React Optimization**
   - Use React.memo for expensive components
   - Implement proper key props
   - Avoid unnecessary re-renders

2. **Background Script**
   - Debounced rule updates
   - Efficient request tracking
   - Memory leak prevention

3. **Storage**
   - Minimal storage writes
   - Batch updates when possible
   - Clean up old data

### Bundle Size

- React + Ant Design: ~500KB (minified)
- Background scripts: ~50KB
- Total extension size: ~1MB

## 🔒 Security Considerations

1. **Content Security Policy**
   - Strict CSP in manifest
   - No inline scripts
   - Limited external connections

2. **Input Validation**
   - All user inputs validated
   - XSS prevention
   - Injection attack protection

3. **Communication**
   - Local-only WebSocket
   - No external data transmission
   - Secure storage practices

## 📝 Code Style Guidelines

### React Components
```jsx
// Use functional components with hooks
const MyComponent = ({ prop1, prop2 }) => {
  const [state, setState] = useState(initialValue);
  
  useEffect(() => {
    // Side effects
  }, [dependencies]);
  
  return (
    <div>
      {/* JSX content */}
    </div>
  );
};

// Export with React.memo when appropriate
export default React.memo(MyComponent);
```

### Naming Conventions
- Components: PascalCase (e.g., `HeaderForm`)
- Files: Match component name (e.g., `HeaderForm.jsx`)
- Hooks: camelCase with 'use' prefix (e.g., `useHeader`)
- Constants: UPPER_SNAKE_CASE
- Functions: camelCase

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed contribution guidelines.

## 📚 Additional Resources

- [React Documentation](https://react.dev/)
- [Ant Design Components](https://ant.design/components/overview)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)
- [WebExtensions API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)

## 🐛 Known Issues & Limitations

1. **Safari WebSocket**: Limited support, may require additional permissions
2. **Firefox CSP**: Stricter content security policy requires certificate acceptance
3. **Response Headers**: Limited visibility in DevTools due to browser restrictions
4. **Dynamic Sources**: Require companion app to be running

## 📄 License

This project is licensed under the MIT License.