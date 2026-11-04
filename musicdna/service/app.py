"""FastAPI application for Music DNA local intelligence services.

Provides REST endpoints for acoustic analysis, deep neural representations,
multimodal fusion, vector projection, stem streaming, and active preference research.
All heavy domain processing delegates to AudioIntelligenceService and AnalysisRepository.
"""
from __future__ import annotations
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any
import asyncio
import shutil
import librosa
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from musicdna.service.service import AudioIntelligenceService, _DEFAULT_SERVICE
from musicdna.service.repository import AnalysisRepository, _DEFAULT_REPOSITORY, AUDIO_CACHE_DIR
from musicdna.audio.io import load_audio
from musicdna.paths import PUBLIC_DIR
from musicdna.service.studio import router as studio_router, DEMO_WAV
from musicdna.service.streaming import (
    resolve_stream, create_proxy_stream_response, start_cache_download, wait_for_cache_download,
)
from musicdna.preference.emotion import DynamicEmotionModel

MAX_UPLOAD_BYTES: int = 200 * 1024 * 1024

def get_service() -> AudioIntelligenceService:
    return _DEFAULT_SERVICE

def get_repository() -> AnalysisRepository:
    return _DEFAULT_REPOSITORY

app = FastAPI(title='Music DNA Local Intelligence Service', version='0.5.0')
app.include_router(studio_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=['Content-Range', 'Content-Length', 'Accept-Ranges', 'Content-Type'],
)


# ============================================================================
# Pydantic Request & Response Schemas
# ============================================================================

class ResolveStreamRequest(BaseModel):
    url: str

class SaveAnalysisRequest(BaseModel):
    trackId: str
    title: str | None = None
    artist: str | None = None
    analysis: dict[str, Any]


class DeleteTrackRequest(BaseModel):
    trackId: str


class ProjectionRequest(BaseModel):
    modelId: str = Field(min_length=2, max_length=128)
    vectors: list[list[float]] = Field(min_length=3, max_length=500)


class ResearchContextRequest(BaseModel):
    analyses: list[dict[str, Any]] = Field(default_factory=list)
    moments: list[dict[str, Any]] = Field(default_factory=list)
    ratings: list[dict[str, Any]] = Field(default_factory=list)
    events: list[dict[str, Any]] = Field(default_factory=list)


# ============================================================================
# Health & Status Endpoints
# ============================================================================

@app.get('/api/health')
def get_health(service: AudioIntelligenceService = Depends(get_service)) -> dict[str, Any]:
    return service.get_service_health()


# ============================================================================
# Database & Persistence Endpoints
# ============================================================================

@app.get('/api/db/stats')
def get_database_stats(repository: AnalysisRepository = Depends(get_repository)) -> dict[str, int]:
    return repository.get_database_statistics()


@app.get('/api/db/analyses')
def list_track_analyses(
    track_id: str | None = None,
    method: str | None = None,
    repository: AnalysisRepository = Depends(get_repository)
) -> list[dict[str, Any]]:
    return repository.get_analyses(track_id=track_id, method=method)


@app.post('/api/db/save')
def persist_analysis(
    request: SaveAnalysisRequest,
    repository: AnalysisRepository = Depends(get_repository)
) -> dict[str, Any]:
    row_id = repository.save_analysis(
        request.trackId, request.analysis, title=request.title, artist=request.artist
    )
    return {'status': 'saved', 'rowId': row_id, 'stats': repository.get_database_statistics()}


@app.post('/api/db/delete')
def remove_track_analyses(
    payload: dict[str, str],
    repository: AnalysisRepository = Depends(get_repository)
) -> dict[str, Any]:
    track_id = payload.get('trackId', '')
    if track_id:
        repository.delete_track_analyses(track_id)
    return {'status': 'deleted', 'stats': repository.get_database_statistics()}


# ============================================================================
# Audio File Caching & Media Streaming
# ============================================================================

