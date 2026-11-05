"""One zip with everything Colab needs to run the feature stages and the moment model on a GPU.

Contents: the musicdna package, requirements.txt, configs/, notebooks/03_colab_gpu.ipynb, and the
genre_mix manifest, audio and any features already built. Upload the zip to Google Drive under
MyDrive/music-dna/ and open the notebook in Colab. Research use only: the audio is not licensed
for redistribution, so the zip stays in your own Drive.

    python -m musicdna.experiments.colab_bundle            # -> research-output/music_dna_colab.zip
    python -m musicdna.experiments.colab_bundle --no-audio # features only (stems already built)
    python -m musicdna.experiments.colab_bundle --with-stems  # also the Demucs .flac stems built so far

Stems are left out by default: a local stem run may still be writing one, and a half-written file would
be zipped and then skipped as "done" in Colab. Colab rebuilds them on its GPU in well under an hour.
"""
from __future__ import annotations
import argparse
import zipfile
from pathlib import Path

from musicdna.paths import PROJECT_ROOT, RESEARCH_OUTPUT_DIR

CODE = ['musicdna', 'configs', 'requirements.txt', 'notebooks/03_colab_gpu.ipynb']
DATA = 'data/genre_mix'
SKIP_PARTS = {'__pycache__', 'audio_cache', 'cache'}


def files(include_audio: bool, include_stems: bool = False) -> list[Path]:
    out: list[Path] = []
    for item in CODE:
        path = PROJECT_ROOT / item
        out += [path] if path.is_file() else [p for p in path.rglob('*') if p.is_file()]
    data = PROJECT_ROOT / DATA
    for path in data.rglob('*'):
        if not path.is_file() or (not include_audio and 'audio' in path.relative_to(data).parts[:1]):
            continue
        if path.suffix == '.flac' and not include_stems:
            continue
        out.append(path)
    return [p for p in out if not SKIP_PARTS & set(p.parts) and p.suffix != '.pyc']


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--no-audio', action='store_true')
    parser.add_argument('--with-stems', action='store_true')
    arguments = parser.parse_args()
    RESEARCH_OUTPUT_DIR.mkdir(exist_ok=True)
    target = RESEARCH_OUTPUT_DIR / 'music_dna_colab.zip'
    chosen = files(include_audio=not arguments.no_audio, include_stems=arguments.with_stems)
    # Audio (m4a) and features (npy/flac) barely compress, so store them as they are.
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_STORED) as bundle:
        for path in chosen:
            bundle.write(path, path.relative_to(PROJECT_ROOT))
    print(f'{len(chosen)} files, {target.stat().st_size / 1e9:.2f} GB -> {target}')


if __name__ == '__main__':
    main()
