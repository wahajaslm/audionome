"""Genre mix corpus: Eastern, Western and house songs, each genre split into popularity tiers.

For every genre, YouTube search results are collected, filtered to single songs (no hour-long
DJ mixes or compilations), looked up once more for their like count, then split into four tiers
measured within that genre:

    top          most viewed
    middle       closest to the genre's median view count
    low          bottom third by views, lowest like/view ratio
    underrated   bottom third by views, highest like/view ratio

Songs under MIN_VIEWS are left out first: search results include many uploads with a few
dozen views (auto-generated "Single 17" channels), which are noise, not low-rated music.

Each song also keeps YouTube's "Most replayed" curve when the video has one: about 100 segments,
each scaled so the most replayed one is 1.0. It is an average over all viewers, with no viewer
identities, and is the training target for the shared moment-interest model. It is read from the
same page lookup as the like count, so it costs no extra requests, and without sign-in cookies.

Audio is research-only and never committed or redistributed (rights stay 'unconfirmed').
Generic loading, saving, download and checksums live in `musicdna.corpus.manifest`.

    python -m musicdna.corpus.genre_mix select --per-tier 2
    python -m musicdna.corpus.genre_mix replay      # curves for songs selected before replay capture
    python -m musicdna.corpus.genre_mix download
    python -m musicdna.corpus.genre_mix verify
"""
from __future__ import annotations
import argparse
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from statistics import median
from typing import Any

from musicdna.corpus.manifest import CorpusEntry, CorpusManifest
from musicdna.paths import PROJECT_ROOT

GENRE_MIX_DIR = PROJECT_ROOT / 'data' / 'genre_mix'
MANIFEST_PATH = GENRE_MIX_DIR / 'manifest.json'
AUDIO_DIRECTORY = GENRE_MIX_DIR / 'audio'
LIKES_CACHE = GENRE_MIX_DIR / 'likes_cache.json'
# video id -> replay curve, or None when the lookup found no "Most replayed" graph (too few views).
REPLAY_CACHE = GENRE_MIX_DIR / 'replay_cache.json'
OPENING_SEC = 15.0  # replay summaries ignore the start of a video, where every view begins
MANIFEST_VERSION = 1
# RATE LIMIT FIX - 4 parallel like lookups for ~60 songs per genre made YouTube answer "Sign in
# to confirm you're not a bot" after two genres, and every later song was silently dropped
# ("0 songs found"). Lookups now run one at a time with a pause, are saved to LIKES_CACHE so a
# re-run only looks up new songs, and a block stops the run with a clear message.
LOOKUP_PAUSE_SEC = 2.0

TIERS = ('top', 'middle', 'low', 'underrated')

# genre -> (region, search queries). Several queries per genre, so the pool reaches past the
# handful of hits YouTube ranks first and contains less-viewed songs too.
GENRES: dict[str, tuple[str, list[str]]] = {
    'bollywood':     ('eastern', ['bollywood song official audio', 'new bollywood song', 'hindi indie song']),
    'punjabi':       ('eastern', ['punjabi song official audio', 'new punjabi song', 'punjabi indie song']),
    'qawwali_sufi':  ('eastern', ['qawwali', 'sufi kalam song', 'new qawwali']),
    'pakistani_pop': ('eastern', ['pakistani pop song official', 'new pakistani song', 'urdu indie song']),
    'arabic_pop':    ('eastern', ['arabic pop song official audio', 'new arabic song', 'arabic indie song']),
    'turkish_pop':   ('eastern', ['turkish pop song official audio', 'yeni türkçe pop şarkı', 'turkish indie song']),
    # K-pop is East Asian pop with Western production and harmony, not part of the Eastern
    # (subcontinent, Arabic, Turkish) traditions the research is about; it was in 'eastern' until
    # 2026-11-05 and pulled that group's scores down (pairwise accuracy ~0.45, below random).
    'kpop':          ('east_asian', ['kpop official audio', 'new kpop song', 'korean indie song']),
    'pop':           ('western', ['pop song official audio', 'new pop song', 'indie pop song']),
    'rock':          ('western', ['rock song official audio', 'new rock song', 'indie rock song']),
    'hiphop':        ('western', ['hip hop song official audio', 'new rap song', 'underground hip hop song']),
    'jazz':          ('western', ['jazz song', 'new jazz single', 'modern jazz track']),
    'rnb':           ('western', ['r&b song official audio', 'new r&b song', 'indie r&b song']),
    'deep_house':    ('house',   ['deep house original mix', 'deep house track', 'deep house underground track']),
    'afro_house':    ('house',   ['afro house original mix', 'afro house track', 'afro house underground track']),
    'tech_house':    ('house',   ['tech house original mix', 'tech house track', 'tech house underground track']),
}

