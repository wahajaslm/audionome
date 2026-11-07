import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import NowPlayingView from '../features/now-playing/NowPlayingView.vue';
import HomeView from '../features/home/HomeView.vue';
import LibraryView from '../features/library/LibraryView.vue';
import MomentsView from '../features/moments/MomentsView.vue';
import DiscoverView from '../features/discover/DiscoverView.vue';
import MusicDnaView from '../features/dna/MusicDnaView.vue';
import SettingsView from '../features/settings/SettingsView.vue';
import AdminView from '../features/admin/AdminView.vue';

/**
 * One route per screen, hash history (works from any static host and from file paths).
 * Query parameters keep list filters linkable: /moments?c=1 (collection), /discover?t=2 (trait),
 * /admin?track=<id> (recording to inspect).
 * The classic player's hashes (#player, #dna, …) are redirected so old bookmarks still land.
 */
export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'now-playing', component: NowPlayingView },
  { path: '/home', name: 'home', component: HomeView },
  { path: '/library', name: 'library', component: LibraryView },
  { path: '/moments', name: 'moments', component: MomentsView },
  { path: '/discover', name: 'discover', component: DiscoverView },
  { path: '/dna', name: 'dna', component: MusicDnaView },
  { path: '/settings', name: 'settings', component: SettingsView },
  { path: '/admin', name: 'admin', component: AdminView },
  // Stream & Web was merged into Library ("Add from a link").
  { path: '/stream', redirect: '/library' },
  { path: '/player', redirect: '/' },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

// Read before createWebHashHistory(), which rewrites an empty hash to '#/' straight away.
const openedWithoutPath = !window.location.hash || window.location.hash === '#';
export const router = createRouter({ history: createWebHashHistory(), routes });

/**
 * HOME ON LAUNCH - opening the app (no #path in the address) lands on Home, the front page.
 * Before, it always opened Now playing, which always has a song loaded, so the start page was
 * never seen. A refresh keeps its page: refreshing Now playing ('#/') stays on Now playing.
 * Example: open http://localhost:5173/ → Home; open …/#/library → Library.
 */
router.beforeEach((to, from) => {
  if (openedWithoutPath && from.matched.length === 0 && to.path === '/') return '/home';
});

/**
 * SCROLL FIX - the app's scroll container is now .main-content, not the window (see App.vue),
 * so the router's scrollBehavior no longer reached it. Example: scroll down Library, open
 * Settings → Settings used to open half way down. Now each new page starts at the top.
 */
router.afterEach((to, from) => {
  if (to.path !== from.path) document.querySelector('.main-content')?.scrollTo({ top: 0 });
});
