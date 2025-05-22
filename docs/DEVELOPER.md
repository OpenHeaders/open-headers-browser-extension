# Open Headers - Developer Documentation

This document contains technical information for developers who want to contribute to the Open Headers browser extension.

## Architecture

### Overview

Open Headers is a modern browser extension built with **React 18** and **Ant Design 5**, featuring an Apple-like minimalist design. The extension uses a hybrid architecture combining React for the frontend UI with vanilla JavaScript for the background service worker to ensure maximum browser compatibility.

### Technology Stack

- **Frontend Framework**: React 18 with functional components and hooks
- **UI Library**: Ant Design 5 with custom Apple-like theming
- **Build System**: Webpack 5 with Babel for ES6+ and JSX compilation
- **State Management**: React Context API for global application state
- **Styling**: LESS with CSS custom properties for theming
- **Background Service**: Vanilla JavaScript for cross-browser compatibility
- **Module Bundling**: Browser-specific webpack configurations

### Components

The extension consists of these main components:

- **React Popup UI**: Modern React-based interface with Ant Design components
- **Background Service Worker**: Vanilla JS that manages header rules and WebSocket connections
- **React Context System**: Global state management for header entries and dynamic sources
- **Header Rule System**: Applies headers to matching requests using declarativeNetRequest API
- **Welcome Page**: Interactive vanilla JS multi-step onboarding experience
- **WebSocket Client**: Connects to the companion app for dynamic sources

### Modules

| Module | Technology | Description |
|--------|------------|-------------|
| `src/popup/App.jsx` | React 18 | Main popup application component with routing and context providers |
| `src/popup/components/` | React + Ant Design | Reusable UI components (HeaderForm, HeaderList, etc.) |
| `src/context/HeaderContext.jsx` | React Context | Global state management for headers and dynamic sources |
| `src/hooks/useHeader.js` | React Hooks | Custom hook for header management logic |
| `src/background/background.js` | Vanilla JS | Main background service worker coordinator |
| `src/background/header-manager.js` | Vanilla JS | Creates and updates browser's declarativeNetRequest rules |
| `src/background/websocket.js` | Vanilla JS | Manages WebSocket connection to companion app |
| `src/background/rule-validator.js` | Vanilla JS | Validates and sanitizes header values |
| `src/utils/browser-api.js` | Vanilla JS | Browser detection and compatibility layer |
| `src/assets/welcome/welcome.js` | Vanilla JS | Interactive welcome page functionality |

### Data Flow

1. **User Interaction**: User configures headers through React components
2. **State Management**: React Context manages application state and form data
3. **Persistence**: Configurations saved to browser storage via React effects
4. **Background Processing**: Background service worker creates declarativeNetRequest rules
5. **Dynamic Updates**: WebSocket connection receives source updates from companion app
6. **UI Synchronization**: React components re-render with updated data from context

### React Architecture

#### Component Structure
```
src/popup/
├── App.jsx                    # Main app wrapper with providers
├── index.jsx                  # React app entry point
├── components/
│   ├── HeaderForm.jsx         # Form for adding/editing headers
│   ├── HeaderList.jsx         # List of saved header entries
│   ├── HeaderTable.jsx        # Table view for header management
│   ├── DomainTags.jsx         # Multi-domain input component
│   ├── ConnectionInfo.jsx     # Connection status display
│   ├── Header.jsx             # App header component
│   └── Footer.jsx             # App footer component
└── styles/
    └── popup.less             # Main stylesheet with Ant Design theming
```

#### State Management
- **React Context**: Global state for header entries, dynamic sources, and connection status
- **Local State**: Component-level state for forms, UI interactions, and temporary data
- **Browser Storage**: Persistent storage managed through React effects and custom hooks

