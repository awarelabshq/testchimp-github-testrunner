#!/bin/bash

# Sync script to copy runner-core changes to testchimp-github-testrunner
# Usage: ./sync-runner-core.sh [path-to-runner-core]

set -e

# Default path to runner-core
RUNNER_CORE_PATH="${1:-/Users/nuwansam/IdeaProjects/AwareRepo/local/runner-core}"

echo "🔄 Syncing runner-core from: $RUNNER_CORE_PATH"

# Check if runner-core path exists
if [ ! -d "$RUNNER_CORE_PATH" ]; then
    echo "❌ Error: runner-core directory not found at $RUNNER_CORE_PATH"
    echo "Usage: ./sync-runner-core.sh [path-to-runner-core]"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "action.yml" ]; then
    echo "❌ Error: Please run this script from the testchimp-github-testrunner directory"
    exit 1
fi

echo "📁 Copying source files from runner-core..."

# Copy source files (excluding dist, node_modules, etc.)
rsync -av --delete \
    --exclude='dist/' \
    --exclude='node_modules/' \
    --exclude='.git/' \
    --exclude='*.log' \
    --exclude='.DS_Store' \
    --exclude='env*' \
    --exclude='package*.json' \
    --exclude='tsconfig.json' \
    --exclude='*.md' \
    "$RUNNER_CORE_PATH/src/" "src/core/"

# Preserve the core index.ts file (don't overwrite it)
if [ -f "src/core/index.ts" ]; then
    echo "📝 Preserving existing src/core/index.ts"
    mv "src/core/index.ts" "src/core/index.ts.backup"
    rsync -av "$RUNNER_CORE_PATH/src/index.ts" "src/core/"
    mv "src/core/index.ts.backup" "src/core/index.ts"
fi

echo "✅ Source files synced successfully!"

# Show what changed
echo "📊 Changes made:"
git status --porcelain

echo ""
echo "🚀 Next steps:"
echo "1. Review the changes: git diff"
echo "2. Test the action locally if needed"
echo "3. Commit and push: git add . && git commit -m 'sync: Update runner-core code' && git push"
echo "4. Create new release tag if needed: git tag v1.0.9 && git push origin v1.0.9"
