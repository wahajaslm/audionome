"""Use Hugging Face models that are already downloaded without asking the Hub first.

By default the Hugging Face libraries check online for a newer version on every load, even when the
model is on disk. That check is what prints "You are sending unauthenticated requests to the HF Hub",
once per song for Demucs. When every model a step needs is already downloaded, these helpers load it
straight from the local cache (~/.cache/huggingface/hub). A model that is missing is still downloaded.

Example: CLAP, MERT and htdemucs are cached -> no network check, no notice. Delete MERT's folder ->
the next MERT load downloads it as before.
"""
from __future__ import annotations
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


class LocalModels:
    @staticmethod
    def is_downloaded(repo_id: str) -> bool:
        """True when the Hugging Face cache holds a snapshot of `repo_id` (e.g. 'm-a-p/MERT-v1-95M')."""
        from huggingface_hub import constants
        snapshots = Path(constants.HF_HUB_CACHE) / ('models--' + repo_id.replace('/', '--')) / 'snapshots'
        return snapshots.is_dir() and any(snapshots.iterdir())

    @classmethod
    @contextmanager
    def offline_when_downloaded(cls, *repo_ids: str) -> Iterator[bool]:
        """Inside this block, the Hub is not contacted if all `repo_ids` are cached. Yields whether it is offline."""
        if not all(cls.is_downloaded(repo) for repo in repo_ids):
            yield False
            return
        from huggingface_hub import constants
        previous_flag, previous_env = constants.HF_HUB_OFFLINE, os.environ.get('HF_HUB_OFFLINE')
        constants.HF_HUB_OFFLINE = True
        os.environ['HF_HUB_OFFLINE'] = '1'
        try:
            yield True
        finally:
            constants.HF_HUB_OFFLINE = previous_flag
            if previous_env is None:
                os.environ.pop('HF_HUB_OFFLINE', None)
            else:
                os.environ['HF_HUB_OFFLINE'] = previous_env