SEARCH_RESULTS_PER_QUERY = 40
MIN_DURATION_SEC = 120
MAX_DURATION_SEC = 900
# Below this, views and like ratios are noise (spam channels, uploads nobody heard).
MIN_VIEWS = 1_000
# Compilations, DJ sets and non-song uploads. "Original mix" / "extended mix" are single house
# tracks and are kept; "mix 2025", "dj mix", "megamix" are sets and are dropped.
EXCLUDED_TITLE_PATTERN = re.compile(
    r'\b(dj mix|dj set|megamix|mashup|non ?stop|jukebox|full album|compilation|playlist|'
    r'hours?|best of|top \d+|mix 20\d\d|20\d\d mix|mixtape|live|reaction|lyrics? video|'
    r'slowed|reverb|sped up|8d|karaoke|instrumental cover|cover|tutorial|shorts?)\b',
    re.IGNORECASE,
)


@dataclass(kw_only=True)
class GenreMixEntry(CorpusEntry):
    """A song with its genre, region and popularity tier (measured within its genre)."""
    genre: str
    region: str           # eastern, western, house, east_asian
    tier: str             # top, middle, low, underrated
    channel: str
    view_count: int
    like_count: int
    query: str
    # [start_sec, end_sec, value] per segment, value 0-1 within this video; None = no graph or not looked up.
    replay_curve: list[list[float]] | None = None

    @property
    def like_ratio(self) -> float:
        return self.like_count / self.view_count if self.view_count else 0.0

    @property
    def label(self) -> str:
        return f'{self.genre:<13} {self.tier:<10} {self.song}'


@dataclass
class GenreMixManifest(CorpusManifest):
    entry_class = GenreMixEntry

    @classmethod
    def load(cls, path=MANIFEST_PATH):  # type: ignore[override]
        return super().load(path)

    def save(self, path=MANIFEST_PATH) -> None:  # type: ignore[override]
        super().save(path)

    def download(self, audio_directory=AUDIO_DIRECTORY, ydl_options=None) -> list[str]:  # type: ignore[override]
        return super().download(audio_directory, ydl_options)

    def verify(self, audio_directory=AUDIO_DIRECTORY) -> list[str]:  # type: ignore[override]
        return super().verify(audio_directory)


def is_single_song(title: str, duration_sec: Any) -> bool:
    if not isinstance(duration_sec, (int, float)) or not MIN_DURATION_SEC <= duration_sec <= MAX_DURATION_SEC:
        return False
    return not EXCLUDED_TITLE_PATTERN.search(title)


def split_title(title: str, channel: str) -> tuple[str, str]:
    """'Artist - Song (Official Audio)' -> ('Song', 'Artist'); otherwise the title and the channel."""
    clean = re.sub(r'\s*[\(\[][^)\]]*(official|audio|video|lyric|visuali[sz]er|hd|4k)[^)\]]*[\)\]]', '', title, flags=re.IGNORECASE).strip()
    if ' - ' in clean:
        artist, song = clean.split(' - ', 1)
        return song.strip(), artist.strip()
    return clean, channel


def replay_curve(info: dict[str, Any]) -> list[list[float]] | None:
    """YouTube's "Most replayed" graph from a yt-dlp video lookup, or None when the video has none.

    Example (Pasoori): [[0.0, 2.77, 0.733], ...], highest near 0:55 where the chorus hook comes in.
    The high start and the slow fall are viewers arriving and dropping off (Medusa's curve is 1.0 at
    0:00, its real peak is 0.92 at 0:57), so models must compare segments within a song and correct
    for position, not read values as enjoyment.
    """
    markers = info.get('heatmap') or []
    curve = [[round(float(m['start_time']), 2), round(float(m['end_time']), 2), round(float(m['value']), 4)]
             for m in markers if m.get('start_time') is not None and m.get('value') is not None]
    return curve or None


