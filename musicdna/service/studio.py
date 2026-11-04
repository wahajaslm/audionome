"""Music DNA — Python Research Studio APIRouter (/studio).

Provides endpoints for interactive deep research exploration, time-frequency spectrograms,
dynamic emotion trajectories, and favorite passage inspection.
All domain computation is delegated to ResearchStudioService and SpectralVisualizer.
"""
from __future__ import annotations
from pathlib import Path
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from musicdna.service.studio_service import ResearchStudioService, _DEFAULT_STUDIO_SERVICE, DEMO_WAV
from musicdna.features.spectral import N_PLOT_BINS, N_MEL_BANDS

router = APIRouter()


def get_studio_service() -> ResearchStudioService:
    """Dependency provider for ResearchStudioService."""
    return _DEFAULT_STUDIO_SERVICE


class PassageEvalRequest(BaseModel):
    analysis: dict[str, Any]
    startSec: float = 0.0
    endSec: float = 12.0
    note: str = ''
    qualities: list[str] = Field(default_factory=list)


@router.get('/api/studio/demo')
def analyze_builtin_demo(
    studio_service: ResearchStudioService = Depends(get_studio_service)
) -> dict[str, Any]:
    """Retrieves full analysis and visualization bundle for the built-in demo track."""
    return studio_service.get_demo_bundle()


@router.get('/api/studio/track/{track_id}')
def load_studio_track(
    track_id: str,
    studio_service: ResearchStudioService = Depends(get_studio_service)
) -> dict[str, Any]:
    """Retrieves analysis and visualization bundle for a user-analyzed track."""
    try:
        return studio_service.get_track_bundle(track_id)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post('/api/studio/inspect-passage')
def inspect_passage(
    request: PassageEvalRequest,
    studio_service: ResearchStudioService = Depends(get_studio_service)
) -> dict[str, Any]:
    """Computes acoustic contrast and active learning question prompts for a chosen passage."""
    return studio_service.inspect_passage(
        analysis=request.analysis,
        start_sec=request.startSec,
        end_sec=request.endSec,
        note=request.note,
        qualities=request.qualities,
    )


@router.api_route('/studio', methods=['GET', 'HEAD'], response_class=HTMLResponse)
def studio_page(
    studio_service: ResearchStudioService = Depends(get_studio_service)
) -> HTMLResponse:
    """Renders the standalone Music DNA Research Studio web interface."""
    return HTMLResponse(
        content=studio_service.get_studio_html(),
        headers={'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'}
    )


__all__ = [
    'router',
    'studio_page',
    'analyze_builtin_demo',
    'load_studio_track',
    'inspect_passage',
    'PassageEvalRequest',
    'DEMO_WAV',
    'N_PLOT_BINS',
    'N_MEL_BANDS',
]
