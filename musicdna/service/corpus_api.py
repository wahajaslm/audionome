"""Song names for corpus audio, read from the local corpus manifests (no network).

TITLE FIX - songs that reached the player from the service or as '<video id>.m4a' files were
named by their YouTube id, e.g. 'FnDmg-cBVsA - Your library'. The corpus manifests already
know each id's song and artists, so the player asks here and renames them.
Example: GET /api/corpus/titles -> {"FnDmg-cBVsA": {"title": "Aamay Bhashaili Rey",
"artist": "Alamgir, Fariha Pervez"}, ...}
"""
from __future__ import annotations
from functools import lru_cache
from typing import Any

from fastapi import APIRouter

from musicdna.corpus.registry import CORPORA

router = APIRouter()


@lru_cache(maxsize=1)
def corpus_titles() -> dict[str, dict[str, str]]:
    """Every corpus entry by video id. A corpus without a manifest on disk is skipped."""
    titles: dict[str, dict[str, str]] = {}
    for corpus in CORPORA.values():
        if not corpus.manifest_path.exists():
            continue
        try:
            entries = corpus.load().entries
        except Exception:  # an unreadable manifest must not break the player
            continue
        for entry in entries:
            titles.setdefault(entry.video_id, {'title': entry.song, 'artist': entry.artists})
    return titles


@router.get('/api/corpus/titles')
def list_corpus_titles() -> dict[str, Any]:
    return corpus_titles()
