import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import NowPlayingView from '../features/now-playing/NowPlayingView.vue';
import LibraryView from '../features/library/LibraryView.vue';
import MomentsView from '../features/moments/MomentsView.vue';
import MusicDnaView from '../features/dna/MusicDnaView.vue';
import StreamView from '../features/stream/StreamView.vue';
import ClassicScreen from '../features/classic/ClassicScreen.vue';

/**
 * One route per screen, hash history (works from any static host and from file paths).
 * Discover, Settings and Admin still render a pointer to the classic player (phase 2).
 */
export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'now-playing', component: NowPlayingView },
  { path: '/library', name: 'library', component: LibraryView },
  { path: '/moments', name: 'moments', component: MomentsView },
  { path: '/discover', name: 'discover', component: ClassicScreen, props: { title: 'Discover', view: 'discover' } },
  { path: '/dna', name: 'dna', component: MusicDnaView },
  { path: '/settings', name: 'settings', component: ClassicScreen, props: { title: 'Settings', view: 'settings' } },
  { path: '/admin', name: 'admin', component: ClassicScreen, props: { title: 'Feature Analysis', view: 'admin' } },
  { path: '/stream', name: 'stream', component: StreamView },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({ history: createWebHashHistory(), routes });
