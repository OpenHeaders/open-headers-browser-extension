# Open Headers

![Open Headers Logo](./src/assets/images/icon128.png)

A modern browser extension for managing HTTP headers with static and dynamic sources. Built with React 18 and Ant Design 5, featuring an Apple-inspired minimalist design. Modify request and response headers for specific domains with values from HTTP requests, environment variables, files, and more.

## ✨ Features

- 🔄 **Dynamic Sources**: Pull header values from HTTP requests, environment variables, and local files
- 🌐 **Cross-Browser Support**: Works on Chrome, Firefox, Edge, and Safari
- 🔌 **Live Updates**: Values automatically refresh when source content changes
- 🎯 **Multiple Domain Targeting**: Apply headers to specific domains using URL patterns
- 🛡️ **Smart Validation**: Automatic validation and conflict detection for headers and domains
- 💾 **Persistent Settings**: Header configurations are saved and restored automatically
- 📋 **Import/Export**: Share header configurations across devices or save backups
- 🔧 **Value Formatting**: Customize dynamic values with prefixes and suffixes
- 🌓 **Dark Mode Support**: Automatic theme detection with manual override option
- 🚀 **Modern UI**: Built with React 18 and Ant Design 5 for a sleek, responsive interface
- 🎨 **Professional Design**: Clean interface with advanced table view, sorting, and filtering
- ⚡ **Real-time Status**: Visual indicators for connection status and header validation

## 🛠️ Technology Stack

- **Frontend**: React 18 with functional components and hooks
- **UI Library**: Ant Design 5 with custom Apple-inspired theming
- **Build System**: Webpack 5 with Babel for ES6+ and JSX compilation
- **State Management**: React Context API for global state
- **Styling**: LESS with CSS custom properties for theming
- **Background Service**: Vanilla JavaScript for browser API compatibility
- **Cross-Browser Support**: Browser-specific webpack configurations

## 📦 Installation

### From Browser Web Stores

