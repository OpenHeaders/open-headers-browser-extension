# Contributing to Open Headers

Thank you for your interest in contributing to Open Headers! This document provides guidelines and workflows to help you contribute effectively to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branching Strategy](#branching-strategy)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Cross-Browser Testing](#cross-browser-testing)
- [Documentation](#documentation)
- [Issue Tracking](#issue-tracking)
- [Release Process](#release-process)

## Code of Conduct

We expect all contributors to follow our Code of Conduct. Please be respectful and inclusive in all interactions within the project.

## Getting Started

1. **Fork the repository**:
   - Visit the [Open Headers repository](https://github.com/OpenHeaders/open-headers-browser-extension)
   - Click the "Fork" button to create your own copy

2. **Clone your fork**:
   ```bash
   git clone https://github.com/your-username/open-headers-browser-extension.git
   cd open-headers-browser-extension
   ```

3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/OpenHeaders/open-headers-browser-extension.git
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Build the extension**:
   ```bash
   npm run build           # Build for all browsers
   # Or for specific browsers:
   npm run build:chrome    # Build for Chrome
   npm run build:firefox   # Build for Firefox
   npm run build:edge      # Build for Edge
   npm run build:safari    # Build for Safari
   ```

6. **Load the extension in your browser**:
   - **Chrome/Edge**:
     - Navigate to `chrome://extensions/` or `edge://extensions/`
     - Enable "Developer Mode"
     - Click "Load unpacked" and select the appropriate `dist` directory

   - **Firefox**:
     - Navigate to `about:debugging#/runtime/this-firefox`
     - Click "Load Temporary Add-on"
     - Select the `manifest.json` file in the appropriate `dist` directory

   - **Safari**:
     - Run `npm run safari:convert` after building
     - Open the Xcode project
     - Run the app from Xcode
     - Enable the extension in Safari settings

## Development Workflow

1. **Create a new branch** for your work (see [Branching Strategy](#branching-strategy))
2. **Make your changes** to the codebase
3. **Run the build process** for the browsers you're targeting:
   ```bash
   npm run build:chrome    # For Chrome
   npm run build:firefox   # For Firefox
   npm run build:edge      # For Edge
   npm run build:safari    # For Safari
   ```
4. **Test your changes** in each targeted browser
5. **Commit your changes** (see [Commit Message Guidelines](#commit-message-guidelines))
6. **Push your branch** to your fork
7. **Create a pull request** to the main repository

## Project Structure

Please familiarize yourself with our project structure:

```
open-headers/
├── shared/              # Shared code and resources
│   ├── js/             # JavaScript sources
│   ├── popup.html      # Popup UI HTML
│   ├── popup.css       # Popup UI styles
│   └── images/         # Icons and images
│
├── manifests/          # Browser-specific manifest files
│   ├── chrome/
│   ├── firefox/
│   ├── edge/
│   └── safari/
│
├── config/             # Configuration files
│   ├── webpack/        # Webpack configurations
│   └── scripts/        # Build and utility scripts
│
├── docs/               # Documentation
│
├── dist/               # Build output (gitignored)
│
├── releases/           # Release packages (gitignored)
```

## Branching Strategy

We use a feature-based branching strategy. All branches should be created from the `main` branch.

### Branch Naming Conventions

- **Feature branches**: `feature/short-description` or `feature/issue-number-description`
  - Example: `feature/multi-domain-support` or `feature/42-import-export`

- **Bug fix branches**: `fix/short-description` or `fix/issue-number-description`
  - Example: `fix/header-validation` or `fix/57-dynamic-value-styling`

- **Documentation branches**: `docs/short-description`
  - Example: `docs/api-documentation`

- **Performance improvement branches**: `perf/short-description`
  - Example: `perf/websocket-connection`

- **Refactoring branches**: `refactor/short-description`
  - Example: `refactor/entry-manager`

- **Testing branches**: `test/short-description`
  - Example: `test/header-validation`

- **Browser-specific branches**: `browser/browser-name-description`
  - Example: `browser/firefox-compatibility` or `browser/safari-support`

### Branch Lifecycle

1. Create a branch for your work
2. Make your changes and push them
3. Open a pull request
4. After approval and merging, delete the branch

## Commit Message Guidelines

We follow a simplified version of the [Conventional Commits](https://www.conventionalcommits.org/) standard.

### Format

```
<type>: <short summary>
<BLANK LINE>
<optional body>
<BLANK LINE>
<optional footer>
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation changes
- **style**: Changes that don't affect code functionality (formatting, etc.)
- **refactor**: Code changes that neither fix a bug nor add a feature
- **test**: Adding or updating tests
- **perf**: Performance improvements
- **chore**: Changes to build process, dependencies, etc.
- **browser**: Browser-specific changes or compatibility fixes

### Examples

```
feat: add multi-domain support to header entries

This change allows users to specify multiple domains for a single header entry.
The domains are displayed as tags in the UI and can be individually removed.

Closes #42
```

```
browser: fix firefox websocket connection

Addresses the strict security requirements in Firefox by implementing
a specialized WebSocket connection method that properly handles
the 426 upgrade required response.

Fixes #57
```

## Pull Request Process

1. **Create a pull request** from your feature branch to the `main` branch of the original repository
2. **Fill out the PR template** with all relevant information
3. **Link any related issues** using GitHub's keywords (Fixes #123, Closes #456, etc.)
4. **Wait for the review process** - maintainers will review your code
5. **Make any requested changes** based on the review feedback
6. **Once approved**, a maintainer will merge your PR

### PR Size Guidelines

- Keep PRs focused on a single issue or feature when possible
- Large changes should be broken into smaller, logically separate PRs
- If a PR becomes too large, consider splitting it

## Cross-Browser Testing

All contributions should be tested across supported browsers:

### Required Testing

1. **Chrome Testing**:
   - Load the extension in Chrome using Developer Mode
   - Test all affected functionality
   - Verify header injection works correctly
   - Check console for errors

2. **Firefox Testing**:
   - Load the extension as a temporary add-on
   - Verify WebSocket connection works properly
   - Test header injection with different resource types
   - Check for any security-related console warnings

3. **Edge Testing**:
   - Similar to Chrome testing
   - Verify compatibility with Edge's extension model

### Recommended Testing (if possible)

4. **Safari Testing** (if macOS is available):
   - Build and convert for Safari
   - Test using Xcode and Safari extension tools
   - Verify WebKit compatibility

### Testing Focus Areas

- **WebSocket Connection**: Ensure it works in all browsers
- **Header Injection**: Check headers work for different resource types
- **UI Consistency**: Verify styling is consistent across browsers
- **Storage**: Confirm settings persist between sessions
- **Performance**: Check for any browser-specific performance issues

## Documentation

When adding features or making significant changes, please update the relevant documentation:

1. **Code comments**:
   - Use JSDoc format for function and class documentation
   - Explain complex logic or workarounds
   - Document browser-specific code paths

2. **README.md**:
   - Update for new features or changed behaviors
   - Document browser-specific differences
   - Add examples for new functionality

3. **docs/DEVELOPER.md**:
   - Update technical details for developers
   - Document browser compatibility issues and solutions

## Issue Tracking

We use GitHub Issues to track bugs, enhancements, and feature requests.

### Creating Issues

- **Bug reports**: Include steps to reproduce, expected behavior, actual behavior, browser version, and your environment details
- **Feature requests**: Describe the feature, its benefits, and potential implementation approaches
- **Enhancement requests**: Explain what existing functionality should be improved and why
- **Browser compatibility issues**: Specify which browser(s) are affected and include relevant error messages

### Issue Labels

- `bug`: A problem with the extension
- `feature`: A new feature request
- `enhancement`: Improvement to existing functionality
- `documentation`: Documentation improvements
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention is needed
- `wontfix`: This will not be worked on
- `browser-chrome`: Chrome-specific issues
- `browser-firefox`: Firefox-specific issues
- `browser-edge`: Edge-specific issues
- `browser-safari`: Safari-specific issues

## Release Process

Our release process follows these steps:

1. **Version bump** in manifest files (for all browsers) and package.json
2. **Create a release branch**: `release/vX.Y.Z`
3. **Final testing** on the release branch in all supported browsers
4. **Generate production builds** for all browsers:
   ```bash
   npm run build
   ```
5. **Create release packages**:
   ```bash
   npm run release
   ```
6. **Create a GitHub release** with the version tag and release notes
7. **Submit to browser stores** (Chrome Web Store, Firefox Add-ons, Microsoft Edge Add-ons)

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible API changes
- **MINOR** version for new features in a backward-compatible manner
- **PATCH** version for backward-compatible bug fixes

## Chrome Web Store Compliance

When working on the codebase, be aware that Chrome Web Store has strict requirements for code readability:

- **No Obfuscation**: Code must not be intentionally obfuscated or made difficult to review
- **Minification Only**: Standard minification (removing whitespace, shortening variable names) is allowed
- **Keep Function Names**: Function and class names should be preserved for readability

Our build process is configured to comply with these requirements. Do not add code obfuscation to the build process.

## Thank You!

Your contributions help make Open Headers better for everyone. We appreciate your time and effort!
