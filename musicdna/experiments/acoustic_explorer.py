"""Local-only, reproducible acoustic exploration for Music DNA recordings.

Exposes measured acoustic features, timestamps, and spectral curves for investigation,
comparison, and visualization plots.
"""
from __future__ import annotations
import argparse
import csv
import json
from pathlib import Path
from typing import Any
from musicdna.features.dsp import AcousticFeatureExtractor


class AcousticExplorer:
    """Orchestrates acoustic feature extraction, tabular CSV export, and spectrogram plots."""

    FEATURE_COLUMNS: list[str] = [
        'startSec',
        'endSec',
        'energy',
        'brightness_hz',
        'onset_activity',
        'noisiness',
        'zero_crossing_rate',
    ]

    PLOT_SPECIFICATIONS: list[tuple[str, str, str]] = [
        ('energy', 'Short-window energy', 'RMS amplitude'),
        ('brightness_hz', 'Spectral brightness', 'Centroid (Hz)'),
        ('onset_activity', 'Rhythmic activity', 'Onset strength'),
    ]

    def __init__(self, output_directory: Path) -> None:
        self.output_directory = output_directory
        self.output_directory.mkdir(parents=True, exist_ok=True)

    def export_analysis_json(self, analysis_result: dict[str, Any]) -> Path:
        json_path = self.output_directory / 'segments.json'
        with json_path.open('w', encoding='utf8') as file_handle:
            json.dump(analysis_result, file_handle, indent=2)
        return json_path

    def export_features_csv(self, segments: list[dict[str, Any]]) -> Path:
        csv_path = self.output_directory / 'features.csv'
        with csv_path.open('w', newline='', encoding='utf8') as file_handle:
            writer = csv.DictWriter(file_handle, fieldnames=self.FEATURE_COLUMNS)
            writer.writeheader()
            for segment in segments:
                row = {
                    'startSec': segment['startSec'],
                    'endSec': segment['endSec'],
                    **{col: segment['descriptors'][col] for col in self.FEATURE_COLUMNS[2:]}
                }
                writer.writerow(row)
        return csv_path

    def generate_plots(self, segments: list[dict[str, Any]]) -> list[Path]:
        saved_plots: list[Path] = []
        try:
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt

            time_midpoints = [(s['startSec'] + s['endSec']) / 2.0 for s in segments]
            for feature_key, plot_title, unit_label in self.PLOT_SPECIFICATIONS:
                figure, axis = plt.subplots(figsize=(11, 3.5))
                feature_values = [s['descriptors'][feature_key] for s in segments]
                axis.plot(time_midpoints, feature_values, marker='.')
                axis.set(xlabel='Song time (seconds)', ylabel=unit_label, title=plot_title)
                figure.tight_layout()
                plot_path = self.output_directory / f'{feature_key}.png'
                figure.savefig(plot_path, dpi=160)
                plt.close(figure)
                saved_plots.append(plot_path)
        except ImportError:
            print('matplotlib unavailable; exported JSON/CSV without optional plots.')
        return saved_plots

    def explore(self, audio_path: Path) -> dict[str, Any]:
        """Runs complete acoustic analysis, exports tabular data, and generates feature curves."""
        analysis_result = AcousticFeatureExtractor().extract_track_analysis(audio_path)
        segments = analysis_result["segments"]

        self.export_analysis_json(analysis_result)
        self.export_features_csv(segments)
        self.generate_plots(segments)

        print(
            f'Analyzed {analysis_result["durationSec"]:.1f}s into {len(segments)} overlapping windows. '
            f'Saved to {self.output_directory}'
        )
        print('These features describe audio properties. They do not establish user emotion or causation.')
        return analysis_result


__all__ = ['AcousticExplorer']


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Explore authorized music recordings locally')
    parser.add_argument('audio', type=Path)
    parser.add_argument('--out', type=Path, default=Path('research-output'))
    args = parser.parse_args()
    AcousticExplorer(args.out).explore(args.audio)
