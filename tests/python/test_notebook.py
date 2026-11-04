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
