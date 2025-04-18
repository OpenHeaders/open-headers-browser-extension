# Open Headers

![Open Headers Logo](./images/icon128.png)

A Chrome extension for managing HTTP headers with static and dynamic sources. Modify request headers for specific domains with values from HTTP requests, environment variables, files, and more.

## Features

- 🔄 **Dynamic Sources**: Pull header values from HTTP requests, environment variables, and local files
- 🔌 **Live Updates**: Values automatically refresh when source content changes
- 🌐 **Multiple Domain Targeting**: Apply headers to specific domains using URL patterns
- 🛡️ **Header Validation**: Automatic validation and sanitization of header values
- 💾 **Persistent Settings**: Header configurations are saved and restored automatically
- 📋 **Import/Export**: Share header configurations across devices or save backups
- 🔧 **Value Formatting**: Customize dynamic values with prefixes and suffixes

## Overview

Open Headers gives you fine-grained control over HTTP request headers in your browser. It's designed for:

- **Development**: Test APIs with different auth tokens, API keys, or custom headers
- **Debugging**: Troubleshoot issues by modifying headers for specific domains
- **Integration**: Work with multiple environments using dynamic values from your local system

The extension works with the Open Headers companion app (optional) to access local files and environment variables as dynamic sources.

## Installation

### From Chrome Web Store

1. Visit the [Open Headers page](https://github.com/OpenHeaders/open-headers-browser-extension) on the Chrome Web Store
2. Click "Add to Chrome"
3. Grant the required permissions

### Manual Installation (Developer Mode)

1. Download and unzip the latest release from GitHub
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" using the toggle in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. The extension should appear in your toolbar

## Usage

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

## Troubleshooting

- **Header Not Applied**: Ensure the domain pattern matches the URL you're visiting
- **Dynamic Source Missing**: Check that the companion app is running
- **Value Not Updating**: The companion app may have lost track of the source; restart it
- **Invalid Header**: Some header values may be sanitized if they contain invalid characters

## Contributing

Contributions are welcome! Please check the DEVELOPER.md file for development setup instructions.

## Acknowledgments

- All contributors and users of Open Headers
- The Chrome Extensions team for the powerful extensions API
- Everyone who provided feedback and suggestions


## Documentation

- For more detailed information, see [DEVELOPER.md](DEVELOPER.md).
- For contributing, see [CONTRIBUTING.md](CONTRIBUTING.md).