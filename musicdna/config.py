"""Every tunable analysis parameter, in one place.

Defaults live in the dataclasses below. A TOML file (``configs/default.toml``, ``--config``, or
``MUSIC_DNA_CONFIG``) overrides them, and ``--set section.field=value`` overrides the file.
In code: ``Config.load()``, ``Config.load(overrides=['windows.window_sec=10'])``.

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
    # Extra real audio analysed before/after each window so frame features have context at the
    # edges; results still describe only the window. Clipped at the start/end of the song.
    preroll_sec: float = 1.0
    postroll_sec: float = 1.0
    # Context given to neural embeddings (CLAP/MERT) on each side. 0 = window audio only.
    # Kept separate because extra context makes neighbouring windows share audio; R01 can compare.
    embedding_context_sec: float = 0.0


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
    # Pitch grid of the tracker. Never snapped to piano keys: 2 cents keeps the shape of slides and
    # vibrato (at 10 cents a held, vibrating note collapsed to 6 distinct values; at 2 cents, 28).
    pitch_resolution_cents: float = 2.0
    # Singing gate: a frame counts as singing only if the vocal stem is not buried under the
    # accompaniment. Instruments leaking into the stem (harmonium, sarangi) are otherwise read as voice.
    # Calibrated on Garaj Baras 60-120 s: sung frames median -5 dB vocal-to-accompaniment, silent -51 dB;
    # -15 dB drops the weakest 9% of frames the tracker called sung.
    gate_enabled: bool = True
    gate_min_vocal_to_accompaniment_db: float = -15.0
    gate_min_vocal_dbfs: float = -50.0
    gate_min_voicing_probability: float = 0.0   # off: pYIN gave median 0.21 even on real singing


@dataclass(frozen=True)
class IntonationConfig:
    """Where a singer places notes, measured against the song's own tonic (Sa), not A=440 / piano keys."""
    smoothing_sec: float = 0.2              # removes vibrato to find the note's centre
    stable_max_velocity_cents_per_sec: float = 150.0  # slower than this = a held note
    stable_min_sec: float = 0.15            # shortest held note counted
    glide_window_sec: float = 0.5           # look this far back for a slide into a note (meend)
    glide_min_cents: float = 80.0           # smaller approaches are not counted as slides
    # A bigger one-frame (16 ms) pitch jump ends a slide: a note change or tracker error. 200 = 125 st/s, faster
    # than a sung slide. On 3 songs: slides over 700 cents went from 28 to 1, and 73% of all slides were kept.
    glide_max_step_cents: float = 200.0
    histogram_bin_cents: float = 5.0        # tonic search resolution
    histogram_smoothing_cents: float = 15.0
    tonic_candidates: int = 5
    tonic_fifth_weight: float = 0.5         # Sa is usually supported by Pa (+702 cents)
    offgrid_threshold_cents: float = 20.0   # a held note this far from every equal-tempered step is "between keys"
    profile_bins: int = 24                  # tonic-relative pitch profile, 50 cents per bin
    use_annotated_tonic: bool = True        # use data/<corpus>/tonic_annotations.json when a song has one


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
    # Largest player-vs-corpus clock gap that is corrected (Safari skips ~48 ms of AAC padding; see
    # ImplicitPairBuilder.player_offset). Bigger gaps mean the duration was not measured, so no shift.
    max_player_offset_sec: float = 0.1


@dataclass(frozen=True)
class RankerConfig:
    """Pairwise preference ranker and its evaluation (R01)."""
    embedding_pca_components: int = 16
    regularization_c: float = 0.1
    min_songs: int = 3
    min_pairs: int = 20
    # Fewest shared songs for a 'better' / 'worse' verdict between two systems. A song-level test cannot
    # reach 5% with fewer: by chance alone, all n songs lean the same way with probability 2 / 2**n
    # (3 songs: 25%; 6 songs: 3%). Example: random pairs on 3 songs gave 'worse' for C_mert_vocal vs B_mert.
    min_songs_for_verdict: int = 6
    experiment_d_min_pairs: int = 500
    bootstrap_samples: int = 2000
    seed: int = 0