def assign_tiers(pool: list[GenreMixEntry], per_tier: int) -> list[GenreMixEntry]:
    """Picks `per_tier` songs for each tier from one genre's pool; a song is in at most one tier.

    Example (views, likes): top = the most viewed; in the bottom third, a 9,000-view song with
    470 likes (5.2%) is underrated and a 32,000-view song with 140 likes (0.4%) is low.
    """
    by_views = sorted((e for e in pool if e.view_count >= MIN_VIEWS), key=lambda e: e.view_count, reverse=True)
    if not by_views:
        return []
    mid = median(e.view_count for e in by_views)
    bottom = by_views[len(by_views) - max(1, len(by_views) // 3):]
    used: set[str] = set()

    def take(candidates: list[GenreMixEntry], tier: str) -> list[GenreMixEntry]:
        out = []
        for e in candidates:
            if len(out) == per_tier:
                break
            if e.video_id in used:
                continue
            used.add(e.video_id)
            e.tier = tier
            out.append(e)
        return out

    picked = take(by_views, 'top')
    picked += take(sorted(bottom, key=lambda e: e.like_ratio, reverse=True), 'underrated')
    picked += take(sorted(bottom, key=lambda e: e.like_ratio), 'low')
    picked += take(sorted(by_views, key=lambda e: abs(e.view_count - mid)), 'middle')
    return sorted(picked, key=lambda e: TIERS.index(e.tier))


class YouTubeBlocked(RuntimeError):
    """YouTube asked to sign in ("not a bot"): stop instead of dropping every song."""


class GenreMixCatalog:
    """Searches YouTube per genre, keeps single songs, looks up likes and assigns tiers."""

    def __init__(self, ydl_options: dict[str, Any] | None = None) -> None:
        # Extra yt-dlp options, e.g. {'cookiesfrombrowser': ('chrome',)} (--cookies-from-browser).
        self.ydl_options = ydl_options or {}
        self.likes: dict[str, int | None] = json.loads(LIKES_CACHE.read_text()) if LIKES_CACHE.exists() else {}
        self.replays: dict[str, list[list[float]] | None] = (
            json.loads(REPLAY_CACHE.read_text()) if REPLAY_CACHE.exists() else {})

    def build_manifest(self, per_tier: int, genres: list[str] | None = None) -> GenreMixManifest:
        names = genres or list(GENRES)
        entries: list[GenreMixEntry] = []
        for name in names:
            pool = self.genre_pool(name)
            chosen = assign_tiers(pool, per_tier)
            print(f'{name}: {len(pool)} songs found, {len(chosen)} chosen', flush=True)
            entries += chosen
        return GenreMixManifest(
            manifest_version=MANIFEST_VERSION,
            created_at=datetime.now(timezone.utc).isoformat(timespec='seconds'),
            selection={
                'per_tier': per_tier, 'tiers': list(TIERS), 'genres': {n: GENRES[n][0] for n in names},
                'ranking': 'YouTube view_count and like_count at listing time, within each genre',
                'duration_sec': [MIN_DURATION_SEC, MAX_DURATION_SEC],
                'replay_curve': 'YouTube "Most replayed" graph (yt-dlp heatmap), all viewers averaged, '
                                'scaled to 1.0 at the most replayed segment of each video',
            },
            entries=entries,
        )

    def genre_pool(self, name: str) -> list[GenreMixEntry]:
        region, queries = GENRES[name]
        found: dict[str, tuple[dict[str, Any], str]] = {}
        seen_titles: set[str] = set()
        for query in queries:
            for video in self.search(query):
                title = str(video.get('title') or '')
                key = re.sub(r'\W+', ' ', title.lower()).strip()
                if video.get('id') in found or key in seen_titles or not is_single_song(title, video.get('duration')):
                    continue
                seen_titles.add(key)
                found[video['id']] = (video, query)
        # Likes are not in search results: one lookup per new song, one at a time (RATE LIMIT FIX).
        # The same lookup also returns the replay curve.
        for video_id in found:
            if video_id not in self.likes:
                self.look_up(video_id)
                time.sleep(LOOKUP_PAUSE_SEC)
        likes = {video_id: self.likes[video_id] for video_id in found}
        entries = []
        for video_id, (video, query) in found.items():
            if likes[video_id] is None:
                continue  # removed, private or region-blocked since the search
            song, artists = split_title(str(video['title']), str(video.get('channel') or ''))
            entries.append(GenreMixEntry(
                video_id=video_id, title=str(video['title']), song=song, artists=artists,
                duration_sec=int(video['duration']), url=f'https://www.youtube.com/watch?v={video_id}',
                genre=name, region=region, tier='', channel=str(video.get('channel') or ''),
                view_count=int(video.get('view_count') or 0), like_count=int(likes[video_id]), query=query,
                replay_curve=self.replays.get(video_id),
            ))
        return entries

    def add_replay_curves(self, manifest: GenreMixManifest) -> None:
        """Fills `replay_curve` for entries selected before replay capture, one lookup at a time."""
        for entry in manifest.entries:
            assert isinstance(entry, GenreMixEntry)
            if entry.video_id not in self.replays:
                self.look_up(entry.video_id)
                time.sleep(LOOKUP_PAUSE_SEC)
            entry.replay_curve = self.replays.get(entry.video_id)

    def search(self, query: str) -> list[dict[str, Any]]:
        import yt_dlp
        options = {'extract_flat': 'in_playlist', 'quiet': True, 'no_warnings': True, **self.ydl_options}
        with yt_dlp.YoutubeDL(options) as client:
            info = client.extract_info(f'ytsearch{SEARCH_RESULTS_PER_QUERY}:{query}', download=False)
        return [e for e in info.get('entries') or [] if e and e.get('id')]

    def look_up(self, video_id: str) -> None:
        """Caches the like count (None when the video is gone: private, removed, region-blocked)
        and the replay curve (None when YouTube shows no graph) from one page lookup."""
        import yt_dlp
        try:
            options = {'quiet': True, 'no_warnings': True, 'skip_download': True, **self.ydl_options}
            with yt_dlp.YoutubeDL(options) as client:
                info = client.extract_info(f'https://www.youtube.com/watch?v={video_id}', download=False)
            self.likes[video_id], self.replays[video_id] = int(info.get('like_count') or 0), replay_curve(info)
        except Exception as error:
            if 'not a bot' in str(error) or 'Sign in to confirm' in str(error):
                raise YouTubeBlocked(str(error)) from error
            self.likes[video_id], self.replays[video_id] = None, None
        LIKES_CACHE.parent.mkdir(parents=True, exist_ok=True)
        LIKES_CACHE.write_text(json.dumps(self.likes))
        REPLAY_CACHE.write_text(json.dumps(self.replays))


def main() -> None:
    parser = argparse.ArgumentParser(description='Genre mix research corpus (Eastern, Western, house)')
    commands = parser.add_subparsers(dest='command', required=True)
    select_parser = commands.add_parser('select', help='Build the manifest from YouTube search results')
    select_parser.add_argument('--per-tier', type=int, default=2)
    select_parser.add_argument('--genres', nargs='*', choices=list(GENRES), help='Default: all genres')
    # No --cookies-from-browser here: replay curves are public, so no account is ever linked to them.
    commands.add_parser('replay', help='Add "Most replayed" curves to manifest entries that lack them')
    download_parser = commands.add_parser('download', help='Fetch audio for every manifest entry')
    for sub in (select_parser, download_parser):
        sub.add_argument('--cookies-from-browser', metavar='BROWSER',
                         help="Use this browser's YouTube sign-in (chrome, safari, firefox, ...) if YouTube blocks requests")
    commands.add_parser('verify', help='Check every file exists and matches its checksum')
    arguments = parser.parse_args()

    browser = getattr(arguments, 'cookies_from_browser', None)
    ydl_options = {'cookiesfrombrowser': (browser,)} if browser else {}
    if arguments.command == 'select':
        try:
            manifest = GenreMixCatalog(ydl_options).build_manifest(arguments.per_tier, arguments.genres)
        except YouTubeBlocked:
            raise SystemExit('YouTube is blocking requests ("not a bot"). Lookups done so far are saved in '
                             f'{LIKES_CACHE}. Wait a few hours, or re-run with --cookies-from-browser chrome.')
        manifest.save()
        for e in manifest.entries:
            assert isinstance(e, GenreMixEntry)
            print(f'{e.region:<8} {e.label}  {e.view_count:>13,} views  {e.like_ratio:6.2%} likes')
        print(f'{len(manifest.entries)} songs -> {MANIFEST_PATH}')
    elif arguments.command == 'replay':
        manifest = GenreMixManifest.load()
        try:
            GenreMixCatalog().add_replay_curves(manifest)
        except YouTubeBlocked:
            raise SystemExit(f'YouTube is blocking requests ("not a bot"). Curves so far are saved in {REPLAY_CACHE}. '
                             'Wait a few hours and re-run.')
        manifest.save()
        with_curve = 0
        for e in manifest.entries:
            assert isinstance(e, GenreMixEntry)
            if e.replay_curve:
                with_curve += 1
                # Skip the opening: everyone starts the video there (Medusa: 1.0 at 0:00, real peak 0:57).
                after_opening = [s for s in e.replay_curve if s[0] >= OPENING_SEC] or e.replay_curve
                peak = max(after_opening, key=lambda segment: segment[2])
                print(f'{e.label}  peak {int(peak[0]) // 60}:{int(peak[0]) % 60:02d} ({peak[2]:.2f})')
            else:
                print(f'{e.label}  no replay graph')
        print(f'{with_curve}/{len(manifest.entries)} songs have a replay curve -> {MANIFEST_PATH}')
    elif arguments.command == 'download':
        manifest = GenreMixManifest.load()
        failures = manifest.download(ydl_options=ydl_options)
        manifest.save()
        print('\n'.join(failures) or 'All downloads complete.')
    else:
        problems = GenreMixManifest.load().verify()
        print('\n'.join(problems) or 'All files present and checksums match.')
        raise SystemExit(1 if problems else 0)


if __name__ == '__main__':
    main()
