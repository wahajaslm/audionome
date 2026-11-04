"""Project locations shared by every layer, so no module derives paths from its own file position."""
from __future__ import annotations
from pathlib import Path

PROJECT_ROOT: Path = Path(__file__).resolve().parents[1]
PUBLIC_DIR: Path = PROJECT_ROOT / 'public'
DEMO_WAV: Path = PUBLIC_DIR / 'demo.wav'

# Local service state (not committed): SQLite analyses and uploaded/derived audio.
SERVICE_STATE_DIR: Path = PROJECT_ROOT / 'musicdna' / 'service'
DB_PATH: Path = SERVICE_STATE_DIR / 'music_dna.db'
AUDIO_CACHE_DIR: Path = SERVICE_STATE_DIR / 'audio_cache'

# Research data and outputs, relative to the project root.
CORPUS_DIR: Path = PROJECT_ROOT / 'data' / 'coke_studio'
RESEARCH_OUTPUT_DIR: Path = PROJECT_ROOT / 'research-output'
