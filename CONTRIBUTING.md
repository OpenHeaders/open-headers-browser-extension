# Contributing to Open Headers

Thank you for your interest in contributing to Open Headers! This document provides guidelines and workflows to help you contribute effectively to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branching Strategy](#branching-strategy)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing Guidelines](#testing-guidelines)
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
   npm run build
   ```

6. **Load the extension in Chrome**:
   - Navigate to `chrome://extensions/`
   - Enable "Developer Mode"
   - Click "Load unpacked" and select the `dist` directory

## Development Workflow

1. **Create a new branch** for your work (see [Branching Strategy](#branching-strategy))
2. **Make your changes** to the codebase
3. **Run the build process** to ensure everything compiles:
   ```bash
   npm run build
   ```
4. **Test your changes** thoroughly
5. **Commit your changes** (see [Commit Message Guidelines](#commit-message-guidelines))
6. **Push your branch** to your fork
7. **Create a pull request** to the main repository

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

### Examples

```
feat: add multi-domain support to header entries

This change allows users to specify multiple domains for a single header entry.
The domains are displayed as tags in the UI and can be individually removed.

Closes #42
```

```
fix: correct dynamic value style after popup reopen

Prevents dynamic values from showing both missing source and update styles
when reopening the popup.
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

## Testing Guidelines

All contributions should include appropriate testing:

1. **Manual testing**:
   - Test your changes in Chrome with typical usage scenarios
   - Test with both static and dynamic headers
   - Test with multiple domains
   - Verify the UI behaves correctly

2. **Edge cases**:
   - Test with invalid header values
   - Test with missing or unavailable dynamic sources
   - Test with the companion app both connected and disconnected

3. **Compatibility**:
   - Test on different Chrome versions if possible
   - Test on different operating systems if possible

## Documentation

When adding features or making significant changes, please update the relevant documentation:

1. **Code comments**:
   - Use JSDoc format for function and class documentation
   - Explain complex logic or workarounds

2. **README.md**:
   - Update for new features or changed behaviors
   - Add examples for new functionality

3. **DEVELOPER.md**:
   - Update technical details for developers

## Issue Tracking

We use GitHub Issues to track bugs, enhancements, and feature requests.

### Creating Issues

- **Bug reports**: Include steps to reproduce, expected behavior, actual behavior, and your environment details
- **Feature requests**: Describe the feature, its benefits, and potential implementation approaches
- **Enhancement requests**: Explain what existing functionality should be improved and why

### Issue Labels

- `bug`: A problem with the extension
- `feature`: A new feature request
- `enhancement`: Improvement to existing functionality
- `documentation`: Documentation improvements
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention is needed
- `wontfix`: This will not be worked on

## Release Process

Our release process follows these steps:

1. **Version bump** in manifest.json and package.json
2. **Create a release branch**: `release/vX.Y.Z`
3. **Final testing** on the release branch
4. **Generate production build**:
   ```bash
   npm run build
   npm run obfuscate
   ```
5. **Create a GitHub release** with the version tag and release notes
6. **Submit to Chrome Web Store** if applicable

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible API changes
- **MINOR** version for new features in a backward-compatible manner
- **PATCH** version for backward-compatible bug fixes

## Thank You!

Your contributions help make Open Headers better for everyone. We appreciate your time and effort!