@app.post('/api/audio/cache')
async def cache_audio(
    file: UploadFile = File(...),
    track_id: str = Form(''),
    track_title: str = Form(''),
    service: AudioIntelligenceService = Depends(get_service)
) -> dict[str, Any]:
    if not track_id:
        raise HTTPException(400, 'Missing track_id parameter')

    audio_bytes = await file.read()
    service.cache_uploaded_audio(
        audio_bytes=audio_bytes,
        track_id=track_id,
        filename=file.filename or f'{track_id}.wav',
        content_type=file.content_type or 'audio/wav',
        track_title=track_title,
    )
    return {'status': 'cached', 'trackId': track_id}


@app.get('/api/audio/{track_id}')
def serve_cached_audio(
    track_id: str,
    service: AudioIntelligenceService = Depends(get_service)
) -> FileResponse:
    audio_path = service.find_cached_audio(track_id)
    if audio_path and audio_path.is_file():
        media_type = 'audio/wav' if audio_path.suffix.lower() == '.wav' else None
        return FileResponse(str(audio_path), media_type=media_type)
    raise HTTPException(404, f"Audio file for track '{track_id}' is not cached on server")


@app.get('/api/audio/stem/{track_id}/{stem_name}')
def serve_stem_audio(
    track_id: str,
    stem_name: str,
    service: AudioIntelligenceService = Depends(get_service)
) -> FileResponse:
    stem_key = stem_name.lower().strip()
    if stem_key in ('all', 'mix', 'master'):
        return serve_cached_audio(track_id, service=service)

    if stem_key not in ('vocals', 'drums', 'bass', 'other'):
        raise HTTPException(400, f"Invalid stem name '{stem_name}'. Must be one of: all, vocals, drums, bass, other")

    stem_path = service.find_cached_stem(track_id, stem_key)
    if stem_path and stem_path.is_file():
        return FileResponse(str(stem_path), media_type='audio/wav')
    raise HTTPException(404, f"Stem '{stem_key}' could not be extracted for track '{track_id}'")


@app.post('/api/stream/resolve')
async def resolve_online_audio_stream(payload: ResolveStreamRequest) -> dict[str, Any]:
    """Resolves YouTube, SoundCloud, or direct web audio URLs into playable streams.
    Also saves the audio to the cache in the background, so the song can be analysed."""
    meta = await asyncio.to_thread(resolve_stream, payload.url)
    start_cache_download(meta['id'], meta['streamUrl'], AUDIO_CACHE_DIR)
    return meta


@app.get('/api/stream/proxy')
async def proxy_audio_stream(url: str, request: Request):
    """Directly proxies audio streams with full CORS and HTTP Range support."""
    if not url:
        raise HTTPException(400, "Missing 'url' query parameter")
    range_header = request.headers.get('range')
    return await create_proxy_stream_response(url, range_header=range_header)


@app.get('/api/analyze/stream/{track_id}')
async def stream_analysis_events(
    track_id: str,
    service: AudioIntelligenceService = Depends(get_service),
    repository: AnalysisRepository = Depends(get_repository)
):
    """Streams time-window acoustic features and emotion trajectories progressively via Server-Sent Events (SSE)."""
    import json
    import asyncio

    async def event_generator():
        # Check if already analyzed
        analyses = repository.get_analyses(track_id=track_id)
        if analyses:
            an = analyses[0]
            segments = an.get('segments', [])
            total = len(segments)
            for idx, seg in enumerate(segments):
                payload = {
                    'trackId': track_id,
                    'index': idx,
                    'total': total,
                    'segment': seg,
                    'status': 'complete' if idx == total - 1 else 'processing'
                }
                yield f"data: {json.dumps(payload)}\n\n"
                await asyncio.sleep(0.04)
            return

        # Look for cached audio
        audio_path = service.find_cached_audio(track_id) or await wait_for_cache_download(track_id)
        if not audio_path or not audio_path.is_file():
            if track_id == 'original-demo':
                audio_path = DEMO_WAV
            else:
                yield f"data: {json.dumps({'error': f'Track {track_id} audio not found'})}\n\n"
                return

        # Same extractor and window grid as /api/analyze; segments are streamed once computed.
        analysis = await asyncio.to_thread(
            service.feature_extractor.extract_track_analysis, audio_path, None, False, 0.0, 300.0
        )
        segments = analysis['segments']
        for idx, seg in enumerate(segments):
            msg = {
                'trackId': track_id,
                'index': idx,
                'total': len(segments),
                'segment': seg,
                'status': 'complete' if idx == len(segments) - 1 else 'processing'
            }
            yield f"data: {json.dumps(msg)}\n\n"
            await asyncio.sleep(0.02)

    return StreamingResponse(
        event_generator(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        }
    )


