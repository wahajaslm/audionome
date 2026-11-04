"""Unsupervised 2-D visual projection for compatible audio embedding vectors.

Uses PaCMAP (Apache-2.0), which keeps both local neighbours and global layout, with a fixed seed
so the map is reproducible. Falls back to PCA for small point sets where neighbour graphs are unstable.

Projection is descriptive, never an emotion classifier or calibrated similarity measure.
This code receives embeddings only, not audio, and retains nothing after the request.
"""
from __future__ import annotations
import threading

import numpy as np

# CRASH FIX - PaCMAP runs Numba code with parallel=True. Numba's only threading layer here
# ("workqueue"; tbb/omp are not installed) aborts the whole process when two threads use it at
# once: "Numba workqueue threading layer is terminating: Concurrent access has been detected".
# The service runs requests in threads, so the studio building a song map while an analysis
# built another killed the service and the studio stalled. One PaCMAP at a time; each takes
# well under a second, so nothing waits noticeably.
_PACMAP_LOCK = threading.Lock()


class EmbeddingProjector:
    """Projects high-dimensional audio embedding vectors to 2D, 3D, or N-D coordinates for visualization."""

    def __init__(self, min_vectors: int = 3, max_vectors: int = 500, pacmap_min_vectors: int = 20) -> None:
        self.min_vectors = min_vectors
        self.max_vectors = max_vectors
        self.pacmap_min_vectors = pacmap_min_vectors
        self.last_method = 'PCA'

    def project_to_2d(self, vectors: list[list[float]]) -> list[list[float]]:
        """Projects high-dimensional vectors to 2D coordinates for scatter visualization."""
        return self.project_multidimensional(vectors, n_components=2)

    def project_multidimensional(
        self, vectors: list[list[float]], n_components: int = 3
    ) -> list[list[float]]:
        """Validates dimensionality, centers vectors, and projects with PaCMAP (or PCA) into [0, 1] range."""
        num_vectors = len(vectors)
        if not (self.min_vectors <= num_vectors <= self.max_vectors):
            raise ValueError(f'Select between {self.min_vectors} and {self.max_vectors} embedding points')

        vector_matrix = np.asarray(vectors, dtype=np.float64)
        if vector_matrix.ndim != 2 or not (2 <= vector_matrix.shape[1] <= 8192) or not np.isfinite(vector_matrix).all():
            raise ValueError('All vectors must have the same dimension, be finite, and have at least 2 dimensions')

        k = max(2, min(n_components, num_vectors, vector_matrix.shape[1]))
        centered_matrix = vector_matrix - vector_matrix.mean(axis=0, keepdims=True)
        if np.max(np.abs(centered_matrix)) < 1e-10:
            return [[0.5] * k for _ in range(num_vectors)]

        if num_vectors >= self.pacmap_min_vectors:
            import pacmap
            reducer = pacmap.PaCMAP(n_components=k, n_neighbors=min(10, num_vectors - 1), random_state=0)
            with _PACMAP_LOCK:
                projected = reducer.fit_transform(centered_matrix, init='pca')
            self.last_method = 'PaCMAP'
        else:
            from sklearn.decomposition import PCA
            projected = PCA(n_components=k).fit_transform(centered_matrix)
            self.last_method = 'PCA'
        projected = projected - projected.mean(axis=0, keepdims=True)
        coord_scale = np.max(np.abs(projected)) or 1.0
        normalized = np.clip(projected / (2.0 * coord_scale) + 0.5, 0.0, 1.0)
        return np.round(normalized, 5).tolist()

    def get_explained_variance_ratio(self, vectors: list[list[float]], n_components: int = 10) -> list[float]:
        """Returns the explained variance ratio for top principal components."""
        vector_matrix = np.asarray(vectors, dtype=np.float64)
        k = max(1, min(n_components, len(vectors), vector_matrix.shape[1]))
        from sklearn.decomposition import PCA
        pca = PCA(n_components=k)
        pca.fit(vector_matrix)
        return [round(float(x), 5) for x in pca.explained_variance_ratio_]


_DEFAULT_PROJECTOR = EmbeddingProjector()


def project_to_2d(vectors: list[list[float]]) -> list[list[float]]:
    """Top-level functional interface for EmbeddingProjector.project_to_2d."""
    return _DEFAULT_PROJECTOR.project_to_2d(vectors)


def project_multidimensional(vectors: list[list[float]], n_components: int = 3) -> list[list[float]]:
    """Top-level functional interface for EmbeddingProjector.project_multidimensional."""
    return _DEFAULT_PROJECTOR.project_multidimensional(vectors, n_components=n_components)


__all__ = [
    'EmbeddingProjector',
    '_DEFAULT_PROJECTOR',
    'project_to_2d',
    'project_multidimensional',
]
