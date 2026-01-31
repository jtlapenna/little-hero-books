#!/usr/bin/env bash
# Merge current branch (d2c-phase-0) into main and push.
# Use this when you want to bring all 2B/sync/repair/sibling fixes into main
# and then start a fresh branch for continued D2C work.
#
# Run from repo root: bash scripts/merge-d2c-phase-0-to-main.sh

set -e

BRANCH=$(git branch --show-current)
echo "Current branch: $BRANCH"

if [ -n "$(git status --porcelain)" ]; then
  echo "You have uncommitted changes. Commit or stash them first, then run this script again."
  exit 1
fi

echo "Fetching latest from origin..."
git fetch origin

echo "Checking out main and pulling..."
git checkout main
git pull origin main

echo "Merging $BRANCH into main..."
git merge "$BRANCH" -m "Merge $BRANCH into main: 2B manifest repair/sync, R2 pose parsing, sibling order script, docs"

echo "Pushing main..."
git push origin main

echo "Done. main is updated. You can:"
echo "  - Stay on main and create a new branch for D2C later: git checkout -b d2c-phase-0-continued"
echo "  - Or switch back to $BRANCH: git checkout $BRANCH"
