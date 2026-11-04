"""End-to-end research pipeline: corpus -> features -> preference pairs -> R01 and R02 reports.

Every step reuses what is already on disk, so re-running after more listening only does new work.

    python -m musicdna.experiments.pipeline --profile ~/Downloads/music-dna-profile.json
    python -m musicdna.experiments.pipeline --profile music-dna-profile.json --allow-nc-weights   # adds MERT
    python -m musicdna.experiments.pipeline --profile music-dna-profile.json --set windows.window_sec=10 --set windows.hop_sec=5
"""
from __future__ import annotations
import argparse
import hashlib
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from musicdna.config import Config
from musicdna.corpus.coke_studio import CokeStudioManifest
from musicdna.corpus.manifest import CorpusManifest
from musicdna.corpus.feature_store import DEFAULT_STAGES, STAGES, FeatureBuilder, FeatureStore
from musicdna.experiments.r01 import R01Experiment
from musicdna.experiments.r02 import R02Experiment
from musicdna.paths import RESEARCH_OUTPUT_DIR
from musicdna.preference.implicit_pairs import ImplicitPairBuilder


def pipeline_fingerprint() -> dict[str, Any]:
    """What the pipeline consists of right now: feature stages and their outputs, the systems each
    experiment compares, and every config default. The notebook prints its hash when it runs, and
    tests/python/test_notebook.py fails if the saved notebook's hash no longer matches the code.
    Example: changing vocal.gate_min_vocal_to_accompaniment_db from -15 to -12 changes the hash,
    so the notebook must be re-run before the change is committed."""
    return {
        'stages': {name: sorted(stage.artifacts) for name, stage in STAGES.items()},
        'default_stages': list(DEFAULT_STAGES),
        'experiments': {'r01': sorted(R01Experiment.SYSTEMS), 'r02': sorted(R02Experiment.SYSTEMS)},
        'config': Config().to_dict(),
    }


def fingerprint_hash() -> str:
    return hashlib.sha1(json.dumps(pipeline_fingerprint(), sort_keys=True, default=str).encode()).hexdigest()[:12]


class ResearchPipeline:
    """Runs the four steps for one configuration and writes its pairs and the R01 + R02 reports."""

    def __init__(self, config: Config, workers: int = 4, allow_nc_weights: bool = False, lyrics: bool = False,
                 output_directory: Path = RESEARCH_OUTPUT_DIR) -> None:
        self.config = config
        self.store = FeatureStore(config)
        self.builder = FeatureBuilder(self.store, workers, allow_nc_weights)
        self.stages = DEFAULT_STAGES + (['mert'] if allow_nc_weights else []) + (['lyrics'] if lyrics else [])
        self.output_directory = output_directory
        self.tag = config.section_hash('windows', 'audio', 'vocal', 'intonation', 'spatial', 'signals', 'ranker')

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
        files = {e.sha256: e.video_id for e in corpus.entries if e.sha256}
        # Decoded corpus lengths, for the player delay compensation (only songs the profile imported).
        imported = {t.get('sha256') for t in profile.get('tracks', [])}
        durations = {e.video_id: self.store.duration(e) for e in corpus.entries if e.sha256 in imported}
        pairs = [asdict(p) for p in ImplicitPairBuilder(self.config).build_pairs(
            profile, corpus.song_index(), files, durations)]
        self.output_directory.mkdir(exist_ok=True)
        (self.output_directory / f'preference_pairs_{self.tag}.json').write_text(
            json.dumps(pairs, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
        linked = sum(p['corpus_video_id'] is not None for p in pairs)
        by_title = sum(p['linked_by'] == 'title' for p in pairs)
        print(f'   {len(pairs)} pairs, {linked} on corpus songs ({by_title} linked by title only, not by file hash)')
        return pairs

    def run_experiment(self, pairs: list[dict[str, Any]], corpus: CorpusManifest) -> dict[str, Any]:
        print('4/4 experiments')
        reports = {}
        for name, experiment in (('r01', R01Experiment), ('r02', R02Experiment)):
            report = experiment(self.store, corpus).run(pairs)
            # One report per configuration, plus <name>_report.json as the latest run.
            for path in (self.output_directory / f'{name}_report_{self.tag}.json', self.output_directory / f'{name}_report.json'):
                path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
            print(f"   {name}: {report['status']} -> research-output/{name}_report_{self.tag}.json")
            reports[name] = report
        if reports['r01']['status'] == 'insufficient_data':
            print(f"   need {reports['r01']['needed']}; import corpus songs into the player, listen, then export the profile again")
        return reports


def main() -> None:
    parser = argparse.ArgumentParser(description='Run the Music DNA R01 research pipeline')
    parser.add_argument('--profile', type=Path, required=True, help='music-dna-profile.json exported from the player')
    parser.add_argument('--allow-nc-weights', action='store_true', help='Include MERT (CC BY-NC 4.0 weights)')
    parser.add_argument('--lyrics', action='store_true', help='Also transcribe vocals (needs faster-whisper)')
    parser.add_argument('--workers', type=int, default=4)
    Config.add_arguments(parser)
    arguments = parser.parse_args()

    pipeline = ResearchPipeline(Config.from_arguments(arguments), arguments.workers, arguments.allow_nc_weights, arguments.lyrics)
    pipeline.run(json.loads(arguments.profile.read_text(encoding='utf8')))


if __name__ == '__main__':
    main()
