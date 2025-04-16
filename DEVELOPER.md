# Open Headers - Developer Documentation

This document contains technical information for developers who want to contribute to the Open Headers browser extension.

## Architecture

### Components

The extension consists of these main components:

- **Popup UI**: The interface that appears when clicking the extension icon
- **Background Service Worker**: Runs in the background to manage header rules
- **WebSocket Client**: Connects to the companion app for dynamic sources
- **Header Rule System**: Applies headers to matching requests

### Modules

| Module | Description |
|--------|-------------|
| `background.js` | Main background service worker that coordinates the extension |
| `header-manager.js` | Creates and updates Chrome's declarativeNetRequest rules |
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

### Data Flow

1. User configures headers in the popup UI
2. Configurations are saved to Chrome storage
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
   npm run build
   ```

### Project Structure

```
open-headers/
├── images/              # Extension icons
├── js/
│   ├── background/      # Background service worker scripts
│   │   ├── index.js     # Entry point for background script
│   │   ├── background.js # Main background worker logic
│   │   ├── header-manager.js # Header rule management
│   │   ├── rule-validator.js # Header validation
│   │   └── websocket.js # WebSocket client
│   ├── popup/           # Popup UI scripts
│   │   ├── index.js     # Entry point for popup
│   │   ├── popup.js     # Main popup logic
│   │   ├── entry-manager.js # Entry management
│   │   ├── ui-manager.js # UI utilities
│   │   ├── domain-tags-manager.js # Domain tag input management
│   │   ├── config-manager.js # Import/export functionality
│   │   ├── draft-manager.js # Draft inputs management
│   │   └── notification-system.js # Notification display
│   └── shared/          # Shared utilities
│       └── utils.js     # Common utility functions
├── manifest.json        # Extension manifest
├── popup.html           # Popup UI HTML
├── popup.css            # Popup UI styles
├── package.json         # npm package configuration
└── webpack.config.js    # Webpack configuration
```

### Development Workflow

1. Make your changes to the source files
2. Run `npm run build` to create a development build
3. Load the extension in Chrome using "Load unpacked" and pointing to the `dist` directory
4. Test your changes
5. For production build, run `npm run build && npm run obfuscate`

## Testing

### Manual Testing

1. Load the extension in Chrome using Developer Mode
2. Test various header configurations:
   - Static headers with different domain patterns
   - Dynamic headers with prefix/suffix formatting
   - Multiple domains per header
   - Import/export functionality
   - Test validation for invalid header values
   - Test with and without the companion app

### Unit Tests

Run the test suite:

```bash
npm test
```

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

To create a production-ready build:

```bash
npm run build
npm run obfuscate
```

This will:
1. Bundle all scripts with Webpack
2. Minify and optimize the code
3. Obfuscate sensitive parts of the code
4. Create a `dist` directory with the final extension

### Chrome Web Store Submission

1. Zip the contents of the `dist` directory
2. Sign in to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
3. Upload the zip file
4. Complete the store listing information
5. Submit for review

## Implementation Details

### Multiple Domains Support

Headers can now be applied to multiple domains using the domain-tags-manager.js module:

- The domain input allows adding multiple patterns with enter or comma separator
- Domains are stored as arrays in the header configuration
- The `header-manager.js` creates separate rules for each domain pattern

### Import/Export Feature

Configuration management is handled by the config-manager.js module:

- Export creates a JSON file with the current configuration
- Import reads a JSON file and applies the configuration
- The feature uses the File System Access API when available with fallback to classic download

### Prefix/Suffix Support

Dynamic sources can be formatted using prefix and suffix:

- Added in the UI when "Dynamic" value type is selected
- Values are stored with each header configuration
- When header rules are generated, the format is applied: `prefix + dynamicValue + suffix`
- This allows for easy token formatting like `Bearer {token}` or other common patterns

### WebSocket Integration

The real-time connection to the companion app:

- Uses a WebSocket connection to localhost:59210
- Includes pre-checking to avoid connection errors
- Implements automatic reconnection with exponential backoff
- Persists dynamic sources to storage for offline access

## Server Component

The companion app runs a WebSocket server on port 59210 that provides dynamic source values to the extension.

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

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Coding Standards

- Use ES6+ JavaScript features
- Document functions with JSDoc comments
- Follow the existing code structure
- Update documentation when adding new features