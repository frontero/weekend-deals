import { createRouter, createWebHistory } from 'vue-router';

// The admin pages, each with its own address so a page can be bookmarked or shared between admins.
const routes = [
  { path: '/beheer', name: 'dashboard', component: () => import('./pages/DashboardPage.vue'), meta: { title: 'Dashboard' } },
  { path: '/beheer/parken', name: 'parks', component: () => import('./pages/ParksPage.vue'), meta: { title: 'Parken', range: false } },
  { path: '/beheer/parken/:code', name: 'park', component: () => import('./pages/ParkPage.vue'), meta: { title: 'Park', parent: 'parks' } },
  { path: '/beheer/weekenden', name: 'weekends', component: () => import('./pages/WeekendsPage.vue'), meta: { title: 'Weekenden' } },
  {
    path: '/beheer/weekenden/:arrival',
    name: 'weekend',
    component: () => import('./pages/WeekendPage.vue'),
    meta: { title: 'Weekend', parent: 'weekends' },
  },
  { path: '/beheer/boekmoment', name: 'booking', component: () => import('./pages/BookingPage.vue'), meta: { title: 'Boekmoment' } },
  {
    path: '/beheer/wijzigingen',
    name: 'changes',
    component: () => import('./pages/ChangesPage.vue'),
    meta: { title: 'Prijswijzigingen', filters: false },
  },
  { path: '/beheer/klikken', name: 'clicks', component: () => import('./pages/ClicksPage.vue'), meta: { title: 'Klikken', filters: false } },
  { path: '/beheer/rondes', name: 'rounds', component: () => import('./pages/RoundsPage.vue'), meta: { title: 'Prijsrondes', filters: false } },
  { path: '/beheer/:rest(.*)*', redirect: '/beheer' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => saved ?? { top: 0 },
});

router.afterEach((to) => {
  document.title = `${to.meta.title} – Beheer – Weekendje weg`;
});
