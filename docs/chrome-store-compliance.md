# Chrome Web Store Compliance Guide

This document provides guidance on ensuring the Open Headers extension meets Chrome Web Store requirements.

## Code Readability Requirements

The Chrome Web Store has strict policies against code obfuscation. Your extension code must be human-readable, even in production builds.

### What is Not Allowed
- JavaScript obfuscation (like using `javascript-obfuscator`)
- Code that intentionally conceals functionality
- Deliberately making code difficult to review

### What is Allowed
- Standard minification (removing whitespace, shortening variable names)
- Bundling (combining files)
- Standard Terser/UglifyJS optimizations

## Build Process Compliance

The Open Headers build process has been specifically configured to comply with Chrome Web Store policies:

1. **Minification Without Obfuscation**
   - We use Terser for minimizing code size without obfuscation
   - Function names and class names are preserved
   - No string arrays, control flow flattening, or dead code injection

2. **Webpack Configuration**
   - Our webpack config in `config/webpack/webpack.common.js` includes Chrome-compliant settings
   - The TerserPlugin settings maintain code readability

3. **Build Scripts**
   - The `config/scripts/build-utils.js` handles post-build processing without obfuscation
   - The `config/scripts/release.js` creates compliant packages for submission

## Verifying Compliance

Before submitting to the Chrome Web Store, verify your build outputs:

1. Run a production build:
   ```bash
   npm run build:chrome
   ```

2. Verify the output files in `dist/chrome`:
   - Open `js/background/index.js` and `js/popup/index.js`
   - Confirm the code is minified but not obfuscated
   - Check that function names are still recognizable
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

## Chrome Web Store Submission Checklist

Use this checklist before submitting to the Chrome Web Store:

- [ ] Build with `npm run build:chrome`
- [ ] Check output files for readability
- [ ] Verify no obfuscation is present
- [ ] Create package with `npm run release`
- [ ] Test the packaged extension
- [ ] Complete all required store listing fields
- [ ] Provide clear screenshots and descriptions

## If Your Extension is Rejected

If your submission is rejected for code readability issues:

1. Review the specific code snippets mentioned in the rejection notice
2. Check your build process for any obfuscation steps
3. Verify the webpack configuration doesn't include obfuscation
4. Make necessary changes to comply with the requirements
5. Create a new build and resubmit

## Further Reading

- [Chrome Web Store Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies/)
- [Chrome Web Store Readability Requirements](https://developer.chrome.com/docs/webstore/program-policies/#code-readability)
