# Chrome Web Store Compliance Guide

This document provides guidance on ensuring the Open Headers extension meets Chrome Web Store requirements.

## Code Readability Requirements

The Chrome Web Store has strict policies against code obfuscation. Your extension code must be human-readable, even in production builds.

### What is Not Allowed
- JavaScript obfuscation (like using `javascript-obfuscator`)
- Code that intentionally conceals functionality
- Deliberately making code difficult to review
- Control flow flattening, string encoding, dead code injection

### What is Allowed
- Standard minification (removing whitespace, shortening variable names)
- Bundling (combining files)
- Standard Terser/esbuild optimizations
- Preserving class and function names while shortening locals

## Build Process Compliance

The Open Headers build process uses **Vite** with **Terser** minification, specifically configured to comply with Chrome Web Store policies:

1. **Minification Without Obfuscation**
   - We use Terser with `keep_classnames: true` and `keep_fnames: true`
   - Variable names are shortened (compliant) but class/function names are preserved
   - No string arrays, control flow flattening, or dead code injection
   - Console statements are preserved for debugging support

2. **Vite Configuration**
   - Our Vite config in `vite.config.ts` includes Chrome-compliant Terser settings
   - The `chromeSafePlugin` replaces `new Function()` calls (CSP violation) with safe alternatives
   - Source map references are stripped from Chrome/Edge builds (Firefox gets inline sourcemaps for AMO review)

3. **Build Scripts**
   - `npm run build:chrome` — Production build for Chrome Web Store
   - `npm run build:edge` — Production build for Edge Add-ons
   - `npm run build:firefox` — Production build with inline sourcemaps for Firefox AMO
   - `npm run release` — Creates compliant packages for submission

4. **Content Security Policy**
   - Extension CSP in `manifests/chrome/manifest.json` allows `ws://127.0.0.1:59210` for the desktop app connection
   - No remote script loading, no `eval()`, no `new Function()`
   - `'unsafe-inline'` only for styles (required by Ant Design)

## Verifying Compliance

Before submitting to the Chrome Web Store, verify your build outputs:

1. Run a production build:
   ```bash
   npm run build:chrome
   ```

2. Verify the output files in `dist/chrome`:
   - Open `js/background/index.js` and `js/popup/index.js`
   - Confirm the code is minified but not obfuscated
   - Check that class and function names are still recognizable
   - Ensure there are no random variable names with strange patterns (like `_0x297e3d`)
   - Verify there are no encoded strings or unusual code patterns

3. Create a release package:
   ```bash
   npm run release
   ```

4. Test the built extension locally before submission

## Common Rejection Reasons

Be aware of these common reasons for Chrome Web Store rejections:

1. **Obfuscated Code**: Using obfuscation tools like javascript-obfuscator
2. **Minification That Obscures Intent**: Overly aggressive minification settings
3. **Hidden Functionality**: Code that conceals its true purpose
4. **Encoded Strings**: Using encoded or encrypted strings to hide content
5. **CSP Violations**: Using `eval()`, `new Function()`, or remote code loading

## Chrome Web Store Submission Checklist

Use this checklist before submitting to the Chrome Web Store:

- [ ] Build with `npm run build:chrome`
- [ ] Check output files for readability (class/function names preserved)
- [ ] Verify no obfuscation is present
- [ ] Verify `chromeSafePlugin` has removed `new Function()` patterns
- [ ] Create package with `npm run release`
- [ ] Test the packaged extension
- [ ] Complete all required store listing fields
- [ ] Provide clear screenshots and descriptions

## If Your Extension is Rejected

If your submission is rejected for code readability issues:

1. Review the specific code snippets mentioned in the rejection notice
2. Check the Vite/Terser configuration in `vite.config.ts`
3. Verify the `chromeSafePlugin` is running and patching CSP violations
4. If needed, set `minify: false` temporarily to produce fully unminified output for review
5. Create a new build and resubmit

## Further Reading

- [Chrome Web Store Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies/)
- [Chrome Web Store Readability Requirements](https://developer.chrome.com/docs/webstore/program-policies/#code-readability)
