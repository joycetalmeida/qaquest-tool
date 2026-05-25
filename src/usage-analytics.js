import { kvs } from '@forge/kvs';
import { getInstalledSitesData } from './lifecycle';

const KEY_TOTAL_EVENTS = 'usage:metric:totalEvents';
const KEY_ACTION_INDEX = 'usage:index:actions';
const KEY_SOURCE_INDEX = 'usage:index:sources';

function currentDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

async function increment(key, by = 1) {
  const current = Number((await kvs.get(key)) || 0);
  const next = current + by;
  await kvs.set(key, next);
  return next;
}

async function addToIndex(indexKey, value) {
  if (!value) return;
  const list = (await kvs.get(indexKey)) || [];
  if (!Array.isArray(list) || list.includes(value)) return;
  await kvs.set(indexKey, [...list, value]);
}

async function markUniqueAndCount(markerKey, counterKey) {
  const alreadySeen = await kvs.get(markerKey);
  if (alreadySeen) return false;
  await kvs.set(markerKey, true);
  await increment(counterKey, 1);
  return true;
}

export async function trackUsageEvent({
  action,
  source,
  projectKey,
  accountId,
  cloudId,
  issueType
} = {}) {
  try {
    const safeAction = action || 'unknown';
    const safeSource = source || 'unknown';
    const day = currentDayKey();
    const month = currentMonthKey();

    await Promise.all([
      increment(KEY_TOTAL_EVENTS),
      increment(`usage:metric:action:${safeAction}`),
      increment(`usage:metric:source:${safeSource}`),
      increment(`usage:metric:daily:${day}`)
    ]);

    await Promise.all([
      addToIndex(KEY_ACTION_INDEX, safeAction),
      addToIndex(KEY_SOURCE_INDEX, safeSource)
    ]);

    if (projectKey) {
      await increment(`usage:metric:project:${projectKey}:events`);
    }

    if (issueType) {
      await increment(`usage:metric:issueType:${String(issueType).toLowerCase()}`);
    }

    if (accountId) {
      await markUniqueAndCount(
        `usage:marker:user:${month}:${accountId}`,
        `usage:metric:monthlyActiveUsers:${month}`
      );
    }

    if (cloudId) {
      await markUniqueAndCount(
        `usage:marker:site:${month}:${cloudId}`,
        `usage:metric:monthlyActiveSites:${month}`
      );
    }

    return { success: true };
  } catch (error) {
    console.error('trackUsageEvent error:', error);
    return { success: false, error: error.message };
  }
}

export async function getUsageSummary({ days = 7 } = {}) {
  const actionIndex = (await kvs.get(KEY_ACTION_INDEX)) || [];
  const sourceIndex = (await kvs.get(KEY_SOURCE_INDEX)) || [];
  const month = currentMonthKey();

  const totalEvents = Number((await kvs.get(KEY_TOTAL_EVENTS)) || 0);
  const monthlyActiveUsers = Number((await kvs.get(`usage:metric:monthlyActiveUsers:${month}`)) || 0);

  // Use the lifecycle registry for the authoritative installed-sites count.
  // Falls back to the local KVS monthly counter if the registry is empty.
  const lifecycleData = await getInstalledSitesData();
  const kvsMonthlyActiveSites = Number((await kvs.get(`usage:metric:monthlyActiveSites:${month}`)) || 0);
  const monthlyActiveSites = lifecycleData.count > 0 ? lifecycleData.count : kvsMonthlyActiveSites;

  const actionEntries = await Promise.all(
    actionIndex.map(async (name) => [name, Number((await kvs.get(`usage:metric:action:${name}`)) || 0)])
  );

  const sourceEntries = await Promise.all(
    sourceIndex.map(async (name) => [name, Number((await kvs.get(`usage:metric:source:${name}`)) || 0)])
  );

  const daily = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    const count = Number((await kvs.get(`usage:metric:daily:${day}`)) || 0);
    daily.push({ day, count });
  }

  return {
    totalEvents,
    monthlyActiveUsers,
    monthlyActiveSites,
    byAction: Object.fromEntries(actionEntries),
    bySource: Object.fromEntries(sourceEntries),
    daily
  };
}
