# Open Headers - Developer Documentation

This document contains technical information for developers who want to contribute to the Open Headers browser extension.

## Architecture

### Components

The extension consists of these main components:

- **Popup UI**: The interface that appears when clicking the extension icon
- **Background Service Worker**: Runs in the background to manage header rules
- **WebSocket Client**: Connects to the companion app for dynamic sources
- **Header Rule System**: Applies headers to matching requests
- **Welcome Page**: Interactive setup guide for new users

### Modules

| Module | Description |
|--------|-------------|
| `background.js` | Main background service worker that coordinates the extension |
| `header-manager.js` | Creates and updates browser's declarativeNetRequest rules |
| `websocket.js` | Manages WebSocket connection to the companion app |
| `rule-validator.js` | Validates and sanitizes header values |
| `popup.js` | Main popup UI coordinator |
| `entry-manager.js` | Manages saved header entries and rendering |
| `ui-manager.js` | UI utilities for the popup interface |
| `draft-manager.js` | Handles saving and restoring form inputs |
| `domain-tags-manager.js` | Handles multiple domain tag input and management |
| `config-manager.js` | Handles configuration import and export |
| `notification-system.js` | Displays notifications in the popup UI |
| `utils.js` | Shared utility functions |
| `browser-api.js` | Browser detection and compatibility layer |
| `safari-websocket-adapter.js` | Safari-specific WebSocket handling |
| `welcome.js` | Controls the interactive welcome page functionality |

### Data Flow

