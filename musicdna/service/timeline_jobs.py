"""Background jobs that build the player timeline (musicdna.features.timeline) for a track.

One worker thread, one queue. The song being played goes to the front. Each job saves the quick
tier as soon as it is done, then separates stems with Demucs and saves the full tier, so the
player can show beats and chords while the stems are still being made.

  GET  /api/timeline/{id}  -> what is saved so far, plus the job status
  POST /api/timeline/{id}  -> start (or move to the front)

UPLOAD WAIT FIX - an upload used to show nothing in Explore until one long job (stems, CLAP,
windows) had finished, and nothing at all when that job failed. The timeline now starts on its
own as soon as the audio is cached, and its quick tier lands in seconds.
Example: upload a 4:38 song -> beats and chords after the quick tier, stems about 75 s later
(Demucs on CPU, measured on this machine), while the song is already playing.
"""
from __future__ import annotations
import json
import logging
import os
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Callable

import numpy as np

from musicdna.audio.beats import BeatTracker
from musicdna.audio.io import load_audio
from musicdna.audio.stems import StemSeparator
from musicdna.features import timeline as tl

LOGGER = logging.getLogger(__name__)
TIMELINE_VERSION = 1
DEMUCS_MODEL = 'htdemucs'
STEM_SR = 44100   # stems are saved at full rate, they are played back


