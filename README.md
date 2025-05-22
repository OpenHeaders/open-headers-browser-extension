# Open Headers

![Open Headers Logo](./src/assets/images/icon128.png)

A modern browser extension for managing HTTP headers with static and dynamic sources. Built with React 18 and Ant Design 5 featuring an Apple-like minimalist design. Modify request headers for specific domains with values from HTTP requests, environment variables, files, and more.

## Features

- 🔄 **Dynamic Sources**: Pull header values from HTTP requests, environment variables, and local files
- 🌐 **Cross-Browser Support**: Works on Chrome, Firefox, Edge, and Safari
- 🔌 **Live Updates**: Values automatically refresh when source content changes
- 🎯 **Multiple Domain Targeting**: Apply headers to specific domains using URL patterns
- 🛡️ **Header Validation**: Automatic validation and sanitization of header values
- 💾 **Persistent Settings**: Header configurations are saved and restored automatically
- 📋 **Import/Export**: Share header configurations across devices or save backups
- 🔧 **Value Formatting**: Customize dynamic values with prefixes and suffixes
- 🚀 **Intuitive Onboarding**: Streamlined setup process with browser-specific guidance
- ⚛️ **Modern UI**: Built with React 18 and Ant Design 5 for a sleek, responsive interface
- 🎨 **Apple-like Design**: Minimalist aesthetic with smooth transitions and clean typography

## Technology Stack

- **Frontend**: React 18 with functional components and hooks
- **UI Library**: Ant Design 5 with custom Apple-like theming
- **Build System**: Webpack 5 with Babel for ES6+ and JSX compilation
- **State Management**: React Context API for global state
- **Cross-Browser Support**: Browser-specific webpack configurations
- **Background Service**: Vanilla JavaScript for browser API compatibility

## Overview

Open Headers gives you fine-grained control over HTTP request headers in your browser. It's designed for:

- **Development**: Test APIs with different auth tokens, API keys, or custom headers
- **Debugging**: Troubleshoot issues by modifying headers for specific domains
- **Integration**: Work with multiple environments using dynamic values from your local system

The extension works with the Open Headers companion app (optional) to access local files and environment variables as dynamic sources.

## Installation

### From Browser Web Stores

