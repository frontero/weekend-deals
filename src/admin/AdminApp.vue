<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '../components/Icon.vue';
import { useTheme } from '../composables/useTheme.js';
import AdminNav from './components/AdminNav.vue';
import FilterBar from './components/FilterBar.vue';
import { useAdmin } from './useAdmin.js';

const route = useRoute();
const { state } = useAdmin();
const { isDark, toggle: toggleTheme } = useTheme();
const menu = ref(null);

const parent = computed(() =>
  ({ parks: { to: '/beheer/parken', label: 'Parken' }, weekends: { to: '/beheer/weekenden', label: 'Weekenden' } })[route.meta.parent] ?? null,
);
// Pages about the rounds and the price watch cover every size and their own period.
const filtered = computed(() => route.meta.filters !== false);

const openMenu = () => menu.value.showModal();
const closeMenu = () => menu.value?.close();
watch(() => route.fullPath, closeMenu);
</script>

<template>
  <div class="min-h-dvh bg-plane lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
    <aside class="sticky top-0 hidden h-dvh border-r border-line bg-surface lg:block">
      <AdminNav />
    </aside>

    <div class="min-w-0">
      <header class="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div class="mx-auto flex max-w-[92rem] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            class="grid size-9 place-items-center rounded-full ring-1 ring-line transition hover:bg-hover lg:hidden"
            aria-label="Menu"
            @click="openMenu"
          >
            <Icon name="menu" class="size-5" />
          </button>
          <div class="min-w-0 flex-1">
            <RouterLink v-if="parent" :to="parent.to" class="text-xs font-medium text-accent hover:underline">
              {{ parent.label }}
            </RouterLink>
            <!-- A detail page names its park or weekend in its own heading. -->
            <component :is="parent ? 'p' : 'h1'" class="truncate text-lg font-semibold tracking-tight">
              {{ route.meta.title }}
            </component>
          </div>
          <FilterBar
            v-if="filtered && state === 'ready'"
            :with-range="route.meta.range !== false"
            class="order-last w-full sm:order-none sm:w-auto"
          />
          <button
            type="button"
            class="grid size-9 place-items-center rounded-full ring-1 ring-line transition hover:bg-hover"
            title="Donkere weergave"
            aria-label="Donkere weergave"
            :aria-pressed="isDark"
            @click="toggleTheme"
          >
            <Icon :name="isDark ? 'sun' : 'moon'" class="size-4" />
          </button>
        </div>
      </header>

      <main class="mx-auto max-w-[92rem] px-4 py-6 sm:px-6 sm:py-8">
        <p v-if="state === 'loading'" class="text-ink-secondary" role="status">Laden…</p>
        <p
          v-else-if="state === 'forbidden'"
          class="flex items-start gap-2 rounded-xl bg-warning-wash px-4 py-3 text-sm text-warning-ink"
          role="status"
        >
          <Icon name="warning" class="mt-px size-4" />
          Deze pagina is alleen voor beheerders.
        </p>
        <p
          v-else-if="state === 'failed'"
          class="flex items-start gap-2 rounded-xl bg-warning-wash px-4 py-3 text-sm text-warning-ink"
          role="status"
        >
          <Icon name="warning" class="mt-px size-4" />
          De gegevens konden niet worden geladen. De pagina probeert het over een minuut opnieuw.
        </p>
        <RouterView v-else />
      </main>
    </div>

    <dialog
      ref="menu"
      class="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] bg-surface p-0 text-ink shadow-2xl lg:hidden"
      aria-label="Menu"
      @click.self="closeMenu"
    >
      <AdminNav @navigate="closeMenu" />
    </dialog>
  </div>
</template>
