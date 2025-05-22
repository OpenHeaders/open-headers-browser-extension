# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

```bash
# Install dependencies
npm install

# Start development build with watch mode (all browsers)
npm run dev

# Start development build with watch mode (specific browser)
npm run dev:chrome   # For Chrome
npm run dev:firefox  # For Firefox
npm run dev:edge     # For Edge
npm run dev:safari   # For Safari
```

### Building

```bash
# Build for all browsers
npm run build

# Build for specific browser
npm run build:chrome   # For Chrome
npm run build:firefox  # For Firefox
npm run build:edge     # For Edge
npm run build:safari   # For Safari

# Package Safari extension (macOS only)
npm run safari:convert   # Converts to Safari extension and creates Xcode project

# Create release packages for all browsers
npm run release
```

## Architecture Overview

Open Headers is a modern browser extension built with React 18 and Ant Design 5 for managing HTTP headers with static and dynamic sources. It works with a companion app to pull header values from HTTP requests, environment variables, and local files.

### Technology Stack

- **Frontend**: React 18 with functional components and hooks
- **UI Library**: Ant Design 5 with Apple-like minimalist design
- **Build System**: Webpack 5 with Babel for ES6+ and JSX compilation
- **State Management**: React Context API for global state
- **Cross-Browser Support**: Browser-specific webpack configurations

### Key Components

1. **React-based Popup UI** (`src/popup/`):
   - Modern React components with Ant Design 5
   - Context-based state management for header entries
   - Real-time connection status monitoring
   - Form validation and error handling

2. **React Welcome Page** (`src/welcome/`):
   - Multi-step onboarding with smooth transitions
   - Browser-specific setup instructions
   - Connection verification and status feedback
   - Apple-like minimalist design aesthetic

3. **Background Service Worker** (`src/background/`):
   - Maintains existing vanilla JS functionality
   - Connects to the companion app via WebSocket
   - Creates and updates HTTP header rules
   - Cross-browser compatibility layer

4. **Header Rule System** (`src/background/header-manager.js`): 
   - Creates and manages browser's declarativeNetRequest rules
   - Handles both request and response headers
   - Performs header validation and sanitization

5. **WebSocket Client** (`src/background/websocket.js`):
   - Connects to the companion app for dynamic sources
   - Manages connection status and reconnection logic
   - Browser-specific implementations for Firefox and Safari

### React Component Architecture

- **Context Providers**: Global state management using React Context
- **Custom Hooks**: Reusable logic for header management (`useHeader`)
- **Component Structure**:
  - `App.jsx` - Main application wrapper
  - `HeaderForm.jsx` - Form for adding/editing headers
  - `HeaderList.jsx` - List of saved header entries
  - `DomainTags.jsx` - Multi-domain input component
  - `ConnectionInfo.jsx` - Connection status and setup guidance

### State Management

Uses React Context API for:
- Header entries management
- Dynamic sources from companion app
- Connection status tracking
- Edit mode and form draft values
- Cross-component communication

### Styling and Design

- **Design System**: Apple-like minimalist aesthetic
- **Primary Color**: #4285F4 (Google Blue)
- **Typography**: SF Pro Text font family
- **Components**: Ant Design 5 with custom theming
- **Responsive**: Optimized for browser extension popup dimensions

### Data Flow

1. User configures headers through React components
2. React Context manages application state
3. Background service worker creates declarativeNetRequest rules
4. WebSocket connection receives dynamic source updates
5. React components re-render with updated data

## Project Structure

- `/src/`: React application source code
  - `/popup/`: React popup application
    - `/components/`: Reusable React components
    - `/styles/`: LESS stylesheets
    - `App.jsx`: Main popup application
    - `index.jsx`: React app entry point
  - `/welcome/`: React welcome page application
    - `/components/`: Welcome page components
    - `/styles/`: Welcome page styles
    - `WelcomeApp.jsx`: Main welcome application
    - `index.jsx`: Welcome app entry point
  - `/background/`: Background service worker (vanilla JS)
  - `/context/`: React Context providers
  - `/hooks/`: Custom React hooks
  - `/utils/`: Shared utility functions
  - `/assets/`: Static assets (images, etc.)

- `/manifests/`: Browser-specific manifest files
- `/config/`: Webpack configurations and build scripts

## Cross-Browser Considerations

The extension maintains compatibility across browsers:

- **React Frontend**: Consistent across all browsers
- **Webpack Builds**: Browser-specific configurations
- **Background Scripts**: Cross-browser compatibility layer
- **Ant Design**: Modern UI components that work across browsers

### Browser-Specific Features

- **Chrome/Edge**: Full React feature support
- **Firefox**: Enhanced WebSocket security handling
- **Safari**: WebKit-specific optimizations

## Development Guidelines

When working with this React-based extension:

1. **React Components**: Use functional components with hooks
2. **State Management**: Leverage React Context for global state
3. **Styling**: Use Ant Design components with custom LESS styles
4. **Browser APIs**: Use the browser-api.js compatibility layer
5. **Building**: Test across all browsers before releasing

The migration to React 18 + Ant Design 5 provides a modern, maintainable codebase with an Apple-like minimalist user experience while preserving all existing functionality.