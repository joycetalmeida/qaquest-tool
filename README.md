# QAQuest Forge Plugin

QAQuest is an Atlassian Forge app for Jira/Xray that applies
quality-focused gamification to software testing activities.

## Technical Overview

The plugin is implemented as a Forge app with:

- Jira issue panel and project page modules for visualization
- Trigger handlers for Jira issue creation/update events
- Lifecycle handlers for app installation/uninstallation events
- Real-time scoring logic based on Xray/Jira data
- Badge progression, level calculation, and usage analytics

Main technical components:

- `src/index.js`: main resolver and integration entrypoint
- `src/webhooks.js`: event processing for Jira issue changes
- `src/lifecycle.js`: app lifecycle event handling
- `src/reward-events.js`: gamification event/reward processing
- `src/game-report.js`: progress and score reporting
- `src/usage-analytics.js`: usage telemetry and activity signals
- `src/gamification-storage.js`: app storage abstractions
- `static/hello-world/`: frontend UI (dashboard, badges, quality panels)

## Prerequisites

To run or validate QAQuest in Jira Cloud, you need:

1. Atlassian Cloud account with access to a Jira Cloud site
2. Permission to install Forge apps in that site (site admin recommended)
3. Node.js 20+ and npm
4. Atlassian Forge CLI installed and authenticated

Forge setup reference:

- https://developer.atlassian.com/platform/forge/set-up-forge/

## Local Development

From the repository root:

```bash
cd QAQuest
npm install
cd static/hello-world
npm install
npm run build
cd ../..
forge deploy
```

Optional local tunnel for iterative frontend/backend debugging:

```bash
forge tunnel
```

## Artifact Availability

Anonymous repository link for artifact availability:

- https://anonymous.4open.science/r/qaquest-plugin-4BF3/README.md
