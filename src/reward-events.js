import { kvs } from '@forge/kvs';

const MAX_QUEUE_SIZE = 30;
const MAX_PROJECT_STREAM_SIZE = 120;

function queueKeyForUser(userId) {
  return `reward:queue:${userId}`;
}

function streamKeyForProject(cloudId, projectKey) {
  return `reward:stream:${cloudId}:${String(projectKey || '').toUpperCase()}`;
}

function cursorKeyForProjectUser(cloudId, projectKey, userId) {
  return `reward:cursor:${cloudId}:${String(projectKey || '').toUpperCase()}:${userId}`;
}

function buildId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function enqueueRewardEvent({
  userId,
  message,
  points = 0,
  issueKey = '',
  action = 'unknown',
  appearance = 'success'
} = {}) {
  if (!userId || !message) {
    return { success: false, reason: 'userId and message are required' };
  }

  const key = queueKeyForUser(userId);
  const current = (await kvs.get(key)) || [];
  const createdAtMs = Date.now();
  const event = {
    id: buildId(),
    message,
    points,
    issueKey,
    action,
    appearance,
    createdAt: new Date(createdAtMs).toISOString(),
    createdAtMs
  };

  const next = Array.isArray(current) ? [...current, event].slice(-MAX_QUEUE_SIZE) : [event];
  await kvs.set(key, next);

  return { success: true, event };
}

export async function enqueueProjectRewardEvent({
  cloudId,
  projectKey,
  message,
  points = 0,
  issueKey = '',
  action = 'unknown',
  appearance = 'success'
} = {}) {
  if (!cloudId || !projectKey || !message) {
    return { success: false, reason: 'cloudId, projectKey and message are required' };
  }

  const key = streamKeyForProject(cloudId, projectKey);
  const current = (await kvs.get(key)) || [];
  const createdAtMs = Date.now();

  const event = {
    id: buildId(),
    message,
    points,
    issueKey,
    action,
    appearance,
    createdAt: new Date(createdAtMs).toISOString(),
    createdAtMs
  };

  const next = Array.isArray(current) ? [...current, event].slice(-MAX_PROJECT_STREAM_SIZE) : [event];
  await kvs.set(key, next);

  return { success: true, event };
}

export async function consumeRewardEventsForUser({ userId } = {}) {
  if (!userId) {
    return [];
  }

  const key = queueKeyForUser(userId);
  const events = (await kvs.get(key)) || [];
  await kvs.set(key, []);

  return Array.isArray(events) ? events : [];
}

export async function consumeProjectRewardEvents({ cloudId, projectKey, userId } = {}) {
  if (!cloudId || !projectKey || !userId) {
    return [];
  }

  const streamKey = streamKeyForProject(cloudId, projectKey);
  const cursorKey = cursorKeyForProjectUser(cloudId, projectKey, userId);

  const stream = (await kvs.get(streamKey)) || [];
  const cursor = Number((await kvs.get(cursorKey)) || 0);
  const safeStream = Array.isArray(stream) ? stream : [];

  const unseen = safeStream.filter((e) => Number(e?.createdAtMs || 0) > cursor);
  const newestSeen = unseen.reduce((acc, e) => Math.max(acc, Number(e?.createdAtMs || 0)), cursor);

  await kvs.set(cursorKey, newestSeen);
  return unseen;
}
