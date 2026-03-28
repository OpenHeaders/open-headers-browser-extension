# Production & Beta Releases

## Overview

OpenHeaders Browser Extension uses GitHub Releases for distribution. The release type is determined entirely by the git tag format — the CI pipeline handles everything else.

## Tag Naming Convention

| Tag | Release type | GitHub Release |
|-----|-------------|----------------|
| `v4.0.0` | Production | Published release |
| `v4.1.0-beta.1` | Beta | Published prerelease |

Tags must follow [semver 2.0.0](https://semver.org/) with a `v` prefix. All beta releases use the `beta` suffix — there is no separate alpha or RC suffix.

## Creating a Production Release

```bash
# 1. Ensure main is up to date
git checkout main
git pull

# 2. Tag the release
git tag v4.0.0

# 3. Push the tag — CI builds and publishes automatically
git push origin v4.0.0
```

CI will:
- Build extensions for all browsers (Chrome, Firefox, Edge, Safari)
- Package each as a zip file
- Create a published GitHub release with all artifacts

## Creating a Beta Release

```bash
# First beta
git tag v4.1.0-beta.1
git push origin v4.1.0-beta.1

# Second beta if needed
git tag v4.1.0-beta.2
git push origin v4.1.0-beta.2
```

CI will:
- Build extensions for all browsers (same artifacts as production)
- Create a **published prerelease** on GitHub

## Production vs Beta Builds

Beta builds produce identical artifacts to production — same browsers, same formats. The only difference is the GitHub release is marked as a prerelease:

| | Production | Beta |
|---|---|---|
| Chrome | ✓ | ✓ |
| Firefox | ✓ | ✓ |
| Edge | ✓ | ✓ |
| Safari | ✓ | ✓ |
| GitHub Release | Published release | Published prerelease |

## Versioning Scheme

Browser stores require numeric-only `version` fields in manifest.json. The CI pipeline maintains two version representations:

| Git tag | Manifest `version` | `__APP_VERSION__` (UI) | Zip filename |
|---|---|---|---|
| `v4.0.0` | `4.0.0` | `4.0.0` | `*-v4.0.0.zip` |
| `v4.0.0-beta.1` | `4.0.0.1` | `4.0.0-beta.1` | `*-v4.0.0-beta.1.zip` |
| `v4.0.0-beta.2` | `4.0.0.2` | `4.0.0-beta.2` | `*-v4.0.0-beta.2.zip` |

- **Manifest version**: Numeric only (3 components for production, 4th component = beta number for betas). Visible in `chrome://extensions`, `about:addons`, etc.
- **`__APP_VERSION__`**: Full semver from `package.json`. Displayed in the extension popup footer.
- **Zip filename**: Full semver for clear identification in GitHub releases.

This makes production and beta builds distinguishable in the browser's extension management page without breaking store compatibility.

## Version Progression Example

Typical release cycle:

```
v4.0.0          ← current production
v4.1.0-beta.1   ← early testing
v4.1.0-beta.2   ← bug fixes from feedback
v4.1.0           ← production release
```

## Tagging from a Branch

You can tag from any branch — CI triggers on any `v*` tag push regardless of branch:

```bash
# Tag a beta from a feature branch
git checkout refactor/some-feature
git tag v4.1.0-beta.1
git push origin v4.1.0-beta.1
```

## Deleting a Bad Release

If a beta has issues:

1. Delete the GitHub release (stops new downloads)
2. Delete the git tag: `git push origin :refs/tags/v4.1.0-beta.1`
3. Users who already downloaded it keep that version