- **Chrome**: Visit the [Chrome Web Store](https://chromewebstore.google.com/detail/ablaikadpbfblkmhpmbbnbbfjoibeejb?utm_source=item-share-cb)
- **Firefox**: Visit [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/open-headers/)
- **Edge**: Visit [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/open-headers/gnbibobkkddlflknjkgcmokdlpddegpo)
- **Safari**: Currently only available via manual installation (requires macOS)

### Manual Installation (Developer Mode)

#### Chrome, Edge
1. Download and unzip the latest release from GitHub
2. Open the browser and navigate to the extensions page
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. Enable "Developer mode" using the toggle in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. The extension should appear in your toolbar

#### Firefox
1. Download and unzip the latest release from GitHub
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file in the extension directory
5. The extension should appear in your toolbar

#### Safari (macOS only)
1. Build the Safari version: `npm run build:safari`
2. Convert to Safari extension: `npm run safari:convert`
3. Open the generated Xcode project in `manifests/safari/xcode_project`
4. Sign the app with your Apple ID in Xcode
5. Run the app in Xcode
6. Enable the extension in Safari under Settings → Extensions

## First-Time Setup

When you first install Open Headers, an intuitive multi-step welcome experience will guide you through the setup process:

1. **Welcome Introduction**: A quick overview of the extension with visual demonstration
2. **Companion App Setup**:
   - Install and run the companion app if you want to use dynamic sources
   - The extension automatically detects when the app is running
   - **Firefox Users**: Accept the security certificate when prompted
   - Real-time connection verification with visual feedback
3. **Finalize Setup**:
   - Learn how to pin the extension to your browser toolbar with visual guides
   - Get started with managing HTTP headers

The welcome experience adapts to your specific browser, showing only relevant steps and providing browser-specific guidance with smooth transitions and Apple-like design elements.

## Usage

### Modern React Interface

The extension features a completely redesigned interface built with React 18 and Ant Design 5:

- **Clean Layout**: Apple-like minimalist design with intuitive navigation
- **Real-time Updates**: Live connection status and dynamic source monitoring
- **Form Validation**: Instant feedback for header names, values, and domain patterns
- **Responsive Design**: Optimized for browser extension popup dimensions
- **Smooth Transitions**: Fluid animations and state changes

### Adding a Static Header

1. Click the Open Headers icon in your toolbar
2. Enter the header name (e.g., `Authorization`)
3. Select "Static" as the value type
4. Enter the header value (e.g., `Bearer token123`)
5. Add one or more domain patterns (e.g., `api.example.com/*`)
6. Click "Save"

### Adding a Dynamic Header

1. Click the Open Headers icon
2. Enter the header name
3. Select "Dynamic" as the value type
4. Choose a source from the dropdown (requires the companion app to be running)
5. Optionally add prefix/suffix to format the dynamic value
6. Add one or more domain patterns
7. Click "Save"

### Managing Multiple Domains

1. When adding a header, type a domain pattern and press Enter or comma to add it
2. Add as many domain patterns as needed for the header
3. Use wildcards (`*`) for flexible matching (e.g., `*.example.com/*`)
4. Click the × icon to remove a domain from the list

### Importing and Exporting Configurations

1. To export your current configuration:
   - Click the "Export" button in the popup
   - Save the JSON file to your preferred location

2. To import a configuration:
   - Click the "Import" button in the popup
   - Select a previously exported JSON file
   - Your headers will be imported and applied immediately

### Using Prefix and Suffix with Dynamic Values

When using dynamic sources, you can format the value with prefixes and suffixes:

1. Select "Dynamic" as the value type
2. Choose your source
3. In the "Format" section:
   - Add a prefix (e.g., `Bearer `)
   - Add a suffix (e.g., `.v1`)
4. The final header value will be: `[prefix][dynamic value][suffix]`

### Companion App for Dynamic Sources

For dynamic sources (HTTP requests, files, environment variables), you'll need the Open Headers companion app:

- [macOS Download](https://github.com/OpenHeaders/open-headers-app/releases)
- [Windows Download](https://github.com/OpenHeaders/open-headers-app/releases)
- [Linux Download](https://github.com/OpenHeaders/open-headers-app/releases)

## Examples

### API Authentication Token

- Header Name: `Authorization`
- Value Type: Dynamic
- Source: Environment variable `API_TOKEN`
- Prefix: `Bearer `
- Domains: `api.example.com/*`, `api.backup-server.com/*`

### Custom User Agent

- Header Name: `User-Agent`
- Value Type: Static
- Value: `MyCustomClient/1.0`
- Domains: `*.myservice.com/*`

### Feature Flag

- Header Name: `X-Feature-Enabled`
- Value Type: Dynamic
- Source: Local file containing `true` or `false`
- Domains: `dev.myapp.com/*`, `staging.myapp.com/*`

## Browser-Specific Notes

### Chrome & Edge
- Full support for all features
- Most efficient WebSocket connection handling
- Streamlined setup experience
- Optimal React performance

### Firefox
- Enhanced secure WebSocket connection support
- Interactive certificate acceptance process
- More strict Content Security Policy enforcement
- Custom welcome experience for certificate handling
- React components fully compatible

### Safari
- Requires macOS for installation
- Must be packaged as a macOS app using Xcode
- Most strict security model, especially for WebSocket connections
- Tailored setup flow for WebKit environment
- WebKit-optimized React build

## Development

### Architecture

Open Headers uses a modern, maintainable architecture:

- **React Frontend**: Modern functional components with hooks
- **Ant Design UI**: Consistent, accessible components with custom theming
- **Context State Management**: React Context for global application state
- **Background Service Worker**: Cross-browser compatible vanilla JavaScript
- **Webpack Build System**: Browser-specific optimized builds

### Project Structure

```
src/
├── popup/                 # React popup application
│   ├── App.jsx           # Main popup component
│   ├── index.jsx         # React app entry point
│   ├── components/       # Reusable React components
│   └── styles/          # LESS stylesheets
├── background/           # Background service worker
├── context/             # React Context providers
├── hooks/               # Custom React hooks
├── utils/               # Shared utility functions
└── assets/              # Static assets
    ├── images/          # Extension icons and images
    └── welcome/         # Welcome page files
```

## Troubleshooting

- **Header Not Applied**: Ensure the domain pattern matches the URL you're visiting
- **Dynamic Source Missing**: Check that the companion app is running and connected
- **Value Not Updating**: The companion app may have lost track of the source; restart it
- **Invalid Header**: Some header values may be sanitized if they contain invalid characters
- **Firefox Connection Issues**: Use the welcome page to verify certificate acceptance
- **Safari Connection Issues**: Safari may require additional permissions for WebSocket connections
- **React Issues**: Clear browser extension cache and reload the extension

## Contributing

Contributions are welcome! Please check the [DEVELOPER.md](docs/DEVELOPER.md) file for development setup instructions including React development workflow.

## Acknowledgments

- All contributors and users of Open Headers
- The React and Ant Design teams for excellent frameworks
- The browser extension teams for the powerful extensions APIs
- Everyone who provided feedback and suggestions

## Documentation

- For more detailed information, see [DEVELOPER.md](docs/DEVELOPER.md)
- For contributing, see [CONTRIBUTING.md](docs/CONTRIBUTING.md)
- For privacy information, see [PRIVACY.md](docs/PRIVACY.md)