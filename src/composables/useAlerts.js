import { ref } from 'vue';
import { request } from '../lib/api.js';

// The ntfy topic this browser's alerts go to. Whoever knows it can read the messages, so it is long and random.
const TOPIC_STORAGE_KEY = 'weekend-deals:ntfy-topic';
const TOPIC_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const newTopic = () => `weekendjeweg-${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
export const isTopic = (value) => TOPIC_PATTERN.test(value);

function loadTopic() {
  try {
    const saved = window.localStorage.getItem(TOPIC_STORAGE_KEY);
    if (saved && isTopic(saved)) return saved;
  } catch {
    // Storage blocked: a topic that lasts until the page reloads.
  }
  return storeTopic(newTopic());
}

function storeTopic(topic) {
  try {
    window.localStorage.setItem(TOPIC_STORAGE_KEY, topic);
  } catch {
    // As above.
  }
  return topic;
}

/** The price alerts of this browser's topic, and the calls to set, remove and try them. */
export function useAlerts() {
  const topic = ref(loadTopic());
  const alerts = ref([]);

  async function load() {
    alerts.value = await request(`/alerts?topic=${encodeURIComponent(topic.value)}`);
  }

  /** @param alert { party, search, query, label, seen, primed } */
  async function create(alert) {
    await request('/alerts', { method: 'POST', body: JSON.stringify({ ...alert, topic: topic.value }) });
    await load();
  }

  async function remove(id) {
    const params = new URLSearchParams({ id, topic: topic.value });
    await request(`/alerts?${params}`, { method: 'DELETE' });
    await load();
  }

  const test = () => request('/alerts/test', { method: 'POST', body: JSON.stringify({ topic: topic.value }) });

  /** The topic a phone already listens to, e.g. set up from another browser. */
  async function useTopic(value) {
    topic.value = storeTopic(value.trim());
    await load();
  }

  return { topic, alerts, load, create, remove, test, useTopic };
}
