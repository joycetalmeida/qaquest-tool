import api, { route } from '@forge/api';
import { scoreTest, scoreExecution } from './game-report';
import { sendToast } from './notifications';
import { saveGamificationPoints } from './gamification-storage';
import { trackUsageEvent } from './usage-analytics';

const TEST_ISSUETYPE = 'test';
const EXEC_ISSUETYPE = 'test execution';
const PLAN_ISSUETYPE = 'test plan';

// Achievement messages for actions
const CONGRATULATIONS_MESSAGES = {
  testCreated: '🎉 Awesome! You created a new test!',
  testUpdated: '✨ Great job! Test updated successfully!',
  executionCreated: '🚀 Incredible! New test execution created!',
  executionUpdated: '💪 Fantastic! Test execution updated!',
  planCreated: '🗂️ Excellent! New test plan created!',
  planUpdated: '📌 Test plan updated successfully!',
  gherkinAdded: '📝 Excellent! You added Gherkin to the test!',
  descriptionAdded: '📚 Quality documentation! Description added!',
  evidenceAdded: '📎 Well done! Evidence attached to test!',
};

function normalizeIssueTypeName(name) {
  return String(name || '').trim().toLowerCase();
}

function isXrayExecutionType(typeName) {
  return typeName.includes('execution') && typeName.includes('test');
}

function isXrayPlanType(typeName) {
  return typeName.includes('plan') && typeName.includes('test');
}

function isXrayTestType(typeName) {
  if (!typeName.includes('test')) return false;
  if (isXrayExecutionType(typeName)) return false;
  if (isXrayPlanType(typeName)) return false;
  return true;
}

// Maps change type to achievement message
function getMessageForChange(change) {
  if (change.type === 'test-created') {
    return CONGRATULATIONS_MESSAGES.testCreated;
  }
  if (change.type === 'test-updated') {
    return CONGRATULATIONS_MESSAGES.testUpdated;
  }
  if (change.type === 'execution-created') {
    return CONGRATULATIONS_MESSAGES.executionCreated;
  }
  if (change.type === 'execution-updated') {
    return CONGRATULATIONS_MESSAGES.executionUpdated;
  }
  if (change.type === 'plan-created') {
    return CONGRATULATIONS_MESSAGES.planCreated;
  }
  if (change.type === 'plan-updated') {
    return CONGRATULATIONS_MESSAGES.planUpdated;
  }
  if (change.quality === 'gherkin') {
    return CONGRATULATIONS_MESSAGES.gherkinAdded;
  }
  if (change.quality === 'description') {
    return CONGRATULATIONS_MESSAGES.descriptionAdded;
  }
  if (change.quality === 'evidence') {
    return CONGRATULATIONS_MESSAGES.evidenceAdded;
  }
  return '🎯 Congratulations! Action completed successfully!';
}

// Detects quality changes between versions
function detectQualityChanges(oldFields, newFields) {
  const changes = [];
  
  if (!oldFields?.description && newFields?.description) {
    changes.push({ quality: 'description' });
  }
  if (!oldFields?.attachment?.length && newFields?.attachment?.length) {
    changes.push({ quality: 'evidence' });
  }
  
  if (newFields?.description?.includes('Given') || 
      newFields?.description?.includes('When') || 
      newFields?.description?.includes('Then')) {
    if (!oldFields?.description?.includes('Given')) {
      changes.push({ quality: 'gherkin' });
    }
  }
  
  return changes;
}

export const handler = async (event, context) => {
  try {
    const webhookEvent = event || {};
    const issue = webhookEvent.issue;
    const issueType = normalizeIssueTypeName(issue?.fields?.issuetype?.name);
    const creator =
      webhookEvent?.user?.accountId ||
      webhookEvent?.changelog?.author?.accountId ||
      issue?.fields?.creator?.accountId ||
      issue?.fields?.reporter?.accountId ||
      issue?.fields?.assignee?.accountId;
    const isTest = issueType === TEST_ISSUETYPE || isXrayTestType(issueType);
    const isExecution = issueType === EXEC_ISSUETYPE || isXrayExecutionType(issueType);
    const isPlan = issueType === PLAN_ISSUETYPE || isXrayPlanType(issueType);

    if (!isTest && !isExecution && !isPlan) {
      console.log(`Skipping non-tracked issue type: ${issueType || 'unknown'} on ${issue?.key || 'unknown-key'}`);
      return { success: false, reason: 'Issue type not tracked for gamification' };
    }

    const issueResponse = await api.asApp().requestJira(route`/rest/api/3/issue/${issue.key}`, {
      expand: 'changelog'
    });

    if (!issueResponse.ok) {
      throw new Error(`Failed to fetch issue details: ${issueResponse.status}`);
    }

    const fullIssue = await issueResponse.json();

    const eventType = webhookEvent.webhookEvent || 'jira:issue_updated';
    const isCreation = eventType === 'jira:issue_created';

    let changeType = '';
    let scoreData = null;
    let qualityChanges = [];

    if (isTest) {
      scoreData = scoreTest(fullIssue);
      changeType = isCreation ? 'test-created' : 'test-updated';

      if (webhookEvent.changelog?.histories) {
        const lastHistory = webhookEvent.changelog.histories[webhookEvent.changelog.histories.length - 1];
        if (lastHistory?.items) {
          for (const item of lastHistory.items) {
            if (['description', 'attachment'].includes(item.field)) {
              qualityChanges.push({ type: item.field });
            }
          }
        }
      }
    } else if (isExecution) {
      scoreData = scoreExecution(fullIssue);
      changeType = isCreation ? 'execution-created' : 'execution-updated';
    } else if (isPlan) {
      // Reuses basic quality score for test plan.
      scoreData = scoreTest(fullIssue);
      changeType = isCreation ? 'plan-created' : 'plan-updated';
    }

    const changeInfo = { type: changeType, quality: qualityChanges[0]?.type };
    const message = getMessageForChange(changeInfo);

    await sendToast({
      message,
      appearance: 'success',
      isAutoClose: true,
      context: {
        ...context,
        projectKey: issue?.fields?.project?.key || null
      },
      creator,
      points: scoreData?.points || 0,
      issueKey: issue.key
    });

    await saveGamificationPoints({
      issueKey: issue.key,
      userId: creator,
      points: scoreData?.points || 0,
      action: changeType,
      timestamp: new Date()
    });

    await trackUsageEvent({
      action: changeType,
      source: 'webhook',
      projectKey: issue?.fields?.project?.key || null,
      accountId: creator,
      cloudId: context?.cloudId,
      issueType
    });

    console.log(`Gamification event: ${changeType} on ${issue.key} by ${creator} (+${scoreData?.points} points)`);

    return {
      success: true,
      eventType: changeType,
      points: scoreData?.points,
      message
    };
  } catch (error) {
    console.error('Error in webhook handler:', error);
    return { success: false, error: error.message };
  }
};