@app.get('/api/stems/{track_id}')
def get_track_stems(
    track_id: str,
    service: AudioIntelligenceService = Depends(get_service),
    repository: AnalysisRepository = Depends(get_repository)
) -> dict[str, Any]:
    stem_names = ['vocals', 'drums', 'bass', 'other']
    cached_availability = {name: bool(service.stem_separator.get_cached_stem_path(track_id, name)) for name in stem_names}

    if not any(cached_availability.values()):
        audio_path = service.find_cached_audio(track_id)
        if audio_path and audio_path.is_file():
            sample_rate = service.feature_extractor.sample_rate
            waveform = load_audio(audio_path, sample_rate, duration_sec=service.feature_extractor.config.audio.max_duration_sec)
            stems = service.stem_separator.separate(waveform, sample_rate)
            service.stem_separator.save_stems_to_cache(track_id, stems, sample_rate)
            cached_availability = {name: True for name in stem_names}

    analyses = repository.get_analyses(track_id=track_id)
    dimensions = None
    if analyses and 'musicalDimensions' in analyses[0]:
        dimensions = analyses[0]['musicalDimensions']
    elif analyses and 'segments' in analyses[0] and analyses[0]['segments']:
        dimensions = analyses[0]['segments'][0].get('descriptors', {}).get('dimensions')

    return {
        'trackId': track_id,
        'stems': stem_names,
        'available': cached_availability,
        'dimensions': dimensions,
    }


# ============================================================================
# Acoustic Analysis & Vector Projection Endpoints
# ============================================================================

@app.post('/api/analyze')
async def analyze_recording(
    file: UploadFile = File(...),
    method: str = Form('dsp'),
    track_id: str = Form(''),
    track_title: str = Form(''),
    local_analysis_confirmed: bool = Form(False),
    service: AudioIntelligenceService = Depends(get_service)
) -> dict[str, Any]:
    if not local_analysis_confirmed:
        raise HTTPException(403, 'Explicit confirmation for local audio analysis is required')

    supported_methods = ('dsp', 'clap', 'multimodal', 'both', 'stems', 'm3')
    if method not in supported_methods:
        raise HTTPException(400, f"Unknown analysis method '{method}'")

    if method in ('clap', 'multimodal', 'both') and not service.deep_encoder.is_available():
        raise HTTPException(400, 'CLAP model not available. Install transformers and download laion/clap-htsat-unfused (see README)')

    file_suffix = Path(file.filename or '').suffix.lower()
    if file_suffix not in {'.wav', '.mp3', '.flac', '.ogg', '.m4a', '.aac', '.opus'}:
        raise HTTPException(415, 'Unsupported audio file type')

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(400, 'Empty audio file')
    if len(audio_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, 'Audio file exceeds local analysis size limit')

    clean_title = track_title or Path(file.filename or 'Untitled').stem.replace('_', ' ')
    if track_id:
        AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        for old_file in AUDIO_CACHE_DIR.glob(f'{track_id}.*'):
            old_file.unlink(missing_ok=True)
        (AUDIO_CACHE_DIR / f'{track_id}{file_suffix}').write_bytes(audio_bytes)

    try:
        if method in ('dsp', 'stems', 'm3'):
            return service.analyze_audio_bytes(
                audio_bytes, file.filename or 'audio.wav', method='dsp',
                local_confirmed=local_analysis_confirmed, track_id=track_id
            )
        elif method == 'clap':
            return service.analyze_audio_bytes(
                audio_bytes, file.filename or 'audio.wav', method='clap',
                local_confirmed=local_analysis_confirmed, track_id=track_id
            )
        elif method == 'multimodal':
            return service.analyze_audio_bytes(
                audio_bytes, file.filename or 'audio.wav', method='multimodal',
                local_confirmed=local_analysis_confirmed, track_id=track_id
            )
        else:  # 'both'
            dsp_result = service.analyze_audio_bytes(
                audio_bytes, file.filename or 'audio.wav', method='dsp',
                local_confirmed=local_analysis_confirmed, track_id=track_id
            )
            clap_result = service.analyze_audio_bytes(
                audio_bytes, file.filename or 'audio.wav', method='clap',
                local_confirmed=local_analysis_confirmed, track_id=track_id
            )
            fused_result = service.fusion_engine.fuse(dsp_result, clap_result, deep_weight=0.7)
            if track_id:
                service.repository.save_analysis(track_id, dsp_result, title=clean_title)
                service.repository.save_analysis(track_id, clap_result, title=clean_title)
                service.repository.save_analysis(track_id, fused_result, title=clean_title)
            return {'dsp': dsp_result, 'clap': clap_result, 'multimodal': fused_result}
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(422, f"Could not analyze audio: {type(exc).__name__}: {str(exc)[:160]}") from exc


