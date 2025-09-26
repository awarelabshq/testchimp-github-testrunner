# Syncing Runner Core Code

This GitHub Action includes a copy of the `runner-core` source code in `src/core/`. When you make changes to the `runner-core` repository, you need to sync those changes to this action.

## Manual Sync Process

### 1. Run the Sync Script

```bash
# From the testchimp-github-testrunner directory
./sync-runner-core.sh [path-to-runner-core]

# Example:
./sync-runner-core.sh /Users/nuwansam/IdeaProjects/AwareRepo/local/runner-core
```

### 2. Review Changes

```bash
git diff
```

### 3. Test the Action (Optional)

Test locally if needed to ensure everything works.

### 4. Commit and Deploy

```bash
git add .
git commit -m "sync: Update runner-core code"
git push

# If you need a new release:
git tag v1.0.9
git push origin v1.0.9
```

## What Gets Synced

The sync script copies:
- ✅ All source files from `runner-core/src/` to `src/core/`
- ✅ Excludes build artifacts (`dist/`, `node_modules/`, etc.)
- ✅ Excludes configuration files (`package.json`, `tsconfig.json`, etc.)

## When to Sync

Sync when you make changes to:
- Core functionality in `runner-core`
- Bug fixes
- New features
- API changes

## Important Notes

- Always test the action after syncing
- The action uses the synced code directly (no bundling)
- Keep the `src/core/index.ts` file for proper exports
