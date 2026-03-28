# Releases & Pre-releases

## Overview

OpenHeaders Browser Extension uses GitHub Releases for distribution. The release type is determined entirely by the git tag format — the CI pipeline handles everything else.

## Tag Naming Convention

| Tag | Release type | GitHub Release |
|-----|-------------|----------------|
| `v4.0.0` | Stable | Published release |
| `v4.1.0-rc.1` | Release Candidate | Published prerelease |
| `v4.1.0-beta.1` | Beta | Published prerelease |
| `v4.1.0-alpha.1` | Alpha | Published prerelease |

Tags must follow [semver 2.0.0](https://semver.org/) with a `v` prefix.

## Creating a Stable Release

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

## Creating a Pre-release

```bash
# Release candidate
git tag v4.1.0-rc.1
git push origin v4.1.0-rc.1

# Second RC if needed
git tag v4.1.0-rc.2
git push origin v4.1.0-rc.2

# Beta (less stable than RC)
git tag v4.1.0-beta.1
git push origin v4.1.0-beta.1
```

CI will:
- Build extensions for all browsers (same artifacts as stable)
- Create a **published prerelease** on GitHub

## Tagging from a Branch

You can tag from any branch — CI triggers on any `v*` tag push regardless of branch:

```bash
# Tag a pre-release from a feature branch
git checkout refactor/some-feature
git tag v4.1.0-rc.1
git push origin v4.1.0-rc.1
```

## Version Progression Example

Typical release cycle:

```
v4.0.0          ← current stable
v4.1.0-beta.1   ← early testing
v4.1.0-beta.2   ← bug fixes from beta feedback
v4.1.0-rc.1     ← feature-complete, final testing
v4.1.0-rc.2     ← last-minute fix
v4.1.0          ← stable release
```

## Deleting a Bad Release

If a pre-release has issues:

1. Delete the GitHub release (stops new downloads)
2. Delete the git tag: `git push origin :refs/tags/v4.1.0-rc.1`
3. Users who already downloaded it keep that version
