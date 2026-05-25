import api, { route } from '@forge/api';

const TEST_ISSUETYPE = 'Test';
const EXEC_ISSUETYPE = 'Test Execution';
const PLAN_ISSUETYPE = 'Test Plan';
const DEFECT_TYPES = ['Bug', 'Defect'];
const STORY_TYPES = ['Story', 'Task'];

const hasValue = (v) =>
  v !== null &&
  v !== undefined &&
  !(typeof v === 'string' && v.trim() === '') &&
  !(Array.isArray(v) && v.length === 0);

const toPercent = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

const calcLevel = (points) => Math.min(10, Math.floor(points / 140) + 1);

function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToText).join(' ');
  if (typeof node === 'object') {
    const own = hasValue(node.text) ? String(node.text) : '';
    const children = adfToText(node.content || []);
    return `${own} ${children}`.trim();
  }
  return '';
}

function getSprintsFromIssue(issue, sprintFieldId, { includeFuture = false } = {}) {
  if (!sprintFieldId) return [];
  const fieldValue = issue?.fields?.[sprintFieldId];
  if (!Array.isArray(fieldValue) || fieldValue.length === 0) return [];

  const uniqueBySprintId = new Map();
  for (const rawSprint of fieldValue) {
    if (!rawSprint?.id) continue;
    const state = String(rawSprint.state || '').toLowerCase();
    if (!includeFuture && state === 'future') continue;

    uniqueBySprintId.set(String(rawSprint.id), {
      sprintId: rawSprint.id,
      sprintName: rawSprint.name || `Sprint ${rawSprint.id}`,
      startDate: getDate(rawSprint.startDate),
      endDate: getDate(rawSprint.endDate),
      state
    });
  }

  return [...uniqueBySprintId.values()];
}

function pickSprintForScoring(sprints, issue, accountId) {
  if (!Array.isArray(sprints) || sprints.length === 0) return null;

  const histories = issue?.changelog?.histories || [];
  const sprintMatches = sprints
    .filter((s) => s.startDate && s.endDate)
    .map((sprint) => {
      const matchingHistory = histories.filter((history) => {
        const changedAt = getDate(history?.created);
        if (!changedAt || changedAt < sprint.startDate || changedAt > sprint.endDate) {
          return false;
        }

        if (!accountId) {
          return true;
        }

        return history?.author?.accountId === accountId;
      });

      return {
        sprint,
        matchingCount: matchingHistory.length,
        lastMatchingAt: matchingHistory.length > 0
          ? getDate(matchingHistory[matchingHistory.length - 1]?.created)
          : null
      };
    })
    .filter((entry) => entry.matchingCount > 0)
    .sort((a, b) => {
      if (b.matchingCount !== a.matchingCount) {
        return b.matchingCount - a.matchingCount;
      }

      const aLast = a.lastMatchingAt ? a.lastMatchingAt.getTime() : 0;
      const bLast = b.lastMatchingAt ? b.lastMatchingAt.getTime() : 0;
      return bLast - aLast;
    });

  if (sprintMatches.length > 0) {
    return sprintMatches[0].sprint;
  }

  const createdAt = getDate(issue?.fields?.created);
  const updatedAt = getDate(issue?.fields?.updated);
  const resolvedAt = getDate(issue?.fields?.resolutiondate);
  const referenceDate = updatedAt || resolvedAt || createdAt;

  const ordered = [...sprints].sort((a, b) => {
    const aStart = a.startDate ? a.startDate.getTime() : 0;
    const bStart = b.startDate ? b.startDate.getTime() : 0;
    return aStart - bStart;
  });

  if (referenceDate) {
    const containing = ordered.filter((s) => {
      if (!s.startDate || !s.endDate) return false;
      return referenceDate >= s.startDate && referenceDate <= s.endDate;
    });
    if (containing.length > 0) {
      return containing[containing.length - 1];
    }

    const startedBeforeRef = ordered.filter((s) => s.startDate && s.startDate <= referenceDate);
    if (startedBeforeRef.length > 0) {
      return startedBeforeRef[startedBeforeRef.length - 1];
    }
  }

  return ordered[ordered.length - 1];
}

