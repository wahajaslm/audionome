import { createApp } from 'vue';
import { createPinia } from 'pinia';
// Design system rule: "Add tokens.css to your app and use only its variables, never raw values."
// Imported once here so every component can use e.g. var(--accent), var(--space-4) and the
// text-style classes (.page-title, .body, .label, .caption …).
import './tokens.css';
import App from './App.vue';
import { router } from './router';

createApp(App).use(createPinia()).use(router).mount('#app');
