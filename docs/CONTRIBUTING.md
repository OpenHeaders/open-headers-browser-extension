# Contributing to Open Headers

Thank you for your interest in contributing to Open Headers! This document provides comprehensive guidelines for contributing to our React-based browser extension.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Architecture Overview](#architecture-overview)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Release Process](#release-process)

## 📜 Code of Conduct

We are committed to providing a welcoming and inclusive environment. All contributors are expected to:

- Be respectful and considerate
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members

## 🚀 Getting Started

### Prerequisites

Before contributing, ensure you have:

- Node.js 16.0+ and npm 8.0+
- Git configured with your GitHub account
- A code editor with React and JSX support (VS Code recommended)
- React Developer Tools browser extension
- Basic knowledge of React 18, Hooks, and Ant Design

### Setting Up Your Development Environment

1. **Fork the repository**
   ```bash
   # Visit https://github.com/OpenHeaders/open-headers-browser-extension
   # Click "Fork" button
   ```

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/open-headers-browser-extension.git
   cd open-headers-browser-extension
   ```

3. **Add upstream remote**
   ```bash
   git remote add upstream https://github.com/OpenHeaders/open-headers-browser-extension.git
   ```

4. **Install dependencies**
   ```bash
   npm install
   ```

5. **Start development**
   ```bash
   npm run dev:chrome  # Or your target browser
   ```

## 💻 Development Workflow

### Understanding the Architecture

Open Headers uses a modern React architecture:

- **React 18** with functional components and hooks
- **Ant Design 5** for UI components
- **React Context** for state management
- **LESS** for styling with CSS variables
- **Webpack 5** for building

### Key Development Areas

#### 1. React Components (`src/popup/components/`)

When working on UI components:

```jsx
// Example component structure
import React, { useState, useEffect } from 'react';
import { Button, Form, Input } from 'antd';
import { useHeader } from '../../hooks/useHeader';

const MyNewComponent = ({ prop1, prop2 }) => {
  const { headerEntries, saveHeaderEntry } = useHeader();
  const [localState, setLocalState] = useState('');

  useEffect(() => {
    // Side effects
  }, [dependencies]);

  return (
    <div className="my-component">
      {/* Component JSX */}
    </div>
  );
};

export default React.memo(MyNewComponent);
```

#### 2. State Management (`src/context/`)

For global state changes:

```jsx
// In HeaderContext.jsx
const newFeature = useCallback((params) => {
  // Implementation
  storage.sync.set({ savedData: updatedData }, () => {
    setHeaderEntries(updatedData);
  });
}, [dependencies]);
```

#### 3. Background Scripts (`src/background/`)

Background scripts remain vanilla JavaScript for compatibility:

```javascript
// Maintain cross-browser compatibility
const handleNewFeature = (data) => {
  // Use browser-api.js wrappers
  storage.sync.get(['savedData'], (result) => {
    // Implementation
  });
};
```

### Branch Naming Convention

- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates
- `style/description` - UI/styling changes
- `perf/description` - Performance improvements
- `test/description` - Test additions/changes

Examples:
- `feature/bulk-import`
- `fix/domain-validation`
- `refactor/header-context`
- `docs/api-examples`

## 🎨 Coding Standards

### React/JSX Guidelines

1. **Component Structure**
   ```jsx
   // 1. Imports (grouped and ordered)
   import React, { useState, useEffect } from 'react';
   import { Button, Input } from 'antd';
   import { InfoCircleOutlined } from '@ant-design/icons';
   import { useHeader } from '../../hooks/useHeader';
   import './styles.less';

   // 2. Component definition
   const ComponentName = ({ prop1, prop2 }) => {
     // 3. Hooks
     const [state, setState] = useState();
     const { contextValue } = useHeader();

     // 4. Effects
     useEffect(() => {}, []);

     // 5. Handlers
     const handleClick = () => {};

     // 6. Render
     return <div>...</div>;
   };

   // 7. Export
   export default ComponentName;
   ```

2. **Hooks Rules**
    - Always use hooks at the top level
    - Never call hooks inside conditions or loops
    - Custom hooks must start with 'use'

3. **Props and State**
    - Use destructuring for props
    - Provide PropTypes or TypeScript types
    - Initialize state with meaningful defaults

### Ant Design Usage

1. **Import only what you need**
   ```jsx
   // Good
   import { Button, Input, Form } from 'antd';

   // Avoid
   import * as antd from 'antd';
   ```

2. **Follow Ant Design patterns**
   ```jsx
   // Form handling
   const [form] = Form.useForm();
   
   // Message API
   const { message } = App.useApp();
   ```

3. **Maintain consistent sizing**
    - Use `size="small"` for popup constraints
    - Keep consistent spacing with Space component

### Styling Guidelines

1. **LESS Structure**
   ```less
   // Variables
   @primary-color: #1677ff;
   
   // Component styles
   .header-form {
     &-title {
       font-size: 14px;
       font-weight: 600;
     }
     
     &-content {
       padding: 12px;
     }
   }
   ```

2. **CSS Variables for Theming**
   ```less
   .my-component {
     color: var(--text-primary);
     background: var(--bg-secondary);
   }
   ```

3. **Responsive Design**
    - Design for 400px width (extension popup)
    - Test with different zoom levels

### Code Quality Standards

1. **Error Handling**
   ```jsx
   try {
     await riskyOperation();
   } catch (error) {
     console.error('Descriptive error:', error);
     message.error('User-friendly error message');
   }
   ```

2. **Performance**
    - Use React.memo for expensive components
    - Implement proper key props in lists
    - Debounce expensive operations

3. **Accessibility**
    - Add proper ARIA labels
    - Ensure keyboard navigation
    - Maintain color contrast ratios

## 🧪 Testing Guidelines

### Manual Testing Checklist

Before submitting a PR, test:

1. **Functionality**
    - [ ] Add new header (static and dynamic)
    - [ ] Edit existing header
    - [ ] Delete header
    - [ ] Enable/disable header
    - [ ] Domain pattern validation
    - [ ] Import/export configuration

2. **UI/UX**
    - [ ] All form validations work
    - [ ] Error messages are clear
    - [ ] Loading states display correctly
    - [ ] Theme switching works
    - [ ] Responsive layout maintained

3. **Cross-Browser**
    - [ ] Chrome/Edge functionality
    - [ ] Firefox with certificate acceptance
    - [ ] Safari (if on macOS)
    - [ ] Import/export in each browser

4. **Edge Cases**
    - [ ] Empty states
    - [ ] Maximum input lengths
    - [ ] Special characters in inputs
    - [ ] Offline companion app
    - [ ] Invalid import files

### React DevTools Testing

1. **Component Inspection**
    - Check component hierarchy
    - Verify prop passing
    - Monitor state updates

2. **Performance**
    - Look for unnecessary re-renders
    - Check component render times
    - Verify memo effectiveness

## 🔄 Pull Request Process

### Before Creating a PR

1. **Update your fork**
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature
   ```

3. **Make your changes**
    - Follow coding standards
    - Add/update documentation
    - Test thoroughly

4. **Commit with meaningful messages**
   ```bash
   git commit -m "feat: add bulk import functionality

   - Add file upload component
   - Implement JSON parsing logic
   - Add validation for imported data
   - Update documentation

   Closes #123"
   ```

### Commit Message Format

```
type(scope): subject

body

footer
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code restructuring
- `perf`: Performance improvements
- `test`: Test additions
- `chore`: Maintenance tasks

**Examples:**
```bash
feat(popup): add domain conflict detection
fix(background): resolve WebSocket reconnection issue
docs(readme): update installation instructions
style(components): apply consistent spacing
refactor(context): simplify state management
perf(table): optimize large dataset rendering
```

### Creating the Pull Request

1. **Push your branch**
   ```bash
   git push origin feature/your-feature
   ```

2. **Open PR on GitHub**
    - Use the PR template
    - Link related issues
    - Add screenshots for UI changes
    - List testing performed

3. **PR Description Template**
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Testing
   - [ ] Chrome tested
   - [ ] Firefox tested
   - [ ] Edge tested
   - [ ] Safari tested (if applicable)

   ## Screenshots
   (If applicable)

   ## Checklist
   - [ ] Code follows style guidelines
   - [ ] Self-review completed
   - [ ] Documentation updated
   - [ ] No console errors
   ```

### Code Review Process

1. **Respond to feedback promptly**
2. **Make requested changes**
3. **Re-test after changes**
4. **Update PR description if needed**

## 📝 Issue Guidelines

### Creating Issues

1. **Search existing issues first**
2. **Use issue templates**
3. **Provide reproduction steps**
4. **Include environment details**

### Issue Templates

**Bug Report:**
```markdown
**Description**
Clear description of the bug

**Steps to Reproduce**
1. Go to...
2. Click on...
3. See error

**Expected Behavior**
What should happen

**Actual Behavior**
What actually happens

**Environment**
- Browser: Chrome 120
- OS: macOS 14.0
- Extension Version: 2.0.0

**Screenshots**
If applicable
```

**Feature Request:**
```markdown
**Problem**
Description of the problem

**Proposed Solution**
Your suggested solution

**Alternatives**
Other solutions considered

**Additional Context**
Any other information
```

## 🚀 Release Process

### Version Numbering

We follow Semantic Versioning (SemVer):
- **MAJOR.MINOR.PATCH** (e.g., 2.1.3)
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

### Release Steps

1. **Update version**
    - `package.json`
    - All `manifest.json` files

2. **Update documentation**
    - README.md changelog
    - Migration guide (if needed)

3. **Create release branch**
   ```bash
   git checkout -b release/v2.1.0
   ```

4. **Build and test**
   ```bash
   npm run build
   npm run release
   ```

5. **Create GitHub release**
    - Tag version
    - Add release notes
    - Upload build artifacts
   
## 📚 Resources

### Learning Resources
- [React Documentation](https://react.dev/)
- [Ant Design Components](https://ant.design/)
- [Chrome Extension Development](https://developer.chrome.com/docs/extensions/)
- [WebExtensions MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)

## 🙏 Thank You!

Your contributions make Open Headers better for everyone. We appreciate your time and effort in improving this project!

---

**Happy Contributing! 🎉**