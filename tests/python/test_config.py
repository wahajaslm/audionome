import pytest

from musicdna.config import DEFAULT, load_config
from musicdna.corpus.feature_store import FeatureStore


def test_default_toml_matches_code_defaults() -> None:
    assert load_config() == DEFAULT


def test_overrides_are_typed() -> None:
    config = load_config(overrides=['windows.window_sec=10', 'vocal.hop=160', 'spatial.band_edges_hz=20,300,5000,16000'])
    assert config.windows.window_sec == 10.0
    assert config.vocal.hop == 160
    assert config.spatial.band_edges_hz == (20.0, 300.0, 5000.0, 16000.0)


def test_unknown_parameter_is_rejected() -> None:
    with pytest.raises(KeyError, match='widow_sec'):
        load_config(overrides=['windows.widow_sec=10'])
    with pytest.raises(ValueError):
        load_config(overrides=['windows.hop_sec=0'])


def test_toml_file_is_applied(tmp_path) -> None:
    path = tmp_path / 'short.toml'
    path.write_text('[windows]\nwindow_sec = 5.0\nhop_sec = 5.0\n')
    assert load_config(path).windows.hop_sec == 5.0


def test_cache_files_are_separated_by_the_parameters_they_depend_on(tmp_path) -> None:
    base = FeatureStore(DEFAULT, tmp_path)
    shorter = FeatureStore(load_config(overrides=['windows.window_sec=10']), tmp_path)
    finer_pitch = FeatureStore(load_config(overrides=['vocal.hop=160']), tmp_path)
    assert base.path('v', 'dsp') != shorter.path('v', 'dsp')
    assert base.path('v', 'dsp') == finer_pitch.path('v', 'dsp')          # DSP ignores vocal settings
    assert base.path('v', 'vocal') != finer_pitch.path('v', 'vocal')
    assert base.path('v', 'pitch_contour') == shorter.path('v', 'pitch_contour')  # contour ignores windows
