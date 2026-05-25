import React, { useEffect, useState } from 'react';
import { invoke, view, router } from '@forge/bridge';
import * as bridge from '@forge/bridge';
import './App.css';
import testArchitectIcon from './assets/badges/test-architect.png';
import defectHunterIcon from './assets/badges/defect-hunter.png';
import retestMasterIcon from './assets/badges/retest-master.png';
import planStrategistIcon from './assets/badges/plan-strategist.png';
import eliteDocumenterIcon from './assets/badges/elite-documenter.png';
import gherkinGuardianIcon from './assets/badges/gherkin-guardian.png';
import evidenceCuratorIcon from './assets/badges/evidence-curator.png';
import traceabilityLordIcon from './assets/badges/traceability-lord.png';
import coverageGuardianIcon from './assets/badges/coverage-guardian.png';
import sprintFinisherIcon from './assets/badges/sprint-finisher.png';
import qaquestLogo from './assets/qaquest-logo.png';

export default function App() {
  const [data, setData] = useState(null);
  const [usage, setUsage] = useState(null);
  const [rewardToasts, setRewardToasts] = useState([]);
  const [rewardBursts, setRewardBursts] = useState([]);
  const [currentProjectKey, setCurrentProjectKey] = useState(null);
  const [error, setError] = useState('');

  const openJqlFilter = (filterKey) => {
    const jql = data?.jqlFilters?.[filterKey];
    if (!jql) return;
    router.open(`/issues/?jql=${encodeURIComponent(jql)}`);
  };

  const showHostFlag = (toast) => {
    const showFlag = bridge?.showFlag;
    if (typeof showFlag !== 'function') {
      return false;
    }

    try {
      showFlag({
        id: toast.id,
        title: toast.title,
        description: toast.description,
        type: toast.appearance === 'error' ? 'error' : toast.appearance === 'warning' ? 'warning' : 'success',
        isAutoDismiss: true
      });
      return true;
    } catch (error) {
      return false;
    }
  };

  const showRewardToast = (event) => {
    const id = event?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextToast = {
      id,
      title: 'Achievement Unlocked',
      description: event?.message || 'Congratulations! You earned points.',
      appearance: event?.appearance || 'success'
    };

    const shownInHost = showHostFlag(nextToast);
    if (shownInHost) {
      return;
    }

    setRewardToasts((prev) => [nextToast, ...prev].slice(0, 4));

    const burstId = `${id}-burst`;
    setRewardBursts((prev) => [
      ...prev,
      {
        id: burstId,
        toastId: id,
        pieces: Array.from({ length: 12 }, (_, i) => ({
          id: `${burstId}-${i}`,
          angle: Math.round((360 / 12) * i),
          distance: 44 + (i % 4) * 12,
          delay: (i % 3) * 0.03
        }))
      }
    ]);

    setTimeout(() => {
      setRewardBursts((prev) => prev.filter((b) => b.id !== burstId));
    }, 900);

    setTimeout(() => {
      setRewardToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5500);
  };

  const refreshGameReport = async () => {
    try {
      const ctx = await view.getContext();
      const projectKey = ctx?.extension?.project?.key || null;
      const projectId = ctx?.extension?.project?.id || null;

      if (!projectKey && !projectId) return;

      const report = await invoke('getMyGameReport', { projectKey, projectId });
      setData(report);
    } catch (err) {
      // silently fail if refresh fails
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const ctx = await view.getContext();

        const projectKey = ctx?.extension?.project?.key || null;
        const projectId = ctx?.extension?.project?.id || null;

        if (!projectKey && !projectId) {
          setError('Unable to identify project from page context.');
          return;
        }

        setCurrentProjectKey(projectKey || null);

        const report = await invoke('getMyGameReport', { projectKey, projectId });
        setData(report);

        await invoke('trackUiEvent', {
          action: 'ui-opened',
          source: 'custom-ui',
          projectKey
        });

        const usageSummary = await invoke('getUsageSummary', { days: 14 });
        setUsage(usageSummary);
      } catch (e) {
        setError(`Error loading QAQuest: ${e?.message || 'unknown'}`);
      }
    })();
  }, []);

  useEffect(() => {
    if (!currentProjectKey) return undefined;

    let mounted = true;

    const pollRewards = async () => {
      try {
        const events = await invoke('consumeRewardEvents', { projectKey: currentProjectKey });
        if (!mounted || !Array.isArray(events) || events.length === 0) return;
        
        events.forEach(showRewardToast);
        
        // Refresh game report after consuming rewards to update points display
        setTimeout(() => {
          if (mounted) refreshGameReport();
        }, 500);
      } catch (err) {
        // Nao bloqueia UI em caso de falha pontual no polling.
      }
    };

    pollRewards();
    const timer = setInterval(pollRewards, 1000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [currentProjectKey]);

  if (error) return <div className="box">⚠️ {error}</div>;
  if (!data) return <div className="box">⏳ Loading QAQuest...</div>;

  const USE_MOCK_SPRINT_SERIES = true;
  const mockedSprintSeries = [
    { sprintId: 'q1s1', sprintName: 'Q1S1', score: 32 },
    { sprintId: 'q1s2', sprintName: 'Q1S2', score: 48 },
    { sprintId: 'q1s3', sprintName: 'Q1S3', score: 41 },
    { sprintId: 'q1s4', sprintName: 'Q1S4', score: 67 },
    { sprintId: 'q1s5', sprintName: 'Q1S5', score: 59 },
    { sprintId: 'q1s6', sprintName: 'Q1S6', score: 78 },
    { sprintId: 'q2s1', sprintName: 'Q2S1', score: 92 },
    { sprintId: 'q2s2', sprintName: 'Q2S2', score: 86 },
    { sprintId: 'q2s3', sprintName: 'Q2S3', score: 104 },
    { sprintId: 'q2s4', sprintName: 'Q2S4', score: 97 },
    { sprintId: 'q2s5', sprintName: 'Q2S5', score: 118 },
    { sprintId: 'q2s6', sprintName: 'Q2S6', score: 109 },
    { sprintId: 'q3s1', sprintName: 'Q3S1', score: 136 },
    { sprintId: 'q3s2', sprintName: 'Q3S2', score: 128 },
    { sprintId: 'q3s3', sprintName: 'Q3S3', score: 149 },
    { sprintId: 'q3s4', sprintName: 'Q3S4', score: 141 },
    { sprintId: 'q3s5', sprintName: 'Q3S5', score: 166 },
    { sprintId: 'q3s6', sprintName: 'Q3S6', score: 158 },
    { sprintId: 'q4s1', sprintName: 'Q4S1', score: 182 },
    { sprintId: 'q4s2', sprintName: 'Q4S2', score: 171 },
    { sprintId: 'q4s3', sprintName: 'Q4S3', score: 196 },
    { sprintId: 'q4s4', sprintName: 'Q4S4', score: 188 },
    { sprintId: 'q4s5', sprintName: 'Q4S5', score: 214 },
    { sprintId: 'q4s6', sprintName: 'Q4S6', score: 205 },
    { sprintId: 'q5s1', sprintName: 'Q5S1', score: 228 },
    { sprintId: 'q5s2', sprintName: 'Q5S2', score: 216 }
  ];

  const sprintSeries = USE_MOCK_SPRINT_SERIES
    ? mockedSprintSeries
    : (data.sprintPerformance || []).slice(-26);
  const sprintYearFromDates = sprintSeries
    .map((s) => {
      const d = s?.endDate || s?.startDate;
      if (!d) return null;
      const parsed = new Date(d);
      return Number.isNaN(parsed.getTime()) ? null : parsed.getFullYear();
    })
    .filter((y) => Number.isInteger(y));
  const sprintPerformanceYear = USE_MOCK_SPRINT_SERIES ? 2025 : (sprintYearFromDates[0] || new Date().getFullYear());
  const maxSprintScore = Math.max(1, ...sprintSeries.map((s) => s.score || 0));
  const chartHeight = 200;
  const chartBarWidth = 42;
  const chartGap = 20;
  const chartPaddingX = 16;
  const chartPaddingY = 24;
  const chartWidth = chartPaddingX * 2 + sprintSeries.length * chartBarWidth + Math.max(0, sprintSeries.length - 1) * chartGap;

  const compactSprintLabel = (name, index) => {
    const raw = (name || `Sprint ${index + 1}`).trim();
    const numericSuffix = raw.match(/(\d+)\s*$/);
    if (numericSuffix) return `S${numericSuffix[1]}`;
    return raw.length <= 6 ? raw : `${raw.slice(0, 5)}…`;
  };

  const badgeImageById = {
    'tests-created': testArchitectIcon,
    'defects-reported': defectHunterIcon,
    'defects-retested': retestMasterIcon,
    'plans-associated': planStrategistIcon,
    'description-quality': eliteDocumenterIcon,
    'gherkin-quality': gherkinGuardianIcon,
    'evidence-quality': evidenceCuratorIcon,
    'traceability-quality': traceabilityLordIcon,
    'story-coverage': coverageGuardianIcon,
    'sprint-flow': sprintFinisherIcon
  };

  const MAX_LEVEL = 10;
  const POINTS_PER_LEVEL = 140;
  const totalPoints = Number(data?.totals?.points || 0);
  const currentLevel = Math.max(1, Math.min(MAX_LEVEL, Number(data?.totals?.level || 1)));
  const currentLevelStart = (currentLevel - 1) * POINTS_PER_LEVEL;
  const nextLevelTarget = currentLevel < MAX_LEVEL ? currentLevel * POINTS_PER_LEVEL : currentLevelStart;
  const pointsIntoLevel = currentLevel < MAX_LEVEL ? Math.max(0, totalPoints - currentLevelStart) : POINTS_PER_LEVEL;
  const pointsToNextLevel = currentLevel < MAX_LEVEL ? Math.max(0, nextLevelTarget - totalPoints) : 0;
  const qaPointsProgressPct = currentLevel < MAX_LEVEL
    ? Math.min(100, Math.round((pointsIntoLevel / POINTS_PER_LEVEL) * 100))
    : 100;
  const levelProgressPct = Math.round((currentLevel / MAX_LEVEL) * 100);

  const projectLogoSrc = qaquestLogo;

  return (
    <div className="wrap">
      <div className="reward-toast-stack" aria-live="polite" aria-atomic="true">
        {rewardToasts.map((toast) => (
          <div key={toast.id} className={`reward-toast ${toast.appearance}`}>
            <div className="reward-burst-layer" aria-hidden="true">
              {rewardBursts.filter((burst) => burst.toastId === toast.id).map((burst) => (
                <div key={burst.id} className="reward-burst">
                  {burst.pieces.map((piece) => (
                    <span
                      key={piece.id}
                      className="reward-burst-piece"
                      style={{
                        '--burst-angle': `${piece.angle}deg`,
                        '--burst-distance': `${piece.distance}px`,
                        '--burst-delay': `${piece.delay}s`
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="reward-toast-title">{toast.title}</div>
            <div className="reward-toast-desc">{toast.description}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-header">
        <h2 className="dashboard-title">
          <img
            className="dashboard-title-logo"
            src={projectLogoSrc}
            alt="QAQuest logo"
            loading="eager"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
          <span>QAQuest Dashboard</span>
        </h2>
        <div className="dashboard-summary" aria-label="QAQuest summary">
          <div className="card qa-highlight qa-progress-card dashboard-summary-card" title="Total QA points">
            <div className="qa-progress-head">
              <span className="metric-label"><span className="metric-emoji" aria-hidden="true">⭐</span><span className="metric-label-text">QA Points</span></span>
              <span className="metric-value">{data.totals.points}</span>
            </div>
            <div className="qa-progress-meta">
              {currentLevel < MAX_LEVEL ? `${pointsToNextLevel} pts to Lv ${currentLevel + 1}` : 'Max level reached'}
            </div>
            <div className="qa-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={qaPointsProgressPct} aria-label="QA points progress to next level">
              <span className="qa-progress-fill" style={{ width: `${qaPointsProgressPct}%` }} />
            </div>
          </div>
          <div className="card qa-highlight qa-progress-card dashboard-summary-card" title="Current level">
            <div className="qa-progress-head">
              <span className="metric-label"><span className="metric-emoji" aria-hidden="true">🏅</span><span className="metric-label-text">Level</span></span>
              <span className="metric-value">{data.totals.level}</span>
            </div>
            <div className="qa-progress-meta">Level {currentLevel}/{MAX_LEVEL}</div>
            <div className="qa-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={levelProgressPct} aria-label="Current level progress">
              <span className="qa-progress-fill" style={{ width: `${levelProgressPct}%` }} />
            </div>
          </div>
        </div>
      </div>
      <p>Your Xray data for project <b>{data.projectKey}</b>.</p>

      <section className="overview-layout">
        <div className="overview-column">
          <h3>Badges</h3>
          <div className="badges">
            {(data.badges || []).map((b) => (
              <div key={b.id} className={`badge ${b.unlocked ? 'unlocked' : 'locked'}`}>
                <div className="badge-icon-shell" aria-hidden="true">
                  <img
                    className="badge-icon"
                    src={badgeImageById[b.id]}
                    alt={b.name}
                    loading="lazy"
                  />
                </div>
                <div className="badge-text">
                  <span className="badge-name">{b.name}</span>
                  <span className="badge-level">{b.metricValue}{b.metricType === 'percent' ? '%' : ''} • Lv {b.level}/{b.maxLevel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overview-column">
          <h3>Metrics</h3>
          <div className="metrics-grid">
            <button type="button" className="card card-button metric-card" onClick={() => openJqlFilter('testsCreatedByMe')}>
              <span className="metric-label"><span className="metric-emoji" aria-hidden="true">🧪</span><span className="metric-label-text">Tests Created</span></span>
              <span className="metric-value">{data.totals.testsCreatedByMe}</span>
              <span className="card-arrow">↗</span>
            </button>
            <button type="button" className="card card-button metric-card" onClick={() => openJqlFilter('executionsByMe')}>
              <span className="metric-label"><span className="metric-emoji" aria-hidden="true">⚙️</span><span className="metric-label-text">Executions</span></span>
              <span className="metric-value">{data.totals.executionsByMe}</span>
              <span className="card-arrow">↗</span>
            </button>
            <button type="button" className="card card-button metric-card" onClick={() => openJqlFilter('defectsReportedByMe')}>
              <span className="metric-label"><span className="metric-emoji" aria-hidden="true">🐞</span><span className="metric-label-text">Defects Reported</span></span>
              <span className="metric-value">{data.totals.defectsReportedByMe}</span>
              <span className="card-arrow">↗</span>
            </button>
            <button type="button" className="card card-button metric-card" onClick={() => openJqlFilter('defectsRetestedAfterResolved')}>
              <span className="metric-label"><span className="metric-emoji" aria-hidden="true">🔁</span><span className="metric-label-text">Defects Retested</span></span>
              <span className="metric-value">{data.totals.defectsRetestedAfterResolved}</span>
              <span className="card-arrow">↗</span>
            </button>
            <button type="button" className="card card-button metric-card" onClick={() => openJqlFilter('testPlansCreatedByMe')}>
              <span className="metric-label"><span className="metric-emoji" aria-hidden="true">🗂️</span><span className="metric-label-text">Test Plans</span></span>
              <span className="metric-value">{data.totals.testPlansCreatedByMe}</span>
              <span className="card-arrow">↗</span>
            </button>
            <button type="button" className="card card-button metric-card" onClick={() => openJqlFilter('testPlansWithAssociatedTests')}>
              <span className="metric-label"><span className="metric-emoji" aria-hidden="true">✅</span><span className="metric-label-text">Plans with Tests</span></span>
              <span className="metric-value">{data.totals.testPlansWithAssociatedTests}</span>
              <span className="card-arrow">↗</span>
            </button>
            <button type="button" className="card card-button metric-card" onClick={() => openJqlFilter('storyCoveragePct')}>
              <span className="metric-label"><span className="metric-emoji" aria-hidden="true">🧭</span><span className="metric-label-text">Story Coverage</span></span>
              <span className="metric-value">{data.totals.storyCoveragePct}%</span>
              <span className="card-arrow">↗</span>
            </button>
            <button type="button" className="card card-button metric-card" onClick={() => openJqlFilter('sprintResolvedBeforeEndPct')}>
              <span className="metric-label"><span className="metric-emoji" aria-hidden="true">🏃</span><span className="metric-label-text">Sprint Resolved</span></span>
              <span className="metric-value">{data.totals.sprintResolvedBeforeEndPct}%</span>
              <span className="card-arrow">↗</span>
            </button>
          </div>
        </div>
      </section>

      <section className="middle-layout">
        <div className="section-column">
          <h3 className="section-title">Quality Assurance</h3>
          <div className="grid">
            <button type="button" className="card card-button qa-item-card" onClick={() => openJqlFilter('descriptionCoveragePct')}>
              <span className="qa-item-label"><span className="section-emoji" aria-hidden="true">📝</span><span className="qa-item-text">Tests with Description</span></span>
              <b className="qa-item-value">{data.totals.descriptionCoveragePct}%</b>
              <span className="card-arrow">↗</span>
            </button>
            <button type="button" className="card card-button qa-item-card" onClick={() => openJqlFilter('gherkinCoveragePct')}>
              <span className="qa-item-label"><span className="section-emoji" aria-hidden="true">📜</span><span className="qa-item-text">Gherkin Steps</span></span>
              <b className="qa-item-value">{data.totals.gherkinCoveragePct}%</b>
              <span className="card-arrow">↗</span>
            </button>
            <button type="button" className="card card-button qa-item-card" onClick={() => openJqlFilter('evidenceCoveragePct')}>
              <span className="qa-item-label"><span className="section-emoji" aria-hidden="true">📎</span><span className="qa-item-text">Evidence Attached</span></span>
              <b className="qa-item-value">{data.totals.evidenceCoveragePct}%</b>
              <span className="card-arrow">↗</span>
            </button>
            <button type="button" className="card card-button qa-item-card" onClick={() => openJqlFilter('traceabilityCoveragePct')}>
              <span className="qa-item-label"><span className="section-emoji" aria-hidden="true">🔗</span><span className="qa-item-text">Linked to Story/Task</span></span>
              <b className="qa-item-value">{data.totals.traceabilityCoveragePct}%</b>
              <span className="card-arrow">↗</span>
            </button>
          </div>
        </div>

        <div className="section-column">
          <h3 className="section-title">Current Sprint</h3>
          <div className="grid sprint-grid">
            <div className="card sprint-item-card"><span className="qa-item-label"><span className="section-emoji" aria-hidden="true">📅</span><span className="qa-item-text">Sprint</span></span><b className="qa-item-value">{data.sprint?.name || 'Not found'}</b></div>
            <div className="card sprint-item-card"><span className="qa-item-label"><span className="section-emoji" aria-hidden="true">⏱️</span><span className="qa-item-text">Duration</span></span><b className="qa-item-value">{data.sprint?.durationDays ?? '-'} days</b></div>
            <div className="card sprint-item-card"><span className="qa-item-label"><span className="section-emoji" aria-hidden="true">📌</span><span className="qa-item-text">Two-Week Window</span></span><b className="qa-item-value">{data.sprint?.isTwoWeekSprint === null ? '-' : data.sprint?.isTwoWeekSprint ? 'Yes' : 'No'}</b></div>
            <div className="card sprint-item-card"><span className="qa-item-label"><span className="section-emoji" aria-hidden="true">🛠️</span><span className="qa-item-text">Moved to In Progress</span></span><b className="qa-item-value">{data.totals.sprintMovedToInProgress}</b></div>
            <div className="card sprint-item-card"><span className="qa-item-label"><span className="section-emoji" aria-hidden="true">✅</span><span className="qa-item-text">Resolved Before End</span></span><b className="qa-item-value">{data.totals.sprintResolvedBeforeEnd}</b></div>
            <div className="card sprint-item-card"><span className="qa-item-label"><span className="section-emoji" aria-hidden="true">📦</span><span className="qa-item-text">Tracked Items</span></span><b className="qa-item-value">{data.sprint?.trackedItems || 0}</b></div>
          </div>
        </div>
      </section>

      <h3 className="section-title">{`${sprintPerformanceYear} Sprints Performance`}</h3>
      {sprintSeries.length === 0 ? (
        <div className="box">No sprint data available yet.</div>
      ) : (
        <div className="chart-wrap">
          <svg
            width={chartWidth}
            height={chartHeight + 80}
            viewBox={`0 0 ${chartWidth} ${chartHeight + 80}`}
            preserveAspectRatio="xMinYMin meet"
            className="sprint-chart"
            role="img"
            aria-label="QA points per sprint"
          >
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>

            {/* Bars */}
            {sprintSeries.map((s, i) => {
              const x = chartPaddingX + i * (chartBarWidth + chartGap);
              const h = Math.max(8, Math.round(((s.score || 0) / maxSprintScore) * chartHeight));
              const y = chartPaddingY + (chartHeight - h);
              const shortName = compactSprintLabel(s.sprintName, i);
              const fullName = s.sprintName || `Sprint ${i + 1}`;

              return (
                <g key={s.sprintId || `${s.sprintName}-${i}`}>
                  <title>{`${fullName}: ${s.score || 0} pts`}</title>
                  <rect x={x} y={y} width={chartBarWidth} height={h} rx="8" className="bar-total" />
                  <text x={x + chartBarWidth / 2} y={y - 6} textAnchor="middle" className="bar-value">{s.score || 0}</text>
                  <text x={x + chartBarWidth / 2} y={chartHeight + chartPaddingY + 28} textAnchor="middle" className="bar-label">{shortName}</text>
                </g>
              );
            })}

            
          </svg>
        </div>
      )}

      <h3>Plugin Usage (Last 14 Days)</h3>
      {!usage ? (
        <div className="box">Loading usage metrics...</div>
      ) : (
        <div className="grid">
          <div className="card">📈 Total Events: <b>{usage.totalEvents}</b></div>
          <div className="card">👤 Active Users (Month): <b>{usage.monthlyActiveUsers}</b></div>
          <div className="card">🏢 Active Sites (Month): <b>{usage.monthlyActiveSites}</b></div>
        </div>
      )}
    </div>
  );
}