- **Chrome**: Visit the [Chrome Web Store](https://chromewebstore.google.com/detail/ablaikadpbfblkmhpmbbnbbfjoibeejb)
- **Firefox**: Visit [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/open-headers/)
- **Edge**: Visit [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/open-headers/gnbibobkkddlflknjkgcmokdlpddegpo)
- **Safari**: Currently only available via manual installation (requires macOS)

### Manual Installation (Developer Mode)

#### Chrome, Edge
1. Download and unzip the latest release from [GitHub Releases](https://github.com/OpenHeaders/open-headers-browser-extension/releases)
2. Open the browser and navigate to the extensions page
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. Enable "Developer mode" using the toggle in the top-right corner
4. Click "Load unpacked" and select the appropriate browser folder from the `dist` directory
5. The extension should appear in your toolbar

#### Firefox
1. Download and unzip the latest release from GitHub
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Navigate to the `dist/firefox` folder and select the `manifest.json` file
5. The extension should appear in your toolbar

#### Safari (macOS only)
1. Build the Safari version: `npm run build:safari`
2. Convert to Safari extension: `npm run safari:convert`
3. Open the generated Xcode project in `manifests/safari/xcode_project`
4. Sign the app with your Apple ID in Xcode
5. Run the app in Xcode
6. Enable the extension in Safari under Settings → Extensions

## 🚀 Getting Started

### First-Time Setup

When you first install Open Headers, an intuitive multi-step welcome experience will guide you through the setup process:

1. **Welcome Introduction**: A quick overview of the extension with visual demonstration
2. **Companion App Setup** (Optional):
   - Install and run the companion app if you want to use dynamic sources
   - The extension automatically detects when the app is running
   - **Firefox Users**: Accept the security certificate when prompted
   - Real-time connection verification with visual feedback
3. **Quick Start Guide**:
   - Learn how to pin the extension to your browser toolbar
   - Get started with managing HTTP headers

The welcome experience adapts to your specific browser, showing only relevant steps and providing browser-specific guidance.

### Companion App for Dynamic Sources

For dynamic sources (HTTP requests, files, environment variables), you'll need the Open Headers companion app:

- [Download for macOS, Windows, and Linux](https://github.com/OpenHeaders/open-headers-app/releases)

## 📖 Usage

### Adding a Static Header

1. Click the Open Headers icon in your toolbar
2. Click on "Add New Header Rule" to expand the form
3. Enter the header name (e.g., `Authorization`)
4. Choose direction: Request or Response
5. Select "Static" as the value type
6. Enter the header value (e.g., `Bearer token123`)
7. Add one or more domain patterns (e.g., `api.example.com/*`)
8. Click "Create"

### Adding a Dynamic Header

1. Ensure the companion app is running (you'll see "Connected" status)
2. Click "Add New Header Rule"
3. Enter the header name
4. Choose direction: Request or Response
5. Select "Dynamic" as the value type
6. Choose a source from the dropdown
7. Optionally add prefix/suffix to format the dynamic value
8. Add domain patterns
9. Click "Create"

### Managing Headers

- **Enable/Disable**: Use the toggle switch in the Status column
- **Edit**: Click the edit icon to modify any header rule
- **Delete**: Click the delete icon and confirm
- **Search**: Use the search bar to filter headers by name, value, or domain
- **Sort**: Click column headers to sort the table
- **Filter**: Use the filter icons in column headers for advanced filtering

### Domain Patterns

Open Headers supports flexible domain patterns:

- **Exact domain**: `example.com`
- **Subdomain wildcard**: `*.example.com`
- **Path wildcard**: `example.com/*`
- **Port specific**: `localhost:3000`
- **Protocol specific**: `https://example.com/*`
- **IP addresses**: `192.168.1.1`
- **Multiple domains**: Add multiple patterns with Enter or comma

### Value Formatting for Dynamic Headers

When using dynamic sources, format the final value with prefixes and suffixes:

- **Prefix**: Text added before the dynamic value
- **Suffix**: Text added after the dynamic value
- **Example**: For "Bearer token123", set prefix to "Bearer " (with space)

The final header value will be: `[prefix][dynamic value][suffix]`

### Import/Export Configuration

**Export your configuration:**
1. Click "Export rules" in the footer
2. Save the JSON file to your preferred location

**Import a configuration:**
1. Click "Import rules" in the footer
2. Select a previously exported JSON file
3. Your headers will be imported and applied immediately

## 📊 Features in Detail

### Smart Validation

- **Header Names**: Validates against browser restrictions and provides suggestions
- **Header Values**: Checks for invalid characters and length limits
- **Domain Patterns**: Validates URL patterns and detects conflicts
- **Real-time Feedback**: Instant validation with helpful error messages

### Theme Support

- **Auto Mode**: Follows your system theme preference
- **Light Mode**: Clean, bright interface
- **Dark Mode**: Easy on the eyes for night usage
- Toggle themes using the theme button in the header

### Connection Status

- **Green Badge**: Connected to companion app
- **Red Badge**: Disconnected (static headers still work)
- **Visual Indicators**: Real-time connection status in the header

### Professional Table View

- **Sortable Columns**: Click headers to sort
- **Advanced Filtering**: Filter by header name, domain, type, or status
- **Search**: Global search across all fields
- **Pagination**: Handles large numbers of rules efficiently
- **Status Tags**: Visual indicators for request/response, dynamic sources, and connection status

## 💡 Examples

### API Authentication Token
```
Header Name: Authorization
Direction: Request
Value Type: Dynamic
Source: Environment variable $API_TOKEN
Prefix: Bearer 
Domains: api.example.com/*, api-staging.example.com/*
```

### CORS Headers
```
Header Name: Access-Control-Allow-Origin
Direction: Response
Value Type: Static
Value: https://myapp.com
Domains: api.myservice.com/*
```

### Custom User Agent
```
Header Name: User-Agent
Direction: Request
Value Type: Static
Value: MyApp/2.0 (Compatible)
Domains: *.myservice.com/*
```

### Development Feature Flags
```
Header Name: X-Feature-Flags
Direction: Request
Value Type: Dynamic
Source: Local file ~/feature-flags.json
Domains: localhost:3000/*, dev.myapp.com/*
```

## 🌐 Browser-Specific Notes

### Chrome & Edge
- Full support for all features
- Optimal performance and WebSocket handling
- Seamless import/export functionality

### Firefox
- Enhanced secure WebSocket support
- Certificate acceptance required for companion app
- Dedicated import/export pages for better user experience
- Full React DevTools support

### Safari
- Requires macOS for installation
- Must be packaged as a macOS app using Xcode
- WebKit-optimized build configuration
- Some limitations with WebSocket connections

## 🔒 Privacy & Security

- **No Data Collection**: We don't collect any user data or telemetry
- **Local Storage Only**: All configurations stored locally in your browser
- **Open Source**: Complete transparency with publicly available source code
- **Secure Communication**: Local-only WebSocket connection to companion app
- **No External Connections**: Extension never communicates with external servers

## 🐛 Troubleshooting

### Headers Not Applied
- Ensure the domain pattern matches the URL you're visiting
- Check that the header rule is enabled (toggle switch)
- Verify browser console for any errors

### Dynamic Source Not Working
- Check that the companion app is running (status should show "Connected")
- For Firefox: Ensure you've accepted the security certificate
- Verify the source exists in the companion app

### Connection Issues
- Restart the companion app
- Check firewall settings for port 59210/59211
- Try disabling and re-enabling the extension

### Import/Export Issues
- Ensure the JSON file is valid and not corrupted
- Check that you have the necessary permissions
- Try using a different browser if issues persist

## 🤝 Contributing

We welcome contributions! Please check out our [Contributing Guide](docs/CONTRIBUTING.md) and [Developer Documentation](docs/DEVELOPER.md).

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- All contributors and users of Open Headers
- The React and Ant Design teams for excellent frameworks
- The browser extension teams for powerful APIs
- Everyone who provided feedback and suggestions

## 📚 Documentation

- [Developer Guide](docs/DEVELOPER.md) - Technical documentation for developers
- [Contributing Guide](docs/CONTRIBUTING.md) - How to contribute to the project
- [Privacy Policy](docs/PRIVACY.md) - Our privacy commitments

## 🔗 Links

- [GitHub Repository](https://github.com/OpenHeaders/open-headers-browser-extension)
- [Companion App](https://github.com/OpenHeaders/open-headers-app)
- [Report Issues](https://github.com/OpenHeaders/open-headers-browser-extension/issues)