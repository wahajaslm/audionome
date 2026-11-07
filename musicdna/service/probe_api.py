"""File facts for "Stats for nerds": ffprobe on the service's copy of a song.

The player reads codec and bitrate from the file itself (src/core/bitrate.ts); ffprobe adds
what that parser does not: the codec profile (AAC LC / HE-AAC), encoder, sample format and bit
depth, channel layout, every tag (title, album, ReplayGain …) and embedded pictures.
Example: GET /api/probe/06f0b181-… -> {"container": "QuickTime / MOV", "codec": "AAC (Advanced
Audio Coding)", "profile": "LC", "sampleFormat": "fltp", "encoder": "Lavf61.7.100", ...}
Returns 404 when the song is not cached here, 503 when ffprobe is not installed.
"""
from __future__ import annotations
import json
import shutil
import subprocess
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from musicdna.service.service import AudioIntelligenceService, _DEFAULT_SERVICE

router = APIRouter()


def get_probe_service() -> AudioIntelligenceService:
    return _DEFAULT_SERVICE


def summarize_probe(raw: dict[str, Any]) -> dict[str, Any]:
    """The fields Stats for nerds shows, from ffprobe's -show_format -show_streams JSON."""
    fmt = raw.get('format') or {}
    streams = raw.get('streams') or []
    audio = next((s for s in streams if s.get('codec_type') == 'audio'), {})
    pictures = [s for s in streams if (s.get('disposition') or {}).get('attached_pic')]
    tags = {**{k.lower(): v for k, v in (fmt.get('tags') or {}).items()},
            **{k.lower(): v for k, v in (audio.get('tags') or {}).items()}}
    num = lambda v: float(v) if v not in (None, '', 'N/A') else None  # noqa: E731
    bits = audio.get('bits_per_raw_sample') or audio.get('bits_per_sample')
    return {
        'container': fmt.get('format_long_name') or fmt.get('format_name'),
        'codec': audio.get('codec_long_name') or audio.get('codec_name'),
        'codecName': audio.get('codec_name'),
        'profile': audio.get('profile') if audio.get('profile') not in (None, 'unknown') else None,
        'sampleFormat': audio.get('sample_fmt'),
        'bitDepth': int(bits) if bits not in (None, 0, '0') else None,
        'sampleRate': int(audio['sample_rate']) if audio.get('sample_rate') else None,
        'channels': audio.get('channels'),
        'channelLayout': audio.get('channel_layout'),
        'durationSec': num(fmt.get('duration')),
        'startSec': num(audio.get('start_time')),
        'sizeBytes': int(fmt['size']) if fmt.get('size') else None,
        'bitRate': num(audio.get('bit_rate')) or num(fmt.get('bit_rate')),
        'encoder': tags.get('encoder') or tags.get('encoded_by'),
        'pictures': len(pictures),
        'tags': {k: v for k, v in tags.items() if k not in ('encoder',) and len(str(v)) < 300},
    }


@router.get('/api/probe/{track_id}')
def probe_track(track_id: str, service: AudioIntelligenceService = Depends(get_probe_service)) -> dict[str, Any]:
    path = service.find_cached_audio(track_id)
    if not path or not path.is_file():
        raise HTTPException(404, f"Audio file for track '{track_id}' is not cached on server")
    ffprobe = shutil.which('ffprobe')
    if not ffprobe:
        raise HTTPException(503, 'ffprobe is not installed')
    out = subprocess.run([ffprobe, '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', str(path)],
                         capture_output=True, text=True, timeout=20)
    if out.returncode != 0:
        raise HTTPException(422, 'ffprobe could not read this file')
    return summarize_probe(json.loads(out.stdout or '{}'))