@dataclass(frozen=True)
class Config:
    windows: WindowConfig = field(default_factory=WindowConfig)
    audio: AudioConfig = field(default_factory=AudioConfig)
    vocal: VocalConfig = field(default_factory=VocalConfig)
    intonation: IntonationConfig = field(default_factory=IntonationConfig)
    spatial: SpatialConfig = field(default_factory=SpatialConfig)
    signals: SignalConfig = field(default_factory=SignalConfig)
    ranker: RankerConfig = field(default_factory=RankerConfig)

    @classmethod
    def load(cls, path: Path | str | None = None, overrides: list[str] | None = None) -> Config:
        """Defaults, then the TOML file (explicit path, MUSIC_DNA_CONFIG, or configs/default.toml), then overrides."""
        config = cls()
        env_path = os.getenv('MUSIC_DNA_CONFIG')
        chosen = Path(path) if path else Path(env_path) if env_path else DEFAULT_CONFIG_FILE
        if chosen.is_file():
            config = config.updated(tomllib.loads(chosen.read_text(encoding='utf8')))
        elif path:
            raise FileNotFoundError(chosen)
        return config.with_overrides(overrides or [])

    @classmethod
    def from_arguments(cls, arguments: argparse.Namespace) -> Config:
        return cls.load(arguments.config, arguments.overrides)

    @staticmethod
    def add_arguments(parser: argparse.ArgumentParser) -> None:
        parser.add_argument('--config', type=Path, default=None, help='TOML file with analysis parameters')
        parser.add_argument('--set', dest='overrides', action='append', default=[], metavar='SECTION.FIELD=VALUE',
                            help='Override one parameter, e.g. --set windows.window_sec=10 (repeatable)')

    def with_overrides(self, assignments: list[str]) -> Config:
        """Applies 'section.field=value' strings."""
        parsed: dict[str, dict[str, Any]] = {}
        for assignment in assignments:
            key, separator, value = assignment.partition('=')
            section, dot, name = key.strip().partition('.')
            if not separator or not dot:
                raise ValueError(f"Override '{assignment}' must look like section.field=value")
            parsed.setdefault(section, {})[name] = value.strip()
        return self.updated(parsed)

    def updated(self, values: dict[str, dict[str, Any]]) -> Config:
        """A copy with the given section fields replaced; unknown names and invalid grids are rejected."""
        changes = {}
        for section_name, section_values in values.items():
            section = getattr(self, section_name, None)
            if not is_dataclass(section):
                raise KeyError(f"Unknown config section '{section_name}'. Sections: {[f.name for f in fields(self)]}")
            known = {f.name for f in fields(section)}
            unknown = set(section_values) - known
            if unknown:
                raise KeyError(f"Unknown {section_name} parameter(s) {sorted(unknown)}. Known: {sorted(known)}")
            changes[section_name] = replace(section, **{
                key: _coerce(value, getattr(section, key)) for key, value in section_values.items()})
        result = replace(self, **changes)
        if result.windows.hop_sec <= 0 or result.windows.window_sec <= 0:
            raise ValueError('windows.window_sec and windows.hop_sec must be positive')
        w = result.windows
        if min(w.preroll_sec, w.postroll_sec, w.embedding_context_sec) < 0:
            raise ValueError('windows.preroll_sec, postroll_sec and embedding_context_sec cannot be negative')
        return result

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def section_hash(self, *sections: str) -> str:
        """Short stable hash of the named sections, for cache keys."""
        payload = json.dumps({name: asdict(getattr(self, name)) for name in sections}, sort_keys=True)
        return hashlib.sha1(payload.encode()).hexdigest()[:8]


def _coerce(value: Any, like: Any) -> Any:
    """Converts a TOML or command-line value to the type of the field's default."""
    if isinstance(like, bool):
        return value if isinstance(value, bool) else str(value).lower() in ('1', 'true', 'yes')
    if isinstance(like, tuple):
        items = value if isinstance(value, (list, tuple)) else str(value).split(',')
        return tuple(_coerce(item, like[0]) for item in items) if like else tuple(items)
    return type(like)(value)


DEFAULT = Config()
