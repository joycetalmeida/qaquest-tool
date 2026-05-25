import { enqueueProjectRewardEvent, enqueueRewardEvent } from './reward-events';

/**
 * Sends a toast (temporary notification) in Jira
 * @param {Object} options - Toast options
 * @param {string} options.message - Message to display
 * @param {string} options.appearance - Notification type: 'success', 'warning', 'error', 'info'
 * @param {boolean} options.isAutoClose - Whether to auto-close
 * @param {Object} options.context - Request context (accountId, etc)
 * @param {string} options.creator - Account ID that triggered the action
 * @param {number} options.points - Earned points (optional)
 * @param {string} options.issueKey - Issue key (optional)
 */
export async function sendToast({ message, appearance = 'success', isAutoClose = true, context, creator, points = 0, issueKey = '' }) {
  try {
    // Builds payload displayed by Custom UI via polling.
    let fullMessage = message;
    if (points > 0) {
      fullMessage += ` +${points} points`;
    }
    if (issueKey) {
      fullMessage += ` in ${issueKey}`;
    }

    if (creator) {
      await enqueueRewardEvent({
        userId: creator,
        message: fullMessage,
        points,
        issueKey,
        action: 'gamification-reward',
        appearance
      });
    }

    const cloudId = context?.cloudId;
    const projectKey = context?.extension?.project?.key || context?.projectKey || null;
    if (cloudId && projectKey) {
      await enqueueProjectRewardEvent({
        cloudId,
        projectKey,
        message: fullMessage,
        points,
        issueKey,
        action: 'gamification-reward',
        appearance
      });
    }

    console.log(`Reward queued: ${fullMessage}`);
    return { success: true, message: fullMessage };
  } catch (error) {
    console.error('Error sending toast:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sends notification with earned points details
 */
export async function sendGamificationNotification({ points, action, quality, issueKey, context }) {
  const pointsMessage = `+${points} points`;
  let actionDescription = '';

  switch (action) {
    case 'test-created':
      actionDescription = 'for creating a new test';
      break;
    case 'test-updated':
      actionDescription = 'for updating a test';
      break;
    case 'execution-created':
      actionDescription = 'for creating a test execution';
      break;
    case 'execution-updated':
      actionDescription = 'for updating an execution';
      break;
    default:
      actionDescription = 'for your contribution';
  }

  let qualityBonus = '';
  if (quality === 'description') {
    qualityBonus = '\n📚 Bonus: Detailed description!';
  } else if (quality === 'evidence') {
    qualityBonus = '\n📎 Bonus: Evidence attached!';
  } else if (quality === 'gherkin') {
    qualityBonus = '\n📝 Bonus: Gherkin format detected!';
  }

  const message = `🎯 Congratulations! You earned ${pointsMessage} ${actionDescription}${qualityBonus}`;

  return sendToast({
    message,
    appearance: 'success',
    isAutoClose: true,
    context,
    points,
    issueKey
  });
}

/**
 * Sends notification for level up unlock
 */
export async function sendLevelUpNotification({ newLevel, totalPoints, badges, context }) {
  const message = `🚀 You advanced to Level ${newLevel}! Total points: ${totalPoints}!`;
  
  return sendToast({
    message,
    appearance: 'success',
    isAutoClose: false,
    context,
    points: 0
  });
}

/**
 * Sends badge unlock notification
 */
export async function sendBadgeNotification({ badge, context }) {
  const message = `🎖️ New Badge Unlocked: ${badge.emoji} ${badge.name} (Level ${badge.level})`;
  
  return sendToast({
    message,
    appearance: 'success',
    isAutoClose: false,
    context,
    points: 0
  });
}
