#!/usr/bin/env bash
# Builds a clean copy of this repo for publishing, without copyrighted recordings or renders
# anywhere in its history. The working repo is not touched: the copy is a fresh clone.
# Usage: scripts/export_public.sh [target dir]   (default: ../music-dna-player-public)
set -euo pipefail
src="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$src/../music-dna-player-public}"
[ -e "$out" ] && { echo "Target exists: $out (remove it first)"; exit 1; }
git clone --quiet --no-local --single-branch --branch main "$src" "$out"
cd "$out"
git filter-repo --quiet --force --invert-paths \
  --path-glob 'public/*.mp3' \
  --path-glob 'public/Chaap-Tilak-*.wav' \
  --path public/videos/ \
  --path-glob 'chaap_tilak_visualizer/assets/*.mp4'
git remote remove origin 2>/dev/null || true
left="$(git log --all --name-only --format= | sort -u | grep -E '\.(mp3|mp4|m4a|flac|ogg|webm)$|Chaap-Tilak-.*\.wav' || true)"
[ -n "$left" ] && { echo "Media still in history:"; echo "$left"; exit 1; }
echo "Clean copy: $out ($(du -sh .git | cut -f1) of history)"
