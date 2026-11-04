"""SQLite persistence repository for Music DNA intelligence service."""
from __future__ import annotations
import json
from pathlib import Path
import sqlite3
from typing import Any

from musicdna.paths import AUDIO_CACHE_DIR, DB_PATH


class AnalysisRepository:
    """Manages SQLite storage for track metadata, acoustic analyses, user moments, and ratings."""

    def __init__(self, database_path: Path = DB_PATH, cache_directory: Path = AUDIO_CACHE_DIR) -> None:
        self.database_path = database_path
        self.cache_directory = cache_directory
        self.initialize_schema()

    def get_connection(self) -> sqlite3.Connection:
        connection = sqlite3.connect(str(self.database_path))
        connection.row_factory = sqlite3.Row
        return connection

    def initialize_schema(self) -> None:
        with self.get_connection() as connection:
            connection.executescript("""
            CREATE TABLE IF NOT EXISTS tracks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                artist TEXT DEFAULT 'Your library',
                duration_sec REAL NOT NULL,
                mime_type TEXT DEFAULT 'audio/*',
                source TEXT DEFAULT 'local-file',
                added_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id TEXT NOT NULL,
                method TEXT NOT NULL,
                model_id TEXT NOT NULL,
                duration_sec REAL NOT NULL,
                analyzed_at INTEGER NOT NULL,
                segments_json TEXT NOT NULL,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
                UNIQUE(track_id, method, model_id)
            );

            CREATE TABLE IF NOT EXISTS moments (
                id TEXT PRIMARY KEY,
                track_id TEXT NOT NULL,
                start_sec REAL NOT NULL,
                end_sec REAL NOT NULL,
                feelings_json TEXT DEFAULT '[]',
                qualities_json TEXT DEFAULT '[]',
                note TEXT DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ratings (
                id TEXT PRIMARY KEY,
                track_id TEXT NOT NULL,
                start_sec REAL NOT NULL,
                end_sec REAL NOT NULL,
                value TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_analyses_track ON analyses(track_id);
            CREATE INDEX IF NOT EXISTS idx_moments_track ON moments(track_id);
            CREATE INDEX IF NOT EXISTS idx_ratings_track ON ratings(track_id);
            """)

    def save_analysis(
        self,
        track_id: str,
        analysis: dict[str, Any],
        title: str | None = None,
        artist: str | None = None
    ) -> int:
        segments_json = json.dumps(analysis.get('segments', []))
        with self.get_connection() as connection:
            if title:
                connection.execute("""
                    INSERT INTO tracks (id, title, artist, duration_sec, mime_type, source, added_at)
                    VALUES (?, ?, ?, ?, 'audio/*', 'local-file', ?)
                    ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        artist = COALESCE(excluded.artist, tracks.artist),
                        duration_sec = excluded.duration_sec
                """, (
                    track_id,
                    title,
                    artist or 'Your library',
                    analysis.get('durationSec', 0.0),
                    analysis.get('analyzedAt', 0),
                ))
            cursor = connection.cursor()
            cursor.execute("""
                INSERT INTO analyses (track_id, method, model_id, duration_sec, analyzed_at, segments_json)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(track_id, method, model_id) DO UPDATE SET
                    duration_sec = excluded.duration_sec,
                    analyzed_at = excluded.analyzed_at,
                    segments_json = excluded.segments_json
            """, (
                track_id,
                analysis.get('method', 'dsp'),
                analysis.get('modelId', 'unknown'),
                analysis.get('durationSec', 0.0),
                analysis.get('analyzedAt', 0),
                segments_json
            ))
            return cursor.lastrowid or 0

    def get_analyses(
        self,
        track_id: str | None = None,
        method: str | None = None
    ) -> list[dict[str, Any]]:
        query = """
            SELECT a.track_id, t.title, t.artist, a.method, a.model_id, a.duration_sec, a.analyzed_at, a.segments_json
            FROM analyses a
            LEFT JOIN tracks t ON a.track_id = t.id
            WHERE 1=1
        """
        parameters: list[Any] = []
        if track_id:
            query += " AND a.track_id = ?"
            parameters.append(track_id)
        if method:
            query += " AND a.method = ?"
            parameters.append(method)
        query += " ORDER BY a.analyzed_at DESC"

        with self.get_connection() as connection:
            rows = connection.execute(query, parameters).fetchall()
            results = []
            for row in rows:
                results.append({
                    'trackId': row['track_id'],
                    'title': row['title'] or row['track_id'],
                    'artist': row['artist'] or 'Your library',
                    'method': row['method'],
                    'modelId': row['model_id'],
                    'durationSec': row['duration_sec'],
                    'analyzedAt': row['analyzed_at'],
                    'segments': json.loads(row['segments_json']),
                })
            return results

    def delete_track_analyses(self, track_id: str) -> None:
        with self.get_connection() as connection:
            connection.execute("DELETE FROM analyses WHERE track_id = ?", (track_id,))
            connection.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
        if self.cache_directory.exists():
            for cache_file in self.cache_directory.glob(f'{track_id}.*'):
                cache_file.unlink(missing_ok=True)

    def sync_track(self, track: dict[str, Any]) -> None:
        with self.get_connection() as connection:
            connection.execute("""
                INSERT INTO tracks (id, title, artist, duration_sec, mime_type, source, added_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    artist = excluded.artist,
                    duration_sec = excluded.duration_sec,
                    mime_type = excluded.mime_type
            """, (
                track['id'],
                track.get('title', 'Untitled'),
                track.get('artist', 'Your library'),
                track.get('durationSec', 0.0),
                track.get('mimeType', 'audio/*'),
                track.get('source', 'local-file'),
                track.get('addedAt', 0)
            ))

    def get_database_statistics(self) -> dict[str, int]:
        with self.get_connection() as connection:
            num_tracks = connection.execute("SELECT count(*) FROM tracks").fetchone()[0]
            num_analyses = connection.execute("SELECT count(*) FROM analyses").fetchone()[0]
            num_moments = connection.execute("SELECT count(*) FROM moments").fetchone()[0]
            num_ratings = connection.execute("SELECT count(*) FROM ratings").fetchone()[0]
            return {
                'tracks': num_tracks,
                'analyses': num_analyses,
                'moments': num_moments,
                'ratings': num_ratings,
            }


_DEFAULT_REPOSITORY = AnalysisRepository()


def get_analysis(track_id: str, method: str = 'dsp', model_id: str | None = None) -> dict[str, Any] | None:
    """Top-level functional interface for AnalysisRepository.get_analysis."""
    return _DEFAULT_REPOSITORY.get_analysis(track_id, method=method, model_id=model_id)


def save_analysis(
    track_id: str, analysis: dict[str, Any], title: str | None = None, artist: str | None = None
) -> int:
    """Top-level functional interface for AnalysisRepository.save_analysis."""
    return _DEFAULT_REPOSITORY.save_analysis(track_id, analysis, title=title, artist=artist)


def list_analyses(method: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """Top-level functional interface for AnalysisRepository.list_analyses."""
    return _DEFAULT_REPOSITORY.list_analyses(method=method, limit=limit)


__all__ = [
    'DB_PATH',
    'AUDIO_CACHE_DIR',
    'AnalysisRepository',
    '_DEFAULT_REPOSITORY',
    'get_analysis',
    'save_analysis',
    'list_analyses',
]
