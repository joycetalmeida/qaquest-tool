import Resolver from '@forge/resolver';
import { buildMyXrayGameReport } from './game-report';
import { getUsageSummary, trackUsageEvent } from './usage-analytics';
import { consumeProjectRewardEvents, consumeRewardEventsForUser } from './reward-events';

const resolver = new Resolver();

resolver.define('getMyGameReport', async ({ payload, context }) => {
  // evita erro "reading 'key' of undefined"
  const projectKey = payload?.projectKey || null;
  const projectId = payload?.projectId || null;

  if (!projectKey && !projectId) {
    throw new Error('projectKey/projectId é obrigatório');
  }

  await trackUsageEvent({
    action: 'report-requested',
    source: 'resolver',
    projectKey,
    accountId: context?.accountId,
    cloudId: context?.cloudId
  });

  return buildMyXrayGameReport({ projectKey, projectId, accountId: context.accountId });
});

resolver.define('trackUiEvent', async ({ payload, context }) => {
  return trackUsageEvent({
    action: payload?.action || 'ui-event',
    source: payload?.source || 'ui',
    projectKey: payload?.projectKey || null,
    accountId: context?.accountId,
    cloudId: context?.cloudId
  });
});

resolver.define('getUsageSummary', async ({ payload }) => {
  const days = Number(payload?.days || 7);
  return getUsageSummary({ days });
});

resolver.define('consumeRewardEvents', async ({ payload, context }) => {
  const userEvents = await consumeRewardEventsForUser({ userId: context?.accountId });
  const projectEvents = await consumeProjectRewardEvents({
    cloudId: context?.cloudId,
    projectKey: payload?.projectKey || null,
    userId: context?.accountId
  });

  const merged = [...userEvents, ...projectEvents]
    .filter(Boolean)
    .sort((a, b) => Number(a?.createdAtMs || 0) - Number(b?.createdAtMs || 0));

  const dedupMap = new Map();
  merged.forEach((evt) => dedupMap.set(evt.id, evt));
  const events = [...dedupMap.values()];

  if (events.length > 0) {
    await trackUsageEvent({
      action: 'reward-consumed',
      source: 'custom-ui',
      accountId: context?.accountId,
      cloudId: context?.cloudId
    });
  }

  return events;
});

export const handler = resolver.getDefinitions();
