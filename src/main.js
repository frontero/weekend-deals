import { createApp } from 'vue';
import AdminPage from './AdminPage.vue';
import App from './App.vue';
import './style.css';

// One page more needs no router: the admin page has an address of its own.
createApp(window.location.pathname.startsWith('/beheer') ? AdminPage : App).mount('#app');