@app.post('/api/project')
def project_vectors_endpoint(
    request: ProjectionRequest,
    service: AudioIntelligenceService = Depends(get_service)
) -> dict[str, Any]:
    try:
        projected_points = service.project_embedding_vectors(request.modelId, request.vectors)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    return {
        'modelId': request.modelId,
        'method': f'{service.projector.last_method}-2D',
        'points': projected_points,
        'note': 'Exploratory projection; distance does not establish emotion, preference or cause.',
    }


# ============================================================================
# Research & Scientific Evaluation Endpoints
# ============================================================================

@app.post('/api/research/active-learning')
def active_learning_endpoint(
    request: ResearchContextRequest,
    service: AudioIntelligenceService = Depends(get_service)
) -> dict[str, Any]:
    informative_queries = service.active_learning_engine.select_informative_queries(
        request.analyses, request.moments, request.ratings, request.events, limit=5
    )
    return {'queries': informative_queries}


@app.post('/api/research/dmer')
def dynamic_emotion_endpoint(
    request: ResearchContextRequest,
    repository: AnalysisRepository = Depends(get_repository)
) -> dict[str, Any]:
    analyses = request.analyses or repository.get_analyses()
    return DynamicEmotionModel.evaluate_baseline(analyses)


@app.post('/api/research/insight')
def evidence_insight_endpoint(
    request: ResearchContextRequest,
    service: AudioIntelligenceService = Depends(get_service),
    repository: AnalysisRepository = Depends(get_repository)
) -> dict[str, Any]:
    analyses = request.analyses or repository.get_analyses()
    return service.insight_synthesizer.synthesize(analyses, request.moments, request.ratings, request.events)


# Static assets
@app.api_route('/vendor/echarts.min.js', methods=['GET', 'HEAD'])
def serve_echarts() -> FileResponse:
    asset_path = PUBLIC_DIR / 'echarts.min.js'
    if asset_path.is_file():
        return FileResponse(str(asset_path), media_type='application/javascript', headers={'Cache-Control': 'public, max-age=86400'})
    raise HTTPException(404, 'echarts.min.js not found')


@app.api_route('/vendor/d3.min.js', methods=['GET', 'HEAD'])
def serve_d3() -> FileResponse:
    asset_path = PUBLIC_DIR / 'd3.min.js'
    if asset_path.is_file():
        return FileResponse(str(asset_path), media_type='application/javascript', headers={'Cache-Control': 'public, max-age=86400'})
    raise HTTPException(404, 'd3.min.js not found')
