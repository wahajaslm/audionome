"""End-to-end R01 research pipeline: corpus -> features -> preference pairs -> experiment report.

Every step reuses what is already on disk, so re-running after more listening only does new work.

    python -m research.pipeline --profile ~/Downloads/music-dna-profile.json
    python -m research.pipeline --profile music-dna-profile.json --allow-nc-weights   # adds MERT
"""
from __future__ import annotations
import argparse
import json
from dataclasses import asdict
from pathlib import Path

from . import r01_experiment
from .coke_studio_dataset import MANIFEST_PATH, CorpusManifest, verify
from .feature_store import FeatureStore, build, coverage
from .implicit_pairs import ImplicitPairBuilder

OUTPUT_DIRECTORY = Path('research-output')


def main() -> None:
    parser = argparse.ArgumentParser(description='Run the Music DNA R01 research pipeline')
    parser.add_argument('--profile', type=Path, required=True, help='music-dna-profile.json exported from the player')
    parser.add_argument('--allow-nc-weights', action='store_true', help='Include MERT (CC BY-NC 4.0 weights)')
    parser.add_argument('--lyrics', action='store_true', help='Also transcribe vocals (needs faster-whisper)')
    parser.add_argument('--workers', type=int, default=4)
    arguments = parser.parse_args()

    print('1/4 corpus')
    corpus = CorpusManifest.load(MANIFEST_PATH)
    problems = verify(corpus)
    if problems:
        raise SystemExit('Corpus incomplete; run `python -m research.coke_studio_dataset download`.\n' + '\n'.join(problems))

    print('2/4 features')
    stages = ['stems', 'dsp', 'spatial', 'vocal', 'clap']
    stages += ['mert'] if arguments.allow_nc_weights else []
    stages += ['lyrics'] if arguments.lyrics else []
    store = FeatureStore()
    failures = build(stages, store, corpus.entries, arguments.workers, arguments.allow_nc_weights)
    print('   coverage', json.dumps(coverage(store, corpus.entries)))
    for failure in failures:
        print('   !', failure)

    print('3/4 preference pairs')
    profile = json.loads(arguments.profile.read_text(encoding='utf8'))
    pairs = [asdict(p) for p in ImplicitPairBuilder(store.window_sec).build_pairs(profile, corpus)]
    pairs_path = OUTPUT_DIRECTORY / 'preference_pairs.json'
    OUTPUT_DIRECTORY.mkdir(exist_ok=True)
    pairs_path.write_text(json.dumps(pairs, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
    linked = sum(p['corpus_video_id'] is not None for p in pairs)
    print(f'   {len(pairs)} pairs, {linked} on corpus songs')

    print('4/4 R01 experiment')
    report = r01_experiment.run(pairs, store, corpus)
    report_path = OUTPUT_DIRECTORY / 'r01_report.json'
    report_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    print(f"   {report['status']} -> {report_path}")
    if report['status'] == 'insufficient_data':
        print(f"   need {report['needed']}; import corpus songs into the player, listen, then export the profile again")


if __name__ == '__main__':
    main()