function upsertSprintScore(map, issue, sprintFieldId, points, type, accountId) {
  const sprints = getSprintsFromIssue(issue, sprintFieldId, { includeFuture: false });
  if (sprints.length === 0) return;

  const sprint = pickSprintForScoring(sprints, issue, accountId);
  if (!sprint) return;

  const key = String(sprint.sprintId);
  if (!map.has(key)) {
    map.set(key, {
      sprintId: sprint.sprintId,
      sprintName: sprint.sprintName,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      testPoints: 0,
      executionPoints: 0,
      score: 0,
      itemCount: 0
    });
  }

  const entry = map.get(key);
  if (type === 'test') entry.testPoints += points;
  if (type === 'execution') entry.executionPoints += points;
  entry.score += points;
  entry.itemCount += 1;
}

function normalizeText(value) {
  const raw = adfToText(value);
  return String(raw || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const BADGE_CATALOG = [
  { id: 'tests-created', emoji: '🧪', name: 'Test Architect', metric: 'testsCreatedByMe', levels: [5, 15, 30, 50, 80], kind: 'count' },
  { id: 'defects-reported', emoji: '🐞', name: 'Bug Hunter', metric: 'defectsReportedByMe', levels: [2, 5, 10, 20, 40], kind: 'count' },
  { id: 'defects-retested', emoji: '🔁', name: 'Retest Master', metric: 'defectsRetestedAfterResolved', levels: [1, 3, 6, 10, 20], kind: 'count' },
  { id: 'plans-associated', emoji: '🗂️', name: 'Plan Strategist', metric: 'testPlansWithAssociatedTests', levels: [1, 3, 5, 8, 12], kind: 'count' },
  { id: 'description-quality', emoji: '📝', name: 'Elite Documenter', metric: 'descriptionCoveragePct', levels: [50, 70, 85, 95, 100], kind: 'percent' },
  { id: 'gherkin-quality', emoji: '📜', name: 'Gherkin Guardian', metric: 'gherkinCoveragePct', levels: [40, 60, 75, 90, 100], kind: 'percent' },
  { id: 'evidence-quality', emoji: '📎', name: 'Evidence Curator', metric: 'evidenceCoveragePct', levels: [20, 40, 60, 80, 95], kind: 'percent' },
  { id: 'traceability-quality', emoji: '🔗', name: 'Traceability Master', metric: 'traceabilityCoveragePct', levels: [40, 60, 80, 90, 100], kind: 'percent' },
  { id: 'story-coverage', emoji: '🧭', name: 'Coverage Guardian', metric: 'storyCoveragePct', levels: [30, 50, 70, 85, 95], kind: 'percent' },
  { id: 'sprint-flow', emoji: '🏃', name: 'Sprint Finisher', metric: 'sprintResolvedBeforeEndPct', levels: [30, 50, 70, 85, 95], kind: 'percent' }
];

function buildBadges(metrics) {
  return BADGE_CATALOG.map((b) => {
    const metricValue = Number(metrics?.[b.metric] || 0);
    let badgeLevel = 0;
    b.levels.forEach((requiredLevel, idx) => {
      if (metricValue >= requiredLevel) badgeLevel = idx + 1;
    });

    const nextRequiredLevel = badgeLevel < b.levels.length ? b.levels[badgeLevel] : null;

    return {
      id: b.id,
      emoji: b.emoji,
      name: b.name,
      metric: b.metric,
      metricValue,
      metricType: b.kind,
      level: badgeLevel,
      maxLevel: b.levels.length,
      unlocked: badgeLevel > 0,
      nextRequiredLevel
    };
  });
}

async function resolveProjectKey(projectKey, projectId) {
  if (projectKey) return projectKey;
  const res = await api.asUser().requestJira(route`/rest/api/3/project/${projectId}`);
  if (!res.ok) throw new Error(`Failed to resolve project by ID: ${res.status}`);
  const data = await res.json();
  return data.key;
}

async function searchIssuesByJql(jql, { fields = ['summary'], expand = [], maxResults = 100 } = {}) {
  const issues = [];
  let nextPageToken;
  let isLast = false;

  do {
    const payload = {
      jql,
      maxResults,
      fields
    };

    if (expand.length > 0) {
      payload.expand = expand.join(',');
    }

    if (nextPageToken) {
      payload.nextPageToken = nextPageToken;
    }

    const res = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Failed to search Jira: ${res.status} - ${txt}`);
    }

    const data = await res.json();
    issues.push(...(data.issues || []));
    nextPageToken = data.nextPageToken;
    isLast = Boolean(data.isLast);
  } while (!isLast && nextPageToken);

  return issues;
}

function getIssueTypeName(issue) {
  return String(issue?.fields?.issuetype?.name || '').toLowerCase();
}

function getLinkedIssues(issue) {
  const links = issue?.fields?.issuelinks || [];
  return links
    .map((l) => l.outwardIssue || l.inwardIssue)
    .filter(Boolean);
}

function getLinksByType(issue, typeNameList) {
  const expected = new Set(typeNameList.map((x) => x.toLowerCase()));
  return getLinkedIssues(issue).filter((linked) => expected.has(getIssueTypeName(linked)));
}

function hasGherkin(issue, xrayFieldId = null) {
  // Check standard description field (teams that write informal Gherkin there)
  const descText = normalizeText(issue?.fields?.description);
  if (descText.includes('given') && descText.includes('when') && descText.includes('then')) {
    return true;
  }
  // Check Xray "Test Definition" custom field (proper BDD/Cucumber tests)
  if (xrayFieldId) {
    const xrayText = normalizeText(issue?.fields?.[xrayFieldId]);
    if (xrayText.includes('given') && xrayText.includes('when') && xrayText.includes('then')) {
      return true;
    }
  }
  return false;
}

function isDone(issue) {
  return String(issue?.fields?.status?.statusCategory?.key || '').toLowerCase() === 'done';
}

function getDate(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function buildUserAttributionClause() {
  return '(creator = currentUser() OR reporter = currentUser() OR assignee = currentUser())';
}

function issueBelongsToUser(issue, accountId) {
  if (!accountId) return false;
  const creatorId = issue?.fields?.creator?.accountId;
  const reporterId = issue?.fields?.reporter?.accountId;
  const assigneeId = issue?.fields?.assignee?.accountId;

  if (creatorId === accountId || reporterId === accountId || assigneeId === accountId) {
    return true;
  }

  const histories = issue?.changelog?.histories || [];
  return histories.some((h) => h?.author?.accountId === accountId);
}

function extractSprintWindow(issue, sprintFieldId) {
  if (!sprintFieldId) return null;
  const fieldValue = issue?.fields?.[sprintFieldId];
  if (!Array.isArray(fieldValue) || fieldValue.length === 0) return null;

  const candidate = fieldValue[fieldValue.length - 1];
  const startDate = getDate(candidate?.startDate);
  const endDate = getDate(candidate?.endDate);
  if (!startDate || !endDate) return null;

  return {
    sprintId: candidate.id,
    sprintName: candidate.name,
    startDate,
    endDate,
    durationDays: Math.round((endDate - startDate) / (1000 * 60 * 60 * 24))
  };
}

function extractStatusChangesInWindow(issue, window) {
  const histories = issue?.changelog?.histories || [];
  const changes = [];

  for (const h of histories) {
    const at = getDate(h.created);
    if (!at || at < window.startDate || at > window.endDate) continue;

    for (const item of h.items || []) {
      if (String(item.field).toLowerCase() !== 'status') continue;
      changes.push({
        at,
        from: item.fromString || '',
        to: item.toString || ''
      });
    }
  }

  return changes;
}

async function getSprintFieldId() {
  const res = await api.asUser().requestJira(route`/rest/api/3/field`);
  if (!res.ok) return null;

  const fields = await res.json();
  const sprintField = (fields || []).find((f) => String(f?.name || '').toLowerCase() === 'sprint');
  return sprintField?.id || null;
}

/**
 * Dynamically resolves the Xray "Test Definition" custom field ID.
 * In Xray Cloud the field stores Gherkin / BDD steps and is distinct
 * from the standard Jira "description" field.
 */
async function getXrayTestDefinitionFieldId() {
  const res = await api.asUser().requestJira(route`/rest/api/3/field`);
  if (!res.ok) return null;

  const fields = await res.json();
  const XRAY_FIELD_NAMES = ['test definition', 'test script', 'gherkin', 'cucumber'];
  const f = (fields || []).find((field) => {
    const name = String(field?.name || '').toLowerCase();
    return XRAY_FIELD_NAMES.some((x) => name.includes(x));
  });
  return f?.id || null;
}

function scoreTest(issue, xrayFieldId = null) {
  const f = issue.fields || {};
  let points = 0;
  let filled = 0;

  const rules = [
    { ok: hasValue(f.summary), pts: 10 },
    { ok: hasValue(f.description), pts: 20 },
    { ok: hasValue(f.labels), pts: 5 },
    { ok: hasValue(f.components), pts: 5 },
    { ok: hasValue(f.priority), pts: 5 },
    { ok: hasGherkin(issue, xrayFieldId), pts: 40 },
    { ok: hasValue(f.attachment), pts: 10 },
    { ok: getLinksByType(issue, STORY_TYPES).length > 0, pts: 15 }
  ];

  for (const r of rules) if (r.ok) { points += r.pts; filled += 1; }
  return { points, filledFields: filled };
}

function scoreExecution(issue) {
  const f = issue.fields || {};
  let points = 0;
  let filled = 0;

  const rules = [
    { ok: hasValue(f.summary), pts: 10 },
    { ok: hasValue(f.description), pts: 15 },
    { ok: hasValue(f.environment), pts: 15 },
    { ok: hasValue(f.assignee), pts: 5 },
    { ok: hasValue(f.attachment), pts: 15 },
    { ok: hasValue(f.comment?.comments), pts: 10 },
    { ok: hasValue(f.updated), pts: 5 }
  ];

  for (const r of rules) if (r.ok) { points += r.pts; filled += 1; }
  return { points, filledFields: filled }; // sem pass/fail
}

async function getProjectIssueTypes(projectKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/project/${projectKey}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.issueTypes || []).map((t) => t.name);
}

export async function buildMyXrayGameReport({ projectKey, projectId, accountId }) {
  const key = await resolveProjectKey(projectKey, projectId);
  const [sprintFieldId, xrayTestDefFieldId] = await Promise.all([
    getSprintFieldId(),
    getXrayTestDefinitionFieldId()
  ]);
  console.log(`[QAQuest] Field IDs → sprint=${sprintFieldId} xrayTestDef=${xrayTestDefFieldId}`);

  // Discover real Xray issue type names in this project
  const allIssueTypes = await getProjectIssueTypes(key);
  console.log(`[QAQuest] Project issue types for ${key}: ${JSON.stringify(allIssueTypes)}`);

  const xrayTestTypes = allIssueTypes.filter((n) => {
    const l = n.toLowerCase();
    return l.includes('test') && !l.includes('execution') && !l.includes('plan') && !l.includes('set');
  });
  if (xrayTestTypes.length === 0) {
    xrayTestTypes.push(TEST_ISSUETYPE);
  }

  const xrayExecType = allIssueTypes.find((n) => {
    const l = n.toLowerCase();
    return l.includes('test') && l.includes('execution');
  }) || EXEC_ISSUETYPE;

  const xrayPlanType = allIssueTypes.find((n) => {
    const l = n.toLowerCase();
    return l.includes('test') && l.includes('plan');
  }) || PLAN_ISSUETYPE;

  const testTypeClause = xrayTestTypes.map((t) => `"${t}"`).join(', ');
  const userAttributionClause = buildUserAttributionClause();
  console.log(`[QAQuest] Resolved types → tests=${JSON.stringify(xrayTestTypes)} exec="${xrayExecType}" plan="${xrayPlanType}"`);

  const testsJql = `project = "${key}" AND issuetype in (${testTypeClause}) ORDER BY updated DESC`;
  const execJql = `project = "${key}" AND issuetype = "${xrayExecType}" AND ${userAttributionClause} ORDER BY updated DESC`;
  const defectsJql = `project = "${key}" AND issuetype in ("${DEFECT_TYPES.join('", "')}") AND reporter = currentUser() ORDER BY updated DESC`;
  const plansJql = `project = "${key}" AND issuetype = "${xrayPlanType}" AND ${userAttributionClause} ORDER BY updated DESC`;
  const storiesJql = `project = "${key}" AND issuetype in ("${STORY_TYPES.join('", "')}") AND creator = currentUser() ORDER BY updated DESC`;
  const sprintItemsJql = `project = "${key}" AND issuetype in (${testTypeClause}, "${xrayExecType}") AND sprint in openSprints() AND ${userAttributionClause} ORDER BY updated DESC`;
  const anySprintItemJql = `project = "${key}" AND sprint in openSprints() ORDER BY updated DESC`;
  const sprintPerfFallbackJql = `project = "${key}" AND issuetype in (${testTypeClause}, "${xrayExecType}") AND sprint is not EMPTY ORDER BY updated DESC`;
  const allProjectSprintIssuesJql = `project = "${key}" AND sprint is not EMPTY ORDER BY updated DESC`;

  console.log(`[QAQuest] testsJql: ${testsJql}`);

  const baseFields = [
    'summary', 'description', 'labels', 'components', 'priority',
    'assignee', 'attachment', 'comment', 'environment', 'updated',
    'created',
    'creator', 'reporter', 'issuetype', 'status', 'issuelinks', 'resolutiondate',
    sprintFieldId,
    xrayTestDefFieldId
  ].filter(Boolean);

  const [allTests, execs, defects, plans, stories, sprintItems, anySprintItems, sprintPerfFallbackItems, allProjectSprintIssues] = await Promise.all([
    searchIssuesByJql(testsJql, { fields: baseFields, expand: ['changelog'] }),
    searchIssuesByJql(execJql, { fields: baseFields, expand: ['changelog'] }),
    searchIssuesByJql(defectsJql, { fields: baseFields, expand: ['changelog'] }),
    searchIssuesByJql(plansJql, { fields: baseFields }),
    searchIssuesByJql(storiesJql, { fields: baseFields }),
    searchIssuesByJql(sprintItemsJql, { fields: baseFields, expand: ['changelog'] }),
    searchIssuesByJql(anySprintItemJql, { fields: [sprintFieldId].filter(Boolean), maxResults: 1 }),
    searchIssuesByJql(sprintPerfFallbackJql, { fields: baseFields, maxResults: 200 }),
    searchIssuesByJql(allProjectSprintIssuesJql, { fields: [sprintFieldId].filter(Boolean), maxResults: 200 })
  ]);

  const tests = allTests.filter((t) => issueBelongsToUser(t, accountId));

  console.log(`[QAQuest] Results → allTests=${allTests.length} myTests=${tests.length} execs=${execs.length} plans=${plans.length} sprintItems=${sprintItems.length}`);
  console.log(`[QAQuest] Sample allTests keys: ${allTests.slice(0, 20).map((t) => t.key).join(', ')}`);
  console.log(`[QAQuest] Sample myTests keys: ${tests.slice(0, 20).map((t) => t.key).join(', ')}`);

  let testPoints = 0;
  let execPoints = 0;
  let fieldsFilled = 0;
  const sprintScoresMap = new Map();

  const testsWithDescription = tests.filter((t) => hasValue(t?.fields?.description)).length;
  const testsWithGherkin = tests.filter((t) => hasGherkin(t, xrayTestDefFieldId)).length;
  const testsWithEvidence = tests.filter((t) => hasValue(t?.fields?.attachment)).length;
  const testsWithTraceability = tests.filter((t) => getLinksByType(t, STORY_TYPES).length > 0).length;

  // Xray uses its own internal test-plan ↔ test association (not standard Jira issuelinks).
  // We approximate by checking whether the plan links to ANY issue — standard issuelinks
  // may include test issues if the team uses them, but the primary signal is the Xray API.
  // For now count plans that have at least one issuelink of any type as a reasonable proxy.
  const testPlansWithAssociatedTests = plans.filter(
    (p) => (p?.fields?.issuelinks || []).length > 0 || getLinksByType(p, xrayTestTypes).length > 0
  ).length;

  const storiesWithCoverage = stories.filter(
    (s) => getLinksByType(s, [...new Set([...xrayTestTypes, TEST_ISSUETYPE])]).length > 0
  ).length;

  // A defect counts as retested when its changelog shows a status transition to
  // a testing/in-progress state AFTER the issue's resolution date.
  // (Linked issue objects from issuelinks don't carry the `updated` field.)
  const defectsRetestedAfterResolved = defects.filter((d) => {
    const resolvedAt = getDate(d?.fields?.resolutiondate);
    if (!resolvedAt) return false;
    const histories = d?.changelog?.histories || [];
    return histories.some((h) => {
      const at = getDate(h.created);
      if (!at || at <= resolvedAt) return false;
      return (h.items || []).some(
        (item) =>
          String(item.field).toLowerCase() === 'status' &&
          (String(item.toString || '').toLowerCase().includes('progress') ||
            String(item.toString || '').toLowerCase().includes('test') ||
            String(item.toString || '').toLowerCase().includes('reopen'))
      );
    });
  }).length;

  // Try to get sprint from user's items first; fall back to any project item in open sprint
  const sprintWindow =
    sprintItems.map((i) => extractSprintWindow(i, sprintFieldId)).find(Boolean) ||
    anySprintItems.map((i) => extractSprintWindow(i, sprintFieldId)).find(Boolean);

  let sprintMovedToInProgress = 0;
  let sprintResolvedBeforeEnd = 0;
  let sprintDoneCount = 0;

  if (sprintWindow) {
    for (const item of sprintItems) {
      const changes = extractStatusChangesInWindow(item, sprintWindow);
      const started = changes.some((c) => c.to.toLowerCase().includes('progress'));
      const finished = changes.some((c) => c.to.toLowerCase().includes('done'));

      if (started) sprintMovedToInProgress += 1;
      if (finished || isDone(item)) sprintResolvedBeforeEnd += 1;
      if (isDone(item)) sprintDoneCount += 1;
    }
  }

  const executions = execs.map((e) => {
    const s = scoreExecution(e);
    execPoints += s.points;
    fieldsFilled += s.filledFields;
    upsertSprintScore(sprintScoresMap, e, sprintFieldId, s.points, 'execution', accountId);
    return {
      key: e.key,
      title: e.fields?.summary || e.key,
      score: s.points,
      vibe: s.points >= 40 ? '✨ Excellent execution' : '🛠️ Execution in progress'
    };
  });

  for (const t of tests) {
    const s = scoreTest(t, xrayTestDefFieldId);
    testPoints += s.points;
    fieldsFilled += s.filledFields;
    upsertSprintScore(sprintScoresMap, t, sprintFieldId, s.points, 'test', accountId);
  }

  // Fallback for chart visibility: if user-scoped items have no sprint linkage,
  // use project sprint items so the sprint performance chart is not empty.
  if (sprintScoresMap.size === 0) {
    for (const item of sprintPerfFallbackItems) {
      const issueType = getIssueTypeName(item);
      const isExecutionType = issueType.includes('execution') && issueType.includes('test');
      const s = isExecutionType ? scoreExecution(item) : scoreTest(item, xrayTestDefFieldId);
      upsertSprintScore(sprintScoresMap, item, sprintFieldId, s.points, isExecutionType ? 'execution' : 'test', accountId);
    }
    console.log(`[QAQuest] Sprint chart fallback used with ${sprintPerfFallbackItems.length} project items`);
  }

  // Ensure real sprint history is represented even when few test/execution items changed.
  // This uses all project issues with a sprint assignment (same Jira source, no extra scopes).
  const sprintUniverse = new Map();
  for (const issue of allProjectSprintIssues) {
    const sprints = getSprintsFromIssue(issue, sprintFieldId, { includeFuture: false });
    for (const sprint of sprints) {
      sprintUniverse.set(String(sprint.sprintId), sprint);
    }
  }

  for (const sprint of sprintUniverse.values()) {
    const keySprint = String(sprint.sprintId);
    if (sprintScoresMap.has(keySprint)) continue;
    sprintScoresMap.set(keySprint, {
      sprintId: sprint.sprintId,
      sprintName: sprint.sprintName,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      testPoints: 0,
      executionPoints: 0,
      score: 0,
      itemCount: 0
    });
  }
  console.log(`[QAQuest] Sprint universe from project issues → ${sprintUniverse.size}`);

  const sprintPerformance = Array.from(sprintScoresMap.values())
    .sort((a, b) => {
      const aDate = a.startDate ? a.startDate.getTime() : 0;
      const bDate = b.startDate ? b.startDate.getTime() : 0;
      return aDate - bDate;
    })
    .slice(-8)
    .map((s) => ({
      sprintId: s.sprintId,
      sprintName: s.sprintName,
      startDate: s.startDate ? s.startDate.toISOString() : null,
      endDate: s.endDate ? s.endDate.toISOString() : null,
      testPoints: s.testPoints,
      executionPoints: s.executionPoints,
      score: s.score,
      itemCount: s.itemCount
    }));
  console.log(`[QAQuest] Sprint performance rows=${sprintPerformance.length} ids=${sprintPerformance.map((s) => s.sprintId).join(',')}`);

  const qualityBonus =
    Math.round(toPercent(testsWithDescription, tests.length) * 1.2) +
    Math.round(toPercent(testsWithGherkin, tests.length) * 1.5) +
    Math.round(toPercent(testsWithEvidence, tests.length) * 1.0) +
    Math.round(toPercent(testsWithTraceability, tests.length) * 1.3) +
    Math.round(toPercent(storiesWithCoverage, stories.length) * 1.4) +
    Math.round(toPercent(sprintResolvedBeforeEnd, sprintItems.length) * 1.6);

  const totalPoints = testPoints + execPoints + qualityBonus;
  const level = calcLevel(totalPoints);

  const metrics = {
    testsCreatedByMe: tests.length,
    executionsByMe: execs.length,
    defectsReportedByMe: defects.length,
    defectsRetestedAfterResolved,
    testPlansCreatedByMe: plans.length,
    testPlansWithAssociatedTests,
    storiesCreatedByMe: stories.length,
    storiesWithCoverage,
    descriptionCoveragePct: toPercent(testsWithDescription, tests.length),
    gherkinCoveragePct: toPercent(testsWithGherkin, tests.length),
    evidenceCoveragePct: toPercent(testsWithEvidence, tests.length),
    traceabilityCoveragePct: toPercent(testsWithTraceability, tests.length),
    storyCoveragePct: toPercent(storiesWithCoverage, stories.length),
    sprintMovedToInProgress: sprintMovedToInProgress,
    sprintResolvedBeforeEnd: sprintResolvedBeforeEnd,
    sprintResolvedBeforeEndPct: toPercent(sprintResolvedBeforeEnd, sprintItems.length)
  };

  const badges = buildBadges(metrics);
  const jqlFilters = {
    testsCreatedByMe: `project = "${key}" AND issuetype in (${testTypeClause}) AND ${userAttributionClause} ORDER BY updated DESC`,
    executionsByMe: execJql,
    defectsReportedByMe: defectsJql,
    defectsRetestedAfterResolved: `project = "${key}" AND issuetype in ("${DEFECT_TYPES.join('", "')}") AND reporter = currentUser() AND status CHANGED TO ("In Progress", "Testing", "Reopened") ORDER BY updated DESC`,
    testPlansCreatedByMe: plansJql,
    testPlansWithAssociatedTests: `project = "${key}" AND issuetype = "${xrayPlanType}" AND ${userAttributionClause} AND issueLinkType is not EMPTY ORDER BY updated DESC`,
    storyCoveragePct: `project = "${key}" AND issuetype in ("${STORY_TYPES.join('", "')}") AND creator = currentUser() AND issueLinkType is not EMPTY ORDER BY updated DESC`,
    sprintResolvedBeforeEndPct: `project = "${key}" AND issuetype in (${testTypeClause}, "${xrayExecType}") AND sprint in openSprints() AND ${userAttributionClause} AND statusCategory = Done ORDER BY updated DESC`,
    descriptionCoveragePct: `project = "${key}" AND issuetype in (${testTypeClause}) AND ${userAttributionClause} AND description is not EMPTY ORDER BY updated DESC`,
    gherkinCoveragePct: `project = "${key}" AND issuetype in (${testTypeClause}) AND ${userAttributionClause} AND description ~ "given" AND description ~ "when" AND description ~ "then" ORDER BY updated DESC`,
    evidenceCoveragePct: `project = "${key}" AND issuetype in (${testTypeClause}) AND ${userAttributionClause} AND attachments is not EMPTY ORDER BY updated DESC`,
    traceabilityCoveragePct: `project = "${key}" AND issuetype in (${testTypeClause}) AND ${userAttributionClause} AND issueLinkType is not EMPTY ORDER BY updated DESC`
  };

  return {
    me: accountId,
    projectKey: key,
    totals: {
      ...metrics,
      filledFields: fieldsFilled,
      points: totalPoints,
      level
    },
    quality: {
      testsWithDescription,
      testsWithGherkin,
      testsWithEvidence,
      testsWithTraceability,
      storiesWithCoverage
    },
    sprint: sprintWindow
      ? {
          name: sprintWindow.sprintName,
          durationDays: sprintWindow.durationDays,
          expectedDurationDays: 14,
          isTwoWeekSprint: sprintWindow.durationDays === 14,
          movedToInProgress: sprintMovedToInProgress,
          resolvedBeforeEnd: sprintResolvedBeforeEnd,
          doneCount: sprintDoneCount,
          trackedItems: sprintItems.length
        }
      : {
          name: null,
          durationDays: null,
          expectedDurationDays: 14,
          isTwoWeekSprint: null,
          movedToInProgress: 0,
          resolvedBeforeEnd: 0,
          doneCount: 0,
          trackedItems: 0
        },
    badges,
    executions,
        sprintPerformance,
        jqlFilters
  };
}

// Exportar funções de scoring para uso em webhooks
export { scoreTest, scoreExecution };