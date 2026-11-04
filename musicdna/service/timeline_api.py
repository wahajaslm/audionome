"""HTTP routes for the player timeline (see musicdna.service.timeline_jobs)."""
from __future__ import annotations
from typing import Any

from fastapi import APIRouter, HTTPException

from musicdna.service.repository import AUDIO_CACHE_DIR
from musicdna.service.service import _DEFAULT_SERVICE
from musicdna.service.timeline_jobs import TimelineJobs

router = APIRouter()
JOBS = TimelineJobs(
    AUDIO_CACHE_DIR, _DEFAULT_SERVICE.find_cached_audio, _DEFAULT_SERVICE.stem_separator,
    max_duration_sec=_DEFAULT_SERVICE.feature_extractor.config.audio.max_duration_sec,
)


@router.get('/api/timeline/{track_id}')
def get_timeline(track_id: str) -> dict[str, Any]:
    """What is saved so far (quick and/or full tier) with the job status; 404 when never started."""
    data = JOBS.get(track_id)
    if data is None:
        raise HTTPException(404, f"No timeline for track '{track_id}' yet")
    return data


@router.post('/api/timeline/{track_id}')
def start_timeline(track_id: str, front: bool = True) -> dict[str, Any]:
    """Starts the timeline job, or moves it to the front of the line (the song being played)."""
    return {'trackId': track_id, 'status': JOBS.request(track_id, front=front)}
