import { createApp } from 'vue';
import AdminApp from './AdminApp.vue';
import { router } from './router.js';

export function mountAdmin(selector) {
  createApp(AdminApp).use(router).mount(selector);
}
