#!/usr/bin/env bash
# Option 2: Push only the multi-item CSV + sibling-order changes to main.
# Keeps all other branch work on your current branch.
#
# Run from repo root: bash scripts/push-multi-item-to-main.sh

set -e

BRANCH=$(git branch --show-current)
echo "Current branch: $BRANCH"

# Ensure working tree is clean (commit or stash first)
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "You have uncommitted changes. Commit or stash them first, then run this script again."
  exit 1
fi

echo "Fetching and switching to main..."
git fetch origin
git checkout main
git pull origin main

echo "Creating temporary branch main-multi-item-csv..."
git checkout -b main-multi-item-csv

echo "Checking out only the multi-item files from $BRANCH..."
git checkout "$BRANCH" -- \
  back-end/src/lib/csv-upload-helpers.ts \
  back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts \
  back-end/scripts/create-sibling-order-from-line-item.ts

echo "Staging and committing..."
git add -A
git status
git commit -m "Multi-item orders: CSV parser groups by order-id and stores line_items; sibling-order script for second item"

echo "Merging into main and pushing..."
git checkout main
git merge main-multi-item-csv
git push origin main

echo "Removing temporary branch..."
git branch -d main-multi-item-csv

echo "Switching back to $BRANCH..."
git checkout "$BRANCH"

echo "Done. main has only the multi-item changes; $BRANCH is unchanged."
