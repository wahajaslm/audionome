"""PLAYLIST IMPORT: expand_playlist() lists a playlist's songs from one flat yt-dlp extraction."""
from musicdna.service import streaming


class FakeYDL:
    """Stands in for yt_dlp.YoutubeDL and returns a canned extraction (no network)."""
    info: dict = {}

    def __init__(self, opts):
        assert opts['extract_flat'] == 'in_playlist'
        assert opts['playlistend'] == streaming.PLAYLIST_LIMIT

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def extract_info(self, url, download=False):
        assert download is False
        return self.info


def test_playlist_entries_get_stream_ids_and_skip_unavailable(monkeypatch):
    FakeYDL.info = {'_type': 'playlist', 'title': 'Road trip', 'uploader': 'Me', 'entries': [
        {'id': 'abc', 'title': 'Song A', 'url': 'https://www.youtube.com/watch?v=abc', 'duration': 200, 'channel': 'Band A'},
        {'id': 'def', 'title': 'Song B', 'url': 'def'},  # bare id: rebuilt as a watch link
        {'id': 'gone', 'title': '[Private video]', 'url': 'https://www.youtube.com/watch?v=gone'},
        {'id': 'abc', 'title': 'Song A again', 'url': 'https://www.youtube.com/watch?v=abc'},  # duplicate
        None,
    ]}
    monkeypatch.setattr(streaming.yt_dlp, 'YoutubeDL', FakeYDL)
    out = streaming.expand_playlist('https://www.youtube.com/playlist?list=PL1')
    assert out['title'] == 'Road trip'
    assert [e['id'] for e in out['entries']] == ['youtube-abc', 'youtube-def']
    assert out['entries'][0]['artist'] == 'Band A' and out['entries'][0]['durationSec'] == 200.0
    assert out['entries'][1]['originalUrl'] == 'https://www.youtube.com/watch?v=def'
    assert out['entries'][1]['artist'] == 'Me' and out['entries'][1]['durationSec'] == 0.0


def test_single_song_and_direct_links_have_no_entries(monkeypatch):
    FakeYDL.info = {'id': 'abc', 'title': 'One song'}
    monkeypatch.setattr(streaming.yt_dlp, 'YoutubeDL', FakeYDL)
    assert streaming.expand_playlist('https://youtu.be/abc')['entries'] == []
    assert streaming.expand_playlist('https://example.com/a.mp3')['entries'] == []