class TimelineJobs:
    """Queue + worker that writes <cache>/timeline/<track_id>.json."""

    def __init__(self, cache_dir: Path, find_audio: Callable[[str], Path | None],
                 stem_separator: StemSeparator, beat_tracker: BeatTracker | None = None,
                 max_duration_sec: float | None = None) -> None:
        self.dir = cache_dir / 'timeline'
        self.find_audio = find_audio
        self.stems = stem_separator
        self.beats = beat_tracker or BeatTracker()
        self.max_duration_sec = max_duration_sec
        self._queue: deque[str] = deque()
        self._status: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._thread: threading.Thread | None = None

    # ---------- public ----------
    def path(self, track_id: str) -> Path:
        return self.dir / f'{track_id}.json'

    def get(self, track_id: str) -> dict[str, Any] | None:
        """Saved timeline (or None) with the live status merged in."""
        saved = self._read(track_id)
        with self._lock:
            live = dict(self._status.get(track_id, {}))
        if saved is None and not live:
            return None
        out = saved or {'trackId': track_id, 'version': TIMELINE_VERSION}
        status = dict(out.get('status', {}))
        status.update(live)
        status.pop('running', None)
        # A job that died with the service (saved 'running', not in this process) is not running.
        if not live:
            for tier in ('quick', 'full'):
                if status.get(tier) in ('running', 'waiting'):
                    status[tier] = 'stale'
        out['status'] = status
        return out

    def request(self, track_id: str, front: bool = True) -> dict[str, Any]:
        """Queues the track unless its timeline is complete; the playing song goes first."""
        saved = self._read(track_id)
        if saved and saved.get('status', {}).get('full') == 'done' and saved.get('version') == TIMELINE_VERSION:
            return saved['status']
        with self._lock:
            if track_id in self._queue:
                if front:
                    self._queue.remove(track_id)
                    self._queue.appendleft(track_id)
            elif self._status.get(track_id, {}).get('running'):
                pass
            else:
                (self._queue.appendleft if front else self._queue.append)(track_id)
                self._status[track_id] = {'quick': 'waiting', 'full': 'waiting', 'stage': 'Waiting in line'}
            self._ensure_worker()
            status = dict(self._status.get(track_id, {}))
        self._wake.set()
        return status

    # ---------- worker ----------
    def _ensure_worker(self) -> None:
        if self._thread is None or not self._thread.is_alive():
            self._thread = threading.Thread(target=self._run, name='timeline-jobs', daemon=True)
            self._thread.start()

    def _run(self) -> None:
        while True:
            with self._lock:
                track_id = self._queue.popleft() if self._queue else None
            if track_id is None:
                self._wake.wait(timeout=30)
                self._wake.clear()
                continue
            try:
                self._build(track_id)
            except Exception as exc:  # one bad file must not stop the queue
                LOGGER.exception('Timeline job failed for %s', track_id)
                self._set(track_id, error=str(exc)[:200], stage='Failed')
                for tier in ('quick', 'full'):
                    if self._status[track_id].get(tier) != 'done':
                        self._status[track_id][tier] = 'error'
                self._save_status(track_id)
            finally:
                with self._lock:
                    self._status.get(track_id, {}).pop('running', None)
                    # Finished jobs are read from disk from now on.
                    if self._status.get(track_id, {}).get('full') in ('done', 'error'):
                        self._status.pop(track_id, None)

    def _build(self, track_id: str) -> None:
        audio = self.find_audio(track_id)
        if not audio or not audio.is_file():
            self._set(track_id, quick='error', full='error', error='Audio is not cached on the service yet', stage='No audio')
            self._save_status(track_id)
            return
        self._set(track_id, running=True)
        saved = self._read(track_id)
        y = load_audio(audio, tl.SR, duration_sec=self.max_duration_sec)

        # quick tier
        if saved and saved.get('status', {}).get('quick') == 'done' and saved.get('version') == TIMELINE_VERSION:
            base = saved
        else:
            self._set(track_id, quick='running', stage='Finding beats and chords')
            started = time.time()
            base = tl.quick_timeline(y, tl.SR, self.beats.track(y, tl.SR))
            base.update({'trackId': track_id, 'version': TIMELINE_VERSION})
            # DONE-AFTER-WRITE FIX - the file is written before the tier is marked done, so a
            # poll can never see 'done' and still read the previous file.
            self._write(track_id, base, quick='done', quickSec=round(time.time() - started, 1))

        # full tier: Demucs stems (reused when already separated), then the stem curves
        self._set(track_id, full='running', stage='Separating stems')
        started = time.time()
        if self.stems.has_demucs_stems(track_id):
            stems = {n: load_audio(self.stems.get_cached_stem_path(track_id, n), tl.SR) for n in tl.STEM_NAMES
                     if self.stems.get_cached_stem_path(track_id, n)}
        else:
            y44 = load_audio(audio, STEM_SR, duration_sec=self.max_duration_sec)
            with _demucs_device():
                stems44 = self.stems.separate_demucs(y44, STEM_SR, model_name=DEMUCS_MODEL)
            self.stems.save_stems_to_cache(track_id, stems44, STEM_SR, source='demucs')
            import librosa
            stems = {n: librosa.resample(x, orig_sr=STEM_SR, target_sr=tl.SR)[:len(y)] for n, x in stems44.items()}
        stems = {n: np.pad(x, (0, max(0, len(y) - len(x)))) for n, x in stems.items()}
        self._set(track_id, stage='Tracing the vocal melody')
        full = tl.full_timeline(base, y, tl.SR, stems, stem_source=f'demucs:{DEMUCS_MODEL}')
        self._write(track_id, full, full='done', fullSec=round(time.time() - started, 1), stage='Done')

    # ---------- state + disk ----------
    def _set(self, track_id: str, **fields: Any) -> None:
        with self._lock:
            self._status.setdefault(track_id, {}).update(fields)

    def _read(self, track_id: str) -> dict[str, Any] | None:
        try:
            return json.loads(self.path(track_id).read_text())
        except (OSError, ValueError):
            return None

    def _write(self, track_id: str, data: dict[str, Any], **status_update: Any) -> None:
        """Writes the file with the status (plus `status_update`), then applies the update in memory."""
        with self._lock:
            status = {k: v for k, v in self._status.get(track_id, {}).items() if k != 'running'}
        status.update(status_update)
        data = dict(data)
        data['status'] = status
        self.dir.mkdir(parents=True, exist_ok=True)
        tmp = self.path(track_id).with_suffix('.tmp')
        tmp.write_text(json.dumps(data, separators=(',', ':')))
        tmp.replace(self.path(track_id))
        if status_update:
            self._set(track_id, **status_update)

    def _save_status(self, track_id: str) -> None:
        self._write(track_id, self._read(track_id) or {'trackId': track_id, 'version': TIMELINE_VERSION})


class _demucs_device:
    """Demucs picks CUDA or CPU itself; MUSICDNA_DEMUCS_THREADS limits CPU threads (default: all)."""

    def __enter__(self) -> None:
        threads = os.environ.get('MUSICDNA_DEMUCS_THREADS')
        if threads:
            import torch
            self._prev = torch.get_num_threads()
            torch.set_num_threads(int(threads))

    def __exit__(self, *exc: object) -> None:
        if hasattr(self, '_prev'):
            import torch
            torch.set_num_threads(self._prev)


__all__ = ['TimelineJobs', 'TIMELINE_VERSION']
