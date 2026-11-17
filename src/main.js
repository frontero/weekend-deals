import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

// The admin pages load separately, with their charts, so the deals page stays as light as it was.
if (window.location.pathname.startsWith('/beheer')) {
  import('./admin/main.js').then(({ mountAdmin }) => mountAdmin('#app'));
} else {
  // An unknown address falls back to this page; search engines should not list it as a page of its own.
  if (window.location.pathname !== '/') document.head.append(Object.assign(document.createElement('meta'), { name: 'robots', content: 'noindex' }));
  createApp(App).mount('#app');
}
