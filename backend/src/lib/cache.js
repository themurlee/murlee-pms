// Tiny in-process TTL cache. Only used for the dashboard aggregate query,
// which is the one read expensive enough (joins across 4+ tables) to be
// worth caching before real load justifies Redis.
const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function invalidate(key) {
  store.delete(key);
}

const DASHBOARD_CACHE_KEY = 'dashboard:summary';

function invalidateDashboardCache() {
  invalidate(DASHBOARD_CACHE_KEY);
}

module.exports = { get, set, invalidate, DASHBOARD_CACHE_KEY, invalidateDashboardCache };
