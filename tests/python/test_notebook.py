"""The exploration notebook must stay in step with the package: no stale imports, no saved errors."""
import ast
import importlib
import json
from pathlib import Path

NOTEBOOK = Path(__file__).resolve().parents[2] / 'notebooks' / '01_interactive_audio_exploration.ipynb'


def code_cells() -> list[dict]:
    return [cell for cell in json.loads(NOTEBOOK.read_text(encoding='utf8'))['cells'] if cell['cell_type'] == 'code']


def test_every_musicdna_import_in_the_notebook_exists() -> None:
    for cell in code_cells():
        source = '\n'.join(line for line in ''.join(cell['source']).splitlines()
                           if not line.lstrip().startswith(('%', '!')))
        for node in ast.walk(ast.parse(source)):
            if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith('musicdna'):
                module = importlib.import_module(node.module)
                for alias in node.names:
                    assert hasattr(module, alias.name), f'{node.module}.{alias.name} no longer exists'


def test_saved_notebook_has_no_error_outputs() -> None:
    for cell in code_cells():
        assert not [o for o in cell.get('outputs', []) if o['output_type'] == 'error']


def test_notebook_was_run_against_the_current_pipeline() -> None:
    """The saved notebook prints the pipeline fingerprint when it runs. If stages, experiment systems
    or config defaults changed since, re-run it:
        .venv/bin/jupyter nbconvert --to notebook --execute --inplace notebooks/01_interactive_audio_exploration.ipynb
    """
    from musicdna.experiments.pipeline import fingerprint_hash
    saved = [line.split(':', 1)[1].strip()
             for cell in code_cells() for output in cell.get('outputs', []) if output['output_type'] == 'stream'
             for line in ''.join(output['text']).splitlines() if line.startswith('pipeline fingerprint:')]
    assert saved, 'notebook has no saved pipeline fingerprint; re-run it'
    assert saved[0] == fingerprint_hash(), (
        f'notebook was run against pipeline {saved[0]}, code is now {fingerprint_hash()}: re-run the notebook')


def test_notebook_covers_every_stage_and_experiment() -> None:
    from musicdna.corpus.feature_store import STAGES
    text = NOTEBOOK.read_text(encoding='utf8')
    for stage in STAGES.values():
        assert type(stage).__name__ in text or f"'{stage.name}'" in text or stage.name.upper() in text, \
            f'notebook does not cover the {stage.name} stage'
    for name in ('R01Experiment', 'R02Experiment', 'ResearchPipeline', 'SingingGate', 'IntonationAnalyzer'):
        assert name in text, f'notebook does not cover {name}'
