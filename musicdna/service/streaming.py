"""Streaming Audio Resolver and HTTP Range Proxy for Web, YouTube, and SoundCloud.

Allows the player to stream audio directly into the browser without CORS restrictions,
and provides raw audio streams to the ML feature extractor and MERT/CLAP encoders.
"""
from __future__ import annotations
import asyncio
import os
import re
from typing import Any, AsyncIterator
import httpx
import yt_dlp
from fastapi import HTTPException
from starlette.responses import StreamingResponse

# M4A FIX - prefer AAC in .m4a over WebM/Opus. Safari cannot play WebM in <audio>, and its
# Web Audio decoder (used for the waveform) cannot read it either. Every browser plays M4A.
# Example: a YouTube link resolved to format 251 (webm/opus) and stayed silent in Safari;
# it now resolves to 140 (m4a/aac).
YDL_OPTS = {
    'format': 'bestaudio[ext=m4a]/bestaudio/best',
    'quiet': True,
    'no_warnings': True,
    'extract_flat': False,
    'noplaylist': True,
    'skip_download': True,
    'socket_timeout': 10,
}


def is_direct_audio_url(url: str) -> bool:
    """Checks if the URL directly points to an audio stream file."""
    clean = url.split('?')[0].lower()
    return clean.endswith(('.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.opus', '.weba'))


def detect_source(url: str) -> str:
    lower = url.lower()
    if 'youtube.com' in lower or 'youtu.be' in lower:
        return 'youtube'
    if 'soundcloud.com' in lower:
        return 'soundcloud'
    if 'bandcamp.com' in lower:
        return 'bandcamp'
    if is_direct_audio_url(url):
        return 'direct'
    return 'web-stream'


def resolve_stream(url: str) -> dict[str, Any]:
    """Resolves an online stream URL (YouTube, SoundCloud, direct audio) to stream metadata."""
    source = detect_source(url)

    if source == 'direct':
        filename = url.split('?')[0].split('/')[-1] or 'Streaming Audio'
        title = filename.rsplit('.', 1)[0].replace('_', ' ').replace('-', ' ').title()
        return {
            'id': f"direct-{abs(hash(url)) % 10000000}",
            'source': 'direct',
            'title': title,
            'artist': 'Web Stream',
            'durationSec': 180,
            'thumbnail': '',
            'originalUrl': url,
            'streamUrl': url,
            'isDirect': True,
        }

    try:
        with yt_dlp.YoutubeDL(YDL_OPTS) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                raise ValueError("Could not extract stream info from URL")

            # Extract direct audio format URL
            stream_url = info.get('url')
            if not stream_url and 'formats' in info:
                # Find best audio-only or best available format
                audio_formats = [
                    f for f in info['formats']
                    if f.get('acodec') != 'none' and f.get('url')
                ]
                if audio_formats:
                    # Pick highest audio bitrate
                    best = max(audio_formats, key=lambda f: f.get('abr') or f.get('tbr') or 0)
                    stream_url = best['url']
                elif info['formats']:
                    stream_url = info['formats'][-1].get('url')

            if not stream_url:
                raise ValueError("No playable audio stream format found")

            duration = info.get('duration') or 180
            title = info.get('title') or 'Unknown Title'
            artist = info.get('uploader') or info.get('artist') or info.get('channel') or 'Online Artist'
            thumbnail = info.get('thumbnail') or ''

            return {
                'id': f"{source}-{info.get('id', abs(hash(url)) % 10000000)}",
                'source': source,
                'title': title,
                'artist': artist,
                'durationSec': float(duration),
                'thumbnail': thumbnail,
                'originalUrl': url,
                'streamUrl': stream_url,
                'isDirect': False,
            }
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Unable to resolve stream from '{url}': {str(exc)}"
        ) from exc


async def create_proxy_stream_response(
    target_url: str,
    range_header: str | None = None
) -> StreamingResponse:
    """Streams audio chunks from target_url to the browser with support for HTTP Range requests."""
    headers: dict[str, str] = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    }
    # FULL FILE FIX - YouTube cuts a plain GET short (about 1.9 MB of a 3.4 MB song), so the
    # waveform download got a truncated file. Always ask upstream for a range; when the browser
    # did not ask for one, answer it with a normal 200 for the whole file.
    # Example: fetch(proxyUrl) with no Range header now returns all 3,433,755 bytes.
    headers['Range'] = range_header or 'bytes=0-'

    client = httpx.AsyncClient(timeout=15.0, follow_redirects=True)
    try:
        upstream_req = client.build_request('GET', target_url, headers=headers)
        upstream_res = await client.send(upstream_req, stream=True)
    except Exception as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Failed to connect to stream: {exc}") from exc

    status_code = upstream_res.status_code
    if status_code not in (200, 206):
        await upstream_res.aclose()
        await client.aclose()
        raise HTTPException(status_code=status_code, detail="Upstream stream returned non-200/206 status")

    response_headers: dict[str, str] = {
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    }

    for key in ('content-type', 'content-length', 'content-range', 'etag', 'last-modified'):
        val = upstream_res.headers.get(key)
        if val:
            response_headers[key] = val
    if not range_header and status_code == 206:
        status_code = 200
        response_headers.pop('content-range', None)

    if 'content-type' not in response_headers or 'html' in response_headers['content-type'].lower():
        response_headers['content-type'] = 'audio/mpeg'

    async def stream_generator() -> AsyncIterator[bytes]:
        try:
            async for chunk in upstream_res.aiter_bytes(chunk_size=65536):
                yield chunk
        finally:
            await upstream_res.aclose()
            await client.aclose()

    return StreamingResponse(
        stream_generator(),
        status_code=status_code,
        headers=response_headers,
        media_type=response_headers.get('content-type', 'audio/mpeg')
    )