#### Styling and Theming
- **Design System**: Apple-like minimalist aesthetic with clean typography
- **Primary Color**: #4285F4 (Google Blue) used throughout the interface
- **Typography**: SF Pro Text font family for iOS/macOS feel
- **Components**: Ant Design 5 components with custom theming via ConfigProvider
- **Responsive Design**: Optimized for browser extension popup dimensions (400px width)

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 16.0 or higher
- [npm](https://www.npmjs.com/) 8.0 or higher
- Basic knowledge of React 18, hooks, and modern JavaScript
- Familiarity with Ant Design 5 components

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/OpenHeaders/open-headers-browser-extension.git
   cd open-headers-browser-extension
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development build:
   ```bash
   npm run dev           # Watch mode for all browsers
   # Or for specific browsers:
   npm run dev:chrome    # Watch mode for Chrome
   npm run dev:firefox   # Watch mode for Firefox
   npm run dev:edge      # Watch mode for Edge
   npm run dev:safari    # Watch mode for Safari
   ```

4. Build production versions:
   ```bash
   npm run build         # Build for all browsers
   # Or for specific browsers:
   npm run build:chrome  # Build for Chrome
   npm run build:firefox # Build for Firefox
   npm run build:edge    # Build for Edge
   npm run build:safari  # Build for Safari
   ```

### Project Structure

```
open-headers/
├── src/                     # Modern React application source
│   ├── popup/               # React popup application
│   │   ├── App.jsx          # Main popup component with providers
│   │   ├── index.jsx        # React app entry point
│   │   ├── popup.html       # HTML template for popup
│   │   ├── components/      # Reusable React components
│   │   │   ├── HeaderForm.jsx    # Form for adding/editing headers
│   │   │   ├── HeaderList.jsx    # List component for headers
│   │   │   ├── HeaderTable.jsx   # Table view for header management
│   │   │   ├── DomainTags.jsx    # Multi-domain input component
│   │   │   ├── ConnectionInfo.jsx # Connection status component
│   │   │   ├── Header.jsx        # App header
│   │   │   └── Footer.jsx        # App footer
│   │   └── styles/          # LESS stylesheets
│   │       └── popup.less   # Main stylesheet with Ant Design theming
│   │
│   ├── background/          # Background service worker (vanilla JS)
│   │   ├── index.js         # Entry point for background script
│   │   ├── background.js    # Main background worker logic
│   │   ├── header-manager.js # Header rule management
│   │   ├── rule-validator.js # Header validation
│   │   ├── websocket.js     # WebSocket client
│   │   └── safari-websocket-adapter.js # Safari-specific handling
│   │
│   ├── context/             # React Context providers
│   │   └── HeaderContext.jsx # Global state management
│   │
│   ├── hooks/               # Custom React hooks
│   │   └── useHeader.js     # Header management hook
│   │
│   ├── utils/               # Shared utility functions
│   │   ├── browser-api.js   # Browser compatibility layer
│   │   ├── utils.js         # Common utilities
│   │   └── header-validator.js # Header validation utilities
│   │
│   └── assets/              # Static assets
│       ├── images/          # Extension icons and images
│       └── welcome/         # Welcome page files (vanilla JS)
│           ├── welcome.html # Welcome page HTML
│           └── welcome.js   # Welcome page JavaScript
│
├── manifests/               # Browser-specific manifest files
│   ├── chrome/manifest.json # Chrome manifest
│   ├── firefox/manifest.json # Firefox manifest
│   ├── edge/manifest.json   # Edge manifest
│   └── safari/manifest.json # Safari manifest
│
├── config/                  # Build configuration
│   ├── webpack/             # Webpack configurations
│   │   ├── webpack.common.js # Common webpack config
│   │   ├── webpack.chrome.js # Chrome-specific config
│   │   ├── webpack.firefox.js # Firefox-specific config
│   │   ├── webpack.edge.js   # Edge-specific config
│   │   └── webpack.safari.js # Safari-specific config
│   └── scripts/             # Build and utility scripts
│
├── docs/                    # Documentation
├── dist/                    # Build output (gitignored)
├── releases/                # Release packages (gitignored)
├── package.json
└── README.md
```

### React Development Workflow

1. **Component Development**:
   - Create new components in `src/popup/components/`
   - Use functional components with hooks
   - Follow Ant Design component patterns
   - Implement proper TypeScript-like prop validation

2. **State Management**:
   - Use React Context for global state
   - Leverage custom hooks for reusable logic
   - Manage side effects with useEffect

3. **Styling**:
   - Use Ant Design components as base
   - Customize with LESS variables and CSS custom properties
   - Follow the Apple-like design system
   - Ensure responsive design for popup constraints

4. **Testing Changes**:
   ```bash
   npm run build:chrome  # Build for testing
   # Load extension in Chrome developer mode
   # Test React components and state management
   ```

### Development Guidelines

#### React Best Practices
- Use functional components with hooks exclusively
- Implement proper error boundaries for robust UX
- Use React.memo for performance optimization where needed
- Follow React 18 concurrent features best practices
- Maintain clean component separation of concerns

#### Ant Design Integration
- Use Ant Design components as the foundation
- Customize theme through ConfigProvider
- Follow Ant Design design principles
- Ensure accessibility through proper ARIA attributes
- Use consistent spacing and typography scales

#### State Management Patterns
- Use React Context for truly global state
- Keep component state local when possible
- Implement proper error handling in state updates
- Use custom hooks to encapsulate complex logic
- Maintain predictable state updates

## Browser Compatibility

Open Headers supports multiple browsers with specific adaptations for each:

### Cross-Browser Implementation

#### React Frontend Compatibility
- **All Browsers**: React components work consistently across all supported browsers
- **Webpack Builds**: Browser-specific optimizations in webpack configurations
- **Ant Design**: Full compatibility across Chrome, Firefox, Edge, and Safari
- **CSS**: LESS compilation with browser-specific vendor prefixes

#### Background Service Worker
- **Chrome/Edge**: Full React dev tools support, optimal performance
- **Firefox**: Enhanced CSP handling, proper source map generation
- **Safari**: WebKit-specific optimizations, memory management

### WebSocket Security Implementation

**Firefox Enhanced Security (v1.2.0+)**:
- Secure WebSocket (`wss://`) on port 59211 with certificate handling
- Fallback to standard WebSocket (`ws://`) on port 59210
- Interactive certificate acceptance through welcome page
- Connection state persistence across sessions

**Chrome/Edge Standard Implementation**:
- Standard WebSocket on port 59210
- Simplified connection flow
- Optimal performance for React state updates

**Safari WebKit Adaptations**:
- Custom WebSocket adapter for Safari's security model
- Special handling for WebKit memory management
- React performance optimizations for Safari

### Testing Cross-Browser

When testing React components and functionality:

1. **React DevTools**: Use React Developer Tools in each browser
2. **Component Rendering**: Verify React components render consistently
3. **State Management**: Test React Context state updates
4. **Ant Design Components**: Verify UI component behavior
5. **WebSocket Integration**: Test real-time state updates from background
6. **Form Validation**: Test React form validation across browsers

## Testing

### React Component Testing

1. **Component Rendering**:
   ```bash
   # Load extension in browser
   # Open popup and verify React components render
   # Test form interactions and state updates
   # Verify Ant Design components work properly
   ```

2. **State Management Testing**:
   - Test React Context state updates
   - Verify proper re-rendering on state changes
   - Test error boundaries and error handling
   - Validate form state management

3. **Integration Testing**:
   - Test background script integration with React state
   - Verify WebSocket data updates React components
   - Test browser storage integration with React state
   - Validate cross-tab state synchronization

### Manual Testing with React DevTools

1. Install React Developer Tools extension
2. Open Open Headers popup
3. Navigate to React DevTools
4. Inspect component tree and state
5. Test state updates and prop changes
6. Verify context provider data flow

### Welcome Page Testing

The welcome page remains vanilla JavaScript for maximum compatibility:
1. Reset storage to simulate first install
2. Verify welcome page appearance and flow
3. Test browser-specific step visibility
4. Validate connection detection and state updates

## Building for Distribution

### Production Build Process

```bash
npm run build
```

**React Build Optimizations**:
- React production build with optimizations
- Ant Design tree-shaking for smaller bundle size
- CSS extraction and minification
- Browser-specific optimizations

**Build Outputs**:
- React popup bundle: Optimized for each browser
- Background service worker: Cross-browser vanilla JS
- Ant Design styles: Extracted and minified CSS
- Static assets: Images and welcome page files

### Code Splitting and Optimization

- **React Components**: Bundled efficiently with Webpack
- **Ant Design**: Tree-shaken to include only used components
- **LESS Compilation**: Optimized CSS output with vendor prefixes
- **Browser Targets**: Specific builds for Chrome, Firefox, Edge, Safari

## Implementation Details

### React Context Architecture

```javascript
// HeaderContext.jsx - Global state management
const HeaderContext = createContext();

export const HeaderProvider = ({ children }) => {
  const [headers, setHeaders] = useState([]);
  const [dynamicSources, setDynamicSources] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  
  // Context value with state and methods
  const contextValue = {
    headers,
    dynamicSources,
    connectionStatus,
    addHeader,
    updateHeader,
    deleteHeader,
    refreshSources
  };
  
  return (
    <HeaderContext.Provider value={contextValue}>
      {children}
    </HeaderContext.Provider>
  );
};
```

### Ant Design Theming

```javascript
// App.jsx - Custom theme configuration
const customTheme = {
  token: {
    colorPrimary: '#4285F4',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto',
    borderRadius: 8,
    colorBgContainer: '#ffffff'
  },
  components: {
    Button: {
      borderRadius: 8,
      fontWeight: 500
    },
    Input: {
      borderRadius: 6
    }
  }
};

<ConfigProvider theme={customTheme}>
  <App />
</ConfigProvider>
```

### Form Management with Ant Design

```javascript
// HeaderForm.jsx - Form component with validation
const HeaderForm = () => {
  const [form] = Form.useForm();
  const { addHeader } = useContext(HeaderContext);
  
  const onFinish = (values) => {
    addHeader(values);
    form.resetFields();
  };
  
  return (
    <Form form={form} onFinish={onFinish} layout="vertical">
      <Form.Item
        name="headerName"
        label="Header Name"
        rules={[{ required: true, message: 'Please enter header name' }]}
      >
        <Input placeholder="e.g., Authorization" />
      </Form.Item>
      {/* Additional form fields */}
    </Form>
  );
};
```

## Contributing

### React Development Contributions

When contributing React components:

1. **Follow React 18 Patterns**: Use modern hooks and concurrent features
2. **Ant Design Standards**: Follow Ant Design component guidelines
3. **Apple Design Language**: Maintain minimalist, clean aesthetic
4. **Performance**: Use React.memo and useMemo where appropriate
5. **Accessibility**: Ensure proper ARIA attributes and keyboard navigation

### Code Style Guidelines

- **Components**: Use functional components with descriptive names
- **Hooks**: Extract complex logic into custom hooks
- **Props**: Use destructuring and provide default values
- **State**: Keep state as local as possible, use Context for global state
- **Styling**: Follow LESS conventions and maintain design consistency

For detailed contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).