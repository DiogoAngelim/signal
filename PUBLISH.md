# Publishing Signal to npm

## Prerequisites

1. **npm Account** - Create one at [npmjs.com](https://npmjs.com) if you don't have one
2. **Node.js** - Version 18+ installed
3. **Git** - Repository initialized and committed

## Pre-Publishing Checklist

- [ ] All tests passing: `npm run test`
- [ ] Code builds successfully: `npm run build`
- [ ] Type checking passes: `npm run type-check`
- [ ] Coverage meets standards: `npm run test:coverage`
- [ ] CHANGELOG.md updated with version changes
- [ ] README.md up to date
- [ ] Git repository clean (no uncommitted changes)

## Step-by-Step Publishing Guide

### 1. Verify Everything Works

```bash
# Run all checks
npm run test
npm run type-check
npm run build
npm run test:coverage
```

### 2. Update Version Number

Choose a version following [Semantic Versioning](https://semver.org/):
- **MAJOR** (1.0.0) - Breaking changes
- **MINOR** (1.1.0) - New features, backwards compatible
- **PATCH** (1.0.1) - Bug fixes

```bash
npm version patch
# or
npm version minor
# or
npm version major
```

This will:
- Update `package.json` version
- Create a git tag
- Automatically run the `prepare` script (builds the project)

### 3. Review Changes

```bash
# Check what npm will publish
npm pack --dry-run

# Or list the files
npm pack --dry-run --json
```

### 4. Login to npm

```bash
npm login
```

Enter your npm credentials when prompted.

Verify you're logged in:
```bash
npm whoami
```

### 5. Publish to npm

```bash
# Publish to public registry
npm publish

# Or for scoped package (recommended for @signal/core)
npm publish --access public
```

### 6. Verify Publication

```bash
# Check package on npm registry
npm view @signal/core

# Or visit: https://www.npmjs.com/package/@signal/core
```

### 7. Push to Git

```bash
git push origin main
git push origin --tags
```

## Publishing Different Versions

### Pre-release (Beta, RC, etc.)

```bash
npm version prerelease --preid=beta
npm publish --tag beta
```

### Specific Tag

```bash
npm publish --tag next
```

## Troubleshooting

### Package Already Exists

If version already published:
```bash
npm version minor  # Bump version
npm publish
```

### Authentication Issues

```bash
# Clear npm cache
npm cache clean --force

# Re-login
npm logout
npm login
```

### Check What Will Be Published

```bash
# See all files that will be included
npm pack --dry-run
```

The `files` field in `package.json` controls what gets published:
- `dist/` - Compiled JavaScript
- `README.md` - Documentation
- `LICENSE` - License file

## Post-Publishing

1. **Create GitHub Release**
   - Go to GitHub Releases
   - Create release from the new tag
   - Add changelog notes

2. **Announce Publication**
   - Tweet/announce the new version
   - Update documentation links

3. **Update Dependent Projects**
   - Update projects that depend on Signal
   - Run `npm update @signal/core`

## Security Best Practices

- Use **npm 2FA** - Enable two-factor authentication
- Use **automation tokens** - For CI/CD pipelines
- **Never commit** `.npmrc` with credentials
- Use **lockfiles** - Ensure reproducible installs

## CI/CD Publishing (GitHub Actions Example)

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run test
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## References

- [npm CLI Documentation](https://docs.npmjs.com/cli)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
