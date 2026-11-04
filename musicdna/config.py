"""Every tunable analysis parameter, in one place.

Defaults live in the dataclasses below. A TOML file (``configs/default.toml``, ``--config``, or
``MUSIC_DNA_CONFIG``) overrides them, and ``--set section.field=value`` overrides the file:

    python -m musicdna.experiments.pipeline --profile p.json --set windows.window_sec=10 --set windows.hop_sec=5

Cached research features are keyed by a hash of the sections they depend on, so changing a
parameter recomputes only what it affects and never mixes results from different settings.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import tomllib
from dataclasses import asdict, dataclass, field, fields, is_dataclass, replace
from pathlib import Path
from typing import Any

from musicdna.paths import PROJECT_ROOT

DEFAULT_CONFIG_FILE = PROJECT_ROOT / 'configs' / 'default.toml'


@dataclass(frozen=True)
class WindowConfig:
    """Analysis grid shared by DSP, embeddings, vocal/spatial features, listening signals and R01."""
    window_sec: float = 12.0
    hop_sec: float = 6.0
    min_window_sec: float = 0.5  # shorter tail windows are dropped


@dataclass(frozen=True)
class AudioConfig:
    analysis_sr: int = 22050      # DSP and structure analysis
    stereo_sr: int = 44100        # spatial features, Demucs, embedding input
    max_duration_sec: float = 600.0
    stem_model: str = 'htdemucs'  # Demucs model for research vocal stems


@dataclass(frozen=True)
class VocalConfig:
    """pYIN pitch tracking and the pitch-contour descriptors built on it."""
    sample_rate: int = 16000
    hop: int = 256                # 16 ms frames
    fmin_hz: float = 70.0
    fmax_hz: float = 1100.0
    vibrato_min_hz: float = 4.0
    vibrato_max_hz: float = 8.5
    min_run_sec: float = 0.5      # shortest voiced run checked for vibrato
    ornament_prominence_st: float = 0.75
    ornament_max_width_sec: float = 0.3
    max_step_st: float = 1.0      # larger frame-to-frame jumps are note changes, not glides


@dataclass(frozen=True)
class SpatialConfig:
    band_edges_hz: tuple[float, ...] = (20.0, 250.0, 4000.0, 16000.0)
    n_fft: int = 4096


@dataclass(frozen=True)
class SignalConfig:
    """How listening events become evidence about a window."""
    min_overlap_fraction: float = 0.5   # a span marks a window it covers at least this much of
    heard_fraction: float = 0.8         # heard this much without action = passed over
    rewind_min_sec: float = 4.0
    forward_seek_min_sec: float = 5.0
    max_rewind_count: int = 3
    weight_saved_moment: float = 3.0
    weight_liked: float = 2.0
    weight_loop_started: float = 2.0
    weight_rewound_into: float = 1.0
    weight_disliked: float = 3.0
    weight_left_early: float = 1.5
    weight_heard_without_action: float = 1.0
    weight_repeat_session: float = 1.5  # attention score only: each extra session that revisited
    weight_seek_arrival: float = 1.0    # attention score only: forward seek landed here


@dataclass(frozen=True)
class RankerConfig:
    """Pairwise preference ranker and its evaluation (R01)."""
    embedding_pca_components: int = 16
    regularization_c: float = 0.1
    min_songs: int = 3
    min_pairs: int = 20
    experiment_d_min_pairs: int = 500
    bootstrap_samples: int = 2000
    seed: int = 0


@dataclass(frozen=True)
class Config:
    windows: WindowConfig = field(default_factory=WindowConfig)
    audio: AudioConfig = field(default_factory=AudioConfig)
    vocal: VocalConfig = field(default_factory=VocalConfig)
    spatial: SpatialConfig = field(default_factory=SpatialConfig)
    signals: SignalConfig = field(default_factory=SignalConfig)
    ranker: RankerConfig = field(default_factory=RankerConfig)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def section_hash(self, *sections: str) -> str:
        """Short stable hash of the named sections, for cache keys."""
        payload = json.dumps({name: asdict(getattr(self, name)) for name in sections}, sort_keys=True)
        return hashlib.sha1(payload.encode()).hexdigest()[:8]


DEFAULT = Config()


def _coerce(value: Any, like: Any) -> Any:
    if isinstance(like, bool):
        return value if isinstance(value, bool) else str(value).lower() in ('1', 'true', 'yes')
    if isinstance(like, tuple):
        items = value if isinstance(value, (list, tuple)) else str(value).split(',')
        return tuple(_coerce(item, like[0]) for item in items) if like else tuple(items)
    return type(like)(value)


def _apply(config: Config, values: dict[str, dict[str, Any]]) -> Config:
    updated = {}
    for section_name, section_values in values.items():
        section = getattr(config, section_name, None)
        if not is_dataclass(section):
            raise KeyError(f"Unknown config section '{section_name}'. Sections: {[f.name for f in fields(Config)]}")
        known = {f.name for f in fields(section)}
        unknown = set(section_values) - known
        if unknown:
            raise KeyError(f"Unknown {section_name} parameter(s) {sorted(unknown)}. Known: {sorted(known)}")
        updated[section_name] = replace(section, **{
            key: _coerce(value, getattr(section, key)) for key, value in section_values.items()})
    result = replace(config, **updated)
    if result.windows.hop_sec <= 0 or result.windows.window_sec <= 0:
        raise ValueError('windows.window_sec and windows.hop_sec must be positive')
    return result


def parse_overrides(assignments: list[str]) -> dict[str, dict[str, Any]]:
    parsed: dict[str, dict[str, Any]] = {}
    for assignment in assignments:
        key, separator, value = assignment.partition('=')
        section, dot, name = key.strip().partition('.')
        if not separator or not dot:
            raise ValueError(f"Override '{assignment}' must look like section.field=value")
        parsed.setdefault(section, {})[name] = value.strip()
    return parsed


def load_config(path: Path | str | None = None, overrides: list[str] | None = None) -> Config:
    """Defaults, then the TOML file (explicit path, MUSIC_DNA_CONFIG, or configs/default.toml), then overrides."""
    config = DEFAULT
    chosen = Path(path) if path else Path(os.environ['MUSIC_DNA_CONFIG']) if os.getenv('MUSIC_DNA_CONFIG') else DEFAULT_CONFIG_FILE
    if chosen.is_file():
        config = _apply(config, tomllib.loads(chosen.read_text(encoding='utf8')))
    elif path:
        raise FileNotFoundError(chosen)
    return _apply(config, parse_overrides(overrides or []))


def add_config_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument('--config', type=Path, default=None, help='TOML file with analysis parameters')
    parser.add_argument('--set', dest='overrides', action='append', default=[], metavar='SECTION.FIELD=VALUE',
                        help='Override one parameter, e.g. --set windows.window_sec=10 (repeatable)')


def config_from_arguments(arguments: argparse.Namespace) -> Config:
    return load_config(arguments.config, arguments.overrides)
