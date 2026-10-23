import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

// The admin pages load separately, with their charts, so the deals page stays as light as it was.
if (window.location.pathname.startsWith('/beheer')) {
  import('./admin/main.js').then(({ mountAdmin }) => mountAdmin('#app'));
} else {
  createApp(App).mount('#app');
}
