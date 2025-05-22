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

### React Development Setup

Open Headers uses **React 18** with **Ant Design 5** for the frontend UI. Before contributing:

1. **Familiarize yourself with the tech stack**:
   - React 18 with functional components and hooks
   - Ant Design 5 components and theming
   - React Context API for state management
   - LESS for styling with CSS custom properties

2. **Understand the architecture**:
   - React components in `src/popup/components/`
   - Global state management via React Context
   - Custom hooks for reusable logic
   - Apple-like minimalist design system

### Workflow Steps

1. **Create a new branch** for your work (see [Branching Strategy](#branching-strategy))
2. **Make your changes** to the codebase:
   - For UI changes: Work in `src/popup/components/`
   - For state management: Update `src/context/HeaderContext.jsx`
   - For styling: Modify `src/popup/styles/popup.less`
   - For background logic: Work in `src/background/`
3. **Run the build process** for the browsers you're targeting:
   ```bash
   npm run build:chrome    # For Chrome
   npm run build:firefox   # For Firefox
   npm run build:edge      # For Edge
   npm run build:safari    # For Safari
   ```
4. **Test your changes** in each targeted browser
5. **Test React components** using React DevTools
6. **Commit your changes** (see [Commit Message Guidelines](#commit-message-guidelines))
7. **Push your branch** to your fork
8. **Create a pull request** to the main repository

### React Development Guidelines

#### Component Development
- **Use functional components** with hooks exclusively
- **Follow Ant Design patterns** for consistent UI/UX
- **Implement proper prop types** and default values
- **Use React.memo** for performance optimization where needed
- **Keep components focused** on a single responsibility

#### State Management
- **Use React Context** for truly global state (headers, connection status)
- **Keep local state** for component-specific UI interactions
- **Use custom hooks** to encapsulate complex logic
- **Handle errors gracefully** with proper error boundaries

#### Styling Guidelines
- **Use Ant Design components** as the foundation
- **Follow the Apple-like design system** (clean, minimalist)
- **Use LESS variables** and CSS custom properties for theming
- **Maintain responsive design** for popup constraints (400px width)
- **Follow consistent spacing** and typography scales

#### Code Examples

**Creating a new component:**
```jsx
import React from 'react';
import { Button, Form, Input } from 'antd';

const MyComponent = ({ onSave, initialValue = '' }) => {
  const [form] = Form.useForm();
  
  const handleFinish = (values) => {
    onSave(values);
    form.resetFields();
  };
  
  return (
    <Form form={form} onFinish={handleFinish} layout="vertical">
      <Form.Item name="value" initialValue={initialValue}>
        <Input placeholder="Enter value" />
      </Form.Item>
      <Button type="primary" htmlType="submit">
        Save
      </Button>
    </Form>
  );
};

export default React.memo(MyComponent);
```

**Using React Context:**
```jsx
import React, { useContext } from 'react';
import { HeaderContext } from '../context/HeaderContext';

const MyComponent = () => {
  const { headers, addHeader, connectionStatus } = useContext(HeaderContext);
  
  // Component logic here
  
  return (
    // JSX here
  );
};
```

## Project Structure

Please familiarize yourself with our React-based project structure:

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

All contributions should be tested across supported browsers, with special attention to React component behavior:

### Required Testing

1. **Chrome Testing**:
   - Load the extension in Chrome using Developer Mode
   - Open React DevTools to inspect component tree and state
   - Test all affected React components and interactions
   - Verify header injection works correctly
   - Check console for React warnings or errors
   - Test Ant Design component behavior

2. **Firefox Testing**:
   - Load the extension as a temporary add-on
   - Verify React components render properly
   - Test WebSocket connection integration with React state
   - Test header injection with different resource types
   - Check for any security-related console warnings
   - Verify Ant Design components work in Firefox

3. **Edge Testing**:
   - Similar to Chrome testing
   - Verify React compatibility with Edge's extension model
   - Test Ant Design component rendering

### Recommended Testing (if possible)

4. **Safari Testing** (if macOS is available):
   - Build and convert for Safari
   - Test React components in WebKit environment
   - Verify Ant Design compatibility with Safari
   - Test using Xcode and Safari extension tools

### React-Specific Testing

- **Component Rendering**: Verify all React components render correctly
- **State Management**: Test React Context state updates and synchronization
- **Form Validation**: Test Ant Design form validation and error handling
- **Real-time Updates**: Verify WebSocket data updates React components properly
- **Performance**: Check React component re-rendering performance
- **Error Boundaries**: Test error handling in React components

### Testing Focus Areas

- **WebSocket Connection**: Ensure it works in all browsers and updates React state
- **Header Injection**: Check headers work for different resource types
- **UI Consistency**: Verify Ant Design styling is consistent across browsers
- **Storage**: Confirm settings persist between sessions and sync with React state
- **Performance**: Check for any browser-specific React performance issues
- **Form Interactions**: Test all Ant Design form components and validation

### Using React Developer Tools

1. Install React Developer Tools extension in your browser
2. Load the Open Headers extension
3. Open the popup and then React DevTools
4. Navigate to Components tab to inspect:
   - Component tree structure
   - Props and state values
   - Context provider data
   - Component re-renders and performance

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
