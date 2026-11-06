"""Turn a dataset manifest into one table sprisk can load: one row per track.

sprisk's audio steps read a table with a relative audio path column plus a root folder.
Genre, title and artist are left out: each one names the region outright, so a model could
read the answer from the text, not from the sound.

Example: the entry {"audio_file": "-2RAq5o5pwc.m4a", "region": "eastern",
"channel": "Coke Studio Pakistan"} becomes the row
"-2RAq5o5pwc,audio/-2RAq5o5pwc.m4a,eastern,Coke Studio Pakistan".
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

COLUMNS = ("video_id", "audio_path", "is_eastern", "channel")


def manifest_rows(manifest: dict) -> list[dict[str, str]]:
    """One row per entry; the target is Eastern vs the rest (48 vs 72 in genre_mix)."""
    return [
        {
            "video_id": entry["video_id"],
            "audio_path": f"audio/{entry['audio_file']}",
            "is_eastern": "eastern" if entry["region"] == "eastern" else "other",
            "channel": entry["channel"],
        }
        for entry in manifest["entries"]
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("dataset", type=Path, help="Folder holding manifest.json and audio/")
    args = parser.parse_args()
    manifest = json.loads((args.dataset / "manifest.json").read_text())
    out = args.dataset / "sprisk_table.csv"
    with out.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(manifest_rows(manifest))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