1. User configures headers in the popup UI
2. Configurations are saved to browser storage
3. Background service worker creates declarativeNetRequest rules
4. When using dynamic sources:
   - WebSocket connection receives source updates
   - Header values are updated in real-time
   - UI refreshes to show current values

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 14.0 or higher
- [npm](https://www.npmjs.com/) 6.0 or higher

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
├── shared/              # Shared code and resources
│   ├── js/
│   │   ├── background/  # Background service worker scripts
│   │   │   ├── index.js # Entry point for background script
│   │   │   ├── background.js # Main background worker logic
│   │   │   ├── header-manager.js # Header rule management
│   │   │   ├── rule-validator.js # Header validation
│   │   │   ├── websocket.js # WebSocket client
│   │   │   └── safari-websocket-adapter.js # Safari-specific WebSocket handling
│   │   ├── popup/       # Popup UI scripts
│   │   │   ├── index.js # Entry point for popup
│   │   │   ├── popup.js # Main popup logic
│   │   │   ├── entry-manager.js # Entry management
│   │   │   ├── ui-manager.js # UI utilities
│   │   │   ├── domain-tags-manager.js # Domain tag input management
│   │   │   ├── config-manager.js # Import/export functionality
│   │   │   ├── draft-manager.js # Draft inputs management
│   │   │   └── notification-system.js # Notification display
│   │   └── shared/      # Shared utilities
│   │       ├── utils.js # Common utility functions
│   │       └── browser-api.js # Browser detection and compatibility layer
│   ├── popup.html       # Popup UI HTML
│   ├── popup.css        # Popup UI styles
│   ├── welcome.html     # Welcome page HTML
│   ├── js/welcome.js    # Welcome page JavaScript
│   └── images/          # Icons and images
│
├── manifests/           # Browser-specific manifest files
│   ├── chrome/
│   │   └── manifest.json # Chrome manifest
│   ├── firefox/
│   │   └── manifest.json # Firefox manifest
│   ├── edge/
│   │   └── manifest.json # Edge manifest
│   └── safari/
│       └── manifest.json # Safari manifest
│
├── config/              # Configuration files
│   ├── webpack/         # Webpack configurations
│   │   ├── webpack.common.js # Common webpack config
│   │   ├── webpack.chrome.js # Chrome-specific webpack config
│   │   ├── webpack.firefox.js # Firefox-specific webpack config
│   │   ├── webpack.edge.js # Edge-specific webpack config
│   │   ├── webpack.safari.js # Safari-specific webpack config
│   │   └── webpack.dev.js # Development webpack config
│   └── scripts/         # Build and utility scripts
│       ├── build-utils.js # Post-build processing without obfuscation
│       └── release.js   # Release script for creating packages
│
├── docs/                # Documentation
│   ├── DEVELOPER.md     # This file
│   ├── CONTRIBUTING.md  # Contribution guidelines
│   ├── PRIVACY.md       # Privacy policy
│   └── chrome-store-compliance.md # Chrome Web Store compliance guide
│
├── dist/                # Build output (gitignored)
│   ├── chrome/
│   ├── firefox/
│   ├── edge/
│   └── safari/
│
├── releases/            # Release packages (gitignored)
│
├── package.json         # npm package configuration
├── README.md
└── .gitignore
```

### Development Workflow

1. Make your changes to the source files
2. Run browser-specific build commands to test in different browsers:
   ```bash
   npm run build:chrome  # For Chrome
   npm run build:firefox # For Firefox
   npm run build:edge    # For Edge
   npm run build:safari  # For Safari
   ```
3. Load the extension in the appropriate browser using "Load unpacked" (Chrome/Edge), "Load Temporary Add-on" (Firefox), or the Safari converter
4. Test your changes
5. For production build, run `npm run build` to build for all browsers
6. Create release packages with `npm run release`

## Browser Compatibility

Open Headers supports multiple browsers with specific adaptations for each:

### Cross-Browser Implementation

The extension uses browser detection and compatibility layers to ensure consistent behavior:

- **Manifest Files**: Different manifests for each browser target
  - Chrome/Edge: Uses manifest v3 with service worker
  - Firefox: Uses manifest v3 with explicit `browser_specific_settings`
  - Safari: Uses manifest v3 with special considerations for WebKit

- **WebSocket Connection**: Different implementations for browser security models
  - Chrome/Edge: Standard WebSocket implementation
  - Firefox: Dual protocol implementation (WSS/WS) with certificate handling
  - Safari: Adaptation for Safari's unique WebKit security model

- **Storage APIs**: Unified API to handle browser differences
  - The `browser-api.js` module provides cross-browser abstraction

### WebSocket Security Implementation (v1.2.0+)

Firefox has stricter security requirements for WebSocket connections. In version 1.2.0, we've implemented:

1. **Dual Protocol Support**:
   - Secure WebSocket (`wss://`) on port 59211 with proper certificate handling
   - Fallback to standard WebSocket (`ws://`) on port 59210 if SSL handshake fails

2. **Certificate Handling Flow**:
   - First-time users are guided through certificate acceptance
   - The extension detects previous successful connections
   - Smart protocol selection based on previous successes

3. **Connection Recovery**:
   - Protocol switching on connection failure
   - Persistent storage of successful connection methods
   - Automatic reconnection with appropriate protocol

Implementation details can be found in `websocket.js`:
```javascript
// Firefox-specific WebSocket connection handling
function connectWebSocketFirefox(onSourcesReceived) {
    // Check for previously accepted certificate
    storage.local.get(['certificateAccepted'], (result) => {
        const certificateAccepted = result.certificateAccepted;
        
        if (certificateAccepted) {
            // Use secure WSS endpoint
            connectFirefoxWss(onSourcesReceived);
        } else {
            // Show welcome page for certificate acceptance
            openFirefoxOnboardingPage();
            // Try secure connection anyway
            connectFirefoxWss(onSourcesReceived);
        }
    });
}
```

### Welcome Page Implementation (v1.2.0+)

The interactive welcome page guides users through the setup process with browser-specific steps:

1. **Components**:
   - `welcome.html`: Browser-adaptive UI with step-by-step guidance
   - `welcome.js`: Browser detection and UI flow management
   - `background.js`: Welcome page invocation logic

2. **Browser-Specific Flows**:
   - **Chrome/Edge**: Simple connection verification
   - **Firefox**: Certificate acceptance guidance and verification
   - **Safari**: Special setup instructions for WebKit environment

3. **Implementation Notes**:
   - Uses CSS to show/hide browser-specific elements
   - Detects the browser automatically
   - Stores setup completion status to prevent repeated displays
   - Provides helpful troubleshooting options

### Build Configuration

Each browser has its own webpack configuration:
- `config/webpack/webpack.chrome.js` - Chrome configuration
- `config/webpack/webpack.firefox.js` - Firefox configuration
- `config/webpack/webpack.edge.js` - Edge configuration
- `config/webpack/webpack.safari.js` - Safari configuration

### Testing Cross-Browser

When testing, verify these browser-specific aspects:
1. **WebSocket Connection**: Ensure proper connection to the companion app 
2. **Header Injection**: Verify headers are applied consistently
3. **CSS/UI**: Check that styling works properly in each browser
4. **Storage**: Confirm settings persist between sessions
5. **Welcome Page**: Test the welcome flow for each browser

### Known Browser Differences

| Feature | Chrome | Firefox | Edge | Safari |
|---------|--------|---------|------|--------|
| WebSocket Security | Standard | Strict (WSS) | Standard | Strictest |
| CSP Requirements | Moderate | High | Moderate | Very High |
| Resource Types | All Supported | Limited Set | All Supported | Limited Set |
| Manifest Support | Full v3 | v3 with limitations | Full v3 | v3 with WebKit specifics |
| Welcome Flow | Simple | Certificate-focused | Simple | WebKit-specific |

## Testing

### Manual Testing

1. Load the extension in your target browser using the appropriate method:
   - Chrome/Edge: "Load unpacked" in extensions page
   - Firefox: "Load Temporary Add-on" in about:debugging
   - Safari: Run converted app from Xcode

2. Test various header configurations:
   - Static headers with different domain patterns
   - Dynamic headers with prefix/suffix formatting
   - Multiple domains per header
   - Import/export functionality
   - Test validation for invalid header values
   - Test with and without the companion app

3. Cross-browser specific tests:
   - Test WebSocket connection in each browser
   - For Firefox, test both WSS and WS connections
   - Test the welcome page flow for each browser
   - Verify that headers are applied to all resource types
   - Check that UI styling is consistent
   - Test cache prevention functionality

### Welcome Page Testing

Verify the welcome page functions correctly:
1. Reset the storage to simulate first install:
   ```javascript
   // In browser console
   chrome.storage.local.remove(['setupCompleted', 'certificateAccepted']);
   // or for Firefox
   browser.storage.local.remove(['setupCompleted', 'certificateAccepted']);
   ```
2. Reload the extension
3. Verify the welcome page appears automatically
4. Test each step in the welcome flow
5. Verify certificate acceptance (Firefox)
6. Confirm connection verification works properly
7. Ensure setup state is saved correctly

### End-to-End Testing

For complete testing with the companion app:

1. Start the companion app
2. Ensure the WebSocket connection is established (look for "Connected" status)
3. Create headers with dynamic sources
4. Verify header injection by visiting test websites

### Testing Domains

For testing header injection, use sites like:
- [httpbin.org/headers](https://httpbin.org/headers) - Shows received headers
- [requestbin.com](https://requestbin.com) - Create a bin to inspect headers

## Building for Distribution

### Production Build

To create production-ready builds for all browsers:

```bash
npm run build
```

This will:
1. Bundle all scripts with Webpack
2. Minify (but not obfuscate) the code to comply with Chrome Web Store requirements
3. Create browser-specific builds in the `dist` directory

### Creating Release Packages

To create zip packages for distribution:

```bash
npm run release
```

This will:
1. Build all browser versions
2. Create zip packages in the `releases` directory
3. Display a summary of the created packages

### Browser Store Submissions

#### Chrome Web Store
1. Create a release package using `npm run release`
2. Sign in to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
3. Upload the Chrome zip file from the `releases` directory
4. Complete the store listing information
5. Submit for review

**Important**: Chrome Web Store has strict requirements about code readability. The extension code must not be obfuscated. Our build process is configured to comply with these requirements.

#### Firefox Add-ons
1. Create a release package using `npm run release`
2. Sign in to [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/)
3. Upload the Firefox zip file from the `releases` directory
4. Complete the listing information
5. Submit for review

#### Microsoft Edge Add-ons
1. Create a release package using `npm run release`
2. Sign in to [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview)
3. Upload the Edge zip file from the `releases` directory
4. Complete the listing information
5. Submit for review

#### Safari App Store
1. Create a release package using `npm run release`
2. Run `npm run safari:convert` to convert to a Safari app
3. Open the Xcode project in `safari/xcode_project`
4. Sign with your Apple Developer account
5. Archive and upload to App Store Connect
6. Complete the listing information
7. Submit for review

## Implementation Details

### Multiple Domains Support

Headers can now be applied to multiple domains using the domain-tags-manager.js module:

- The domain input allows adding multiple patterns with enter or comma separator
- Domains are stored as arrays in the header configuration
- The `header-manager.js` creates separate rules for each domain pattern

### Browser Compatibility Layer

The browser-api.js module provides a unified interface for browser APIs:

- Detects the current browser environment
- Provides consistent API methods that work across browsers
- Handles Firefox's promisified APIs vs Chrome's callback-based APIs
- Manages Safari's storage limitations

### WebSocket Connection Handling

Browser-specific WebSocket handling in v1.2.0:

- **Firefox** (Enhanced in v1.2.0): 
  - Primary: Secure WebSocket (`wss://`) on port 59211
  - Certificate acceptance via welcome page
  - Fallback to standard WebSocket (`ws://`) if needed
  - Smart connection restoration based on previous success

- **Chrome/Edge**: 
  - Standard WebSocket implementation on port 59210
  - Simplified connection flow

- **Safari**: 
  - Uses adapter for WebKit security model
  - Special handling for Safari's strict security requirements

All browsers implement:
- Auto-reconnection with browser-specific error handling
- Detection of removed sources and header configuration updates
- Connection status persistence across browser sessions

### Welcome Page Implementation

The welcome page (added in v1.2.0):

- **Browser Detection**: Automatically detects browser type
- **Adaptive UI**: Shows only relevant steps for each browser
- **Firefox Flow**:
  1. Check if companion app is running
  2. Guide through certificate acceptance process
  3. Verify secure connection
  
- **Chrome/Edge/Safari Flow**:
  1. Check if companion app is running
  2. Verify connection
  
- **Persistence**:
  - Stores setup completion status
  - Remembers certificate acceptance for Firefox
  - Prevents showing welcome page on subsequent launches
  
- **Error Handling**:
  - Provides retry options if connection fails
  - Shows helpful error messages
  - Offers links to documentation for troubleshooting

### Cache Prevention for Headers

To ensure headers are applied consistently:

- Adds Cache-Control and other cache-related headers to prevent browsers from using cached responses
- Implements different resource type handling for Firefox vs Chrome/Edge
- Creates separate rules for main_frame and other resource types
- Uses debouncing and hash-based change detection to prevent unnecessary rule updates

## Server Component

The companion app runs WebSocket servers on two ports:
- Standard WebSocket server on port 59210 (ws://)
- Secure WebSocket server on port 59211 (wss://)

### Source Types

- **HTTP**: Values from HTTP requests responses
- **File**: Values from local files on your system
- **Environment**: Values from environment variables

### Communication Protocol

The extension and companion app communicate with JSON messages:

```json
{
  "type": "sourcesUpdated",
  "sources": [
    {
      "sourceId": "unique-id-1",
      "sourceType": "http",
      "sourcePath": "https://api.example.com/status",
      "sourceTag": "API Token",
      "sourceContent": "token-value-123"
    },
    {
      "sourceId": "unique-id-2",
      "sourceType": "file",
      "sourcePath": "/path/to/file.txt",
      "sourceTag": "Config",
      "sourceContent": "file-content-here"
    }
  ]
}
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines and procedures.
