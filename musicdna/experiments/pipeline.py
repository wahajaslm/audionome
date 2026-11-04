"""End-to-end R01 research pipeline: corpus -> features -> preference pairs -> experiment report.

Every step reuses what is already on disk, so re-running after more listening only does new work.

    python -m musicdna.experiments.pipeline --profile ~/Downloads/music-dna-profile.json
    python -m musicdna.experiments.pipeline --profile music-dna-profile.json --allow-nc-weights   # adds MERT
    python -m musicdna.experiments.pipeline --profile music-dna-profile.json --set windows.window_sec=10 --set windows.hop_sec=5
"""
from __future__ import annotations
import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from musicdna.config import Config
from musicdna.corpus.coke_studio import CokeStudioManifest
from musicdna.corpus.manifest import CorpusManifest
from musicdna.corpus.feature_store import DEFAULT_STAGES, FeatureBuilder, FeatureStore
from musicdna.experiments.r01 import R01Experiment
from musicdna.paths import RESEARCH_OUTPUT_DIR
from musicdna.preference.implicit_pairs import ImplicitPairBuilder


class R01Pipeline:
    """Runs the four R01 steps for one configuration and writes its pairs and report."""

    def __init__(self, config: Config, workers: int = 4, allow_nc_weights: bool = False, lyrics: bool = False,
                 output_directory: Path = RESEARCH_OUTPUT_DIR) -> None:
        self.config = config
        self.store = FeatureStore(config)
        self.builder = FeatureBuilder(self.store, workers, allow_nc_weights)
        self.stages = DEFAULT_STAGES + (['mert'] if allow_nc_weights else []) + (['lyrics'] if lyrics else [])
        self.output_directory = output_directory
        self.tag = config.section_hash('windows', 'audio', 'vocal', 'spatial', 'signals', 'ranker')

    def run(self, profile: dict[str, Any]) -> dict[str, Any]:
        print(f'config {self.tag}: window {self.config.windows.window_sec}s, hop {self.config.windows.hop_sec}s')
        corpus = self.check_corpus()
        self.build_features(corpus)
        pairs = self.build_pairs(profile, corpus)
        return self.run_experiment(pairs, corpus)

    def check_corpus(self) -> CorpusManifest:
        print('1/4 corpus')
        corpus = CokeStudioManifest.load()
        problems = corpus.verify()
        if problems:
            raise SystemExit('Corpus incomplete; run `python -m musicdna.corpus.coke_studio download`.\n' + '\n'.join(problems))
        return corpus

    def build_features(self, corpus: CorpusManifest) -> None:
        print('2/4 features')
        failures = self.builder.build(self.stages, corpus.entries)
        print('   coverage', json.dumps(self.builder.coverage(corpus.entries)))
        for failure in failures:
            print('   !', failure)

    def build_pairs(self, profile: dict[str, Any], corpus: CorpusManifest) -> list[dict[str, Any]]:
        print('3/4 preference pairs')
        pairs = [asdict(p) for p in ImplicitPairBuilder(self.config).build_pairs(profile, corpus.song_index())]
        self.output_directory.mkdir(exist_ok=True)
        (self.output_directory / f'preference_pairs_{self.tag}.json').write_text(
            json.dumps(pairs, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
        linked = sum(p['corpus_video_id'] is not None for p in pairs)
        print(f'   {len(pairs)} pairs, {linked} on corpus songs')
        return pairs

    def run_experiment(self, pairs: list[dict[str, Any]], corpus: CorpusManifest) -> dict[str, Any]:
        print('4/4 R01 experiment')
        report = R01Experiment(self.store, corpus).run(pairs)
        # One report per configuration, plus r01_report.json as the latest run.
        for path in (self.output_directory / f'r01_report_{self.tag}.json', self.output_directory / 'r01_report.json'):
            path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
        print(f"   {report['status']} -> research-output/r01_report_{self.tag}.json")
        if report['status'] == 'insufficient_data':
            print(f"   need {report['needed']}; import corpus songs into the player, listen, then export the profile again")
        return report


def main() -> None:
    parser = argparse.ArgumentParser(description='Run the Music DNA R01 research pipeline')
    parser.add_argument('--profile', type=Path, required=True, help='music-dna-profile.json exported from the player')
    parser.add_argument('--allow-nc-weights', action='store_true', help='Include MERT (CC BY-NC 4.0 weights)')
    parser.add_argument('--lyrics', action='store_true', help='Also transcribe vocals (needs faster-whisper)')
    parser.add_argument('--workers', type=int, default=4)
    Config.add_arguments(parser)
    arguments = parser.parse_args()

    pipeline = R01Pipeline(Config.from_arguments(arguments), arguments.workers, arguments.allow_nc_weights, arguments.lyrics)
    pipeline.run(json.loads(arguments.profile.read_text(encoding='utf8')))


if __name__ == '__main__':
    main()
