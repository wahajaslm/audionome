#!/bin/bash
# Script to download source video and prebuffered audio from YouTube
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCES_DIR="$SCRIPT_DIR/../sources"
mkdir -p "$SOURCES_DIR"

YT_URL="https://www.youtube.com/watch?v=7SDrjwtfKMk"

echo "=== Downloading 21-second video clip (00:56 to 01:17) ==="
yt-dlp -o - "$YT_URL" | ffmpeg -y -i pipe:0 -ss 56 -t 21 -c:v libx264 -preset fast -crf 18 -c:a aac "$SOURCES_DIR/chaap_tilak_clip_56_77.mp4"

echo "=== Downloading 42-second prebuffered PCM audio (00:40 to 01:22) ==="
yt-dlp -o - "$YT_URL" | ffmpeg -y -i pipe:0 -ss 40 -t 42 -vn -c:a pcm_s16le "$SOURCES_DIR/chaap_tilak_prebuffered_56_77.wav"

echo "=== Done! Sources saved to $SOURCES_DIR ==="

