# Mission Control Sidebar Implementation Plan

**Status**: ✅ Complete
**Completed**: 2025-11-30
**Implementation Summary**: Projects Dashboard + Sidebar WebviewView + Wizard Welcome Removal

---

## Overview

Replace the current TreeView sidebar (componentTreeProvider) with a **WebviewView sidebar** that serves as "Mission Control" - a contextual, actionable hub that guides users through their journey while maintaining the Adobe Spectrum design system.

## Goals

1. **Transform the sidebar from a problem into a feature** - Always useful, never confusing
2. **Guide non-technical users** - Clear actions, friendly language, progressive disclosure
3. **Maintain design consistency** - Adobe Spectrum components, existing CSS utilities, VS Code theme integration
4. **Support all user states** - Welcome, wizard progress, project management, demo control

## User Journey States

The sidebar will display different content based on user state:

| State | Sidebar Shows |
|-------|---------------|
| No Project | Welcome message + "Create New Demo" CTA |
| Wizard In Progress | Step progress indicator |
| Project Loaded (Demo Stopped) | Project card + Start button + Quick actions |
| Project Loaded (Demo Running) | Project card + Stop/Restart + Open Browser + Status |

---

## Architecture

### File Structure

```
src/features/sidebar/
├── index.ts                           # Public exports
├── providers/
│   └── missionControlProvider.ts      # WebviewViewProvider implementation
├── ui/
│   ├── index.tsx                      # Entry point (webpack)
│   ├── MissionControlSidebar.tsx      # Main container component
│   ├── views/
│   │   ├── WelcomeView.tsx           # No project state
│   │   ├── WizardProgressView.tsx    # During wizard
│   │   └── ProjectView.tsx           # Project loaded state
│   └── components/
│       ├── ProjectCard.tsx           # Current project status card
│       ├── QuickActions.tsx          # Action buttons list
│       ├── ProgressIndicator.tsx     # Wizard step progress
│       ├── RecentProjects.tsx        # Project switcher
│       └── QuickLinks.tsx            # Help/docs links
└── handlers/
    └── sidebarHandlers.ts            # Message handlers
```

### Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                     Extension Host                           │
├─────────────────────────────────────────────────────────────┤
│  MissionControlProvider (WebviewViewProvider)                │
│  ├── Receives state from StateManager                        │
│  ├── Sends updates to webview                                │
│  └── Handles actions from webview                            │
├─────────────────────────────────────────────────────────────┤
│                  WebviewClient (handshake)                    │
├─────────────────────────────────────────────────────────────┤
│              MissionControlSidebar (React)                   │
│  ├── WebviewApp wrapper (theme, handshake)                   │
│  ├── State-based view rendering                              │
│  └── Spectrum components + existing CSS utilities            │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Phase 1: Foundation (Backend)

#### Step 1.1: Update package.json

Change from TreeView to WebviewView:

```json
"views": {
  "demoBuilder": [
    {
      "id": "demoBuilder.missionControl",
      "name": "Mission Control",
      "type": "webview"
    }
  ]
}
```

**Key change**: `"type": "webview"` tells VS Code to use a WebviewViewProvider.

#### Step 1.2: Create MissionControlProvider

New file: `src/features/sidebar/providers/missionControlProvider.ts`

```typescript
import * as vscode from 'vscode';
import { StateManager } from '@/core/state';
import { Logger } from '@/core/logging';

export class MissionControlProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'demoBuilder.missionControl';

    private _view?: vscode.WebviewView;
    private stateManager: StateManager;
    private logger: Logger;
    private extensionUri: vscode.Uri;

    constructor(
        extensionUri: vscode.Uri,
        stateManager: StateManager,
        logger: Logger
    ) {
        this.extensionUri = extensionUri;
        this.stateManager = stateManager;
        this.logger = logger;

        // Re-render when project state changes
        this.stateManager.onProjectChanged(() => this.updateView());
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        // Set up message handling
        webviewView.webview.onDidReceiveMessage(
            this.handleMessage.bind(this)
        );

        // Render initial HTML
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        // Send initial state after webview is ready
        this.setupHandshake();
    }

    private setupHandshake(): void {
        // Listen for webview ready signal, then send init data
    }

    private async handleMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'createProject':
                await vscode.commands.executeCommand('demoBuilder.createProject');
                break;
            case 'openDashboard':
                await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
                break;
            case 'startDemo':
                await vscode.commands.executeCommand('demoBuilder.startDemo');
                break;
            case 'stopDemo':
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
                break;
            case 'switchProject':
                await vscode.commands.executeCommand('demoBuilder.switchProject');
                break;
            // ... other actions
        }
    }

    private async updateView(): Promise<void> {
        if (!this._view) return;

        const project = await this.stateManager.getCurrentProject();
        const demoStatus = await this.stateManager.getDemoStatus();

        this._view.webview.postMessage({
            type: 'stateUpdate',
            payload: {
                project,
                demoStatus,
                // ... other state
            }
        });
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        // Return HTML that loads the React bundle
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'missionControl.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'missionControl.css')
        );

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
        </head>
        <body>
            <div id="root"></div>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    // Public method to notify wizard progress
    public updateWizardProgress(step: number, totalSteps: number, stepName: string): void {
        this._view?.webview.postMessage({
            type: 'wizardProgress',
            payload: { step, totalSteps, stepName }
        });
    }
}
```

#### Step 1.3: Register Provider in extension.ts

```typescript
// In extension.ts activate()

// Create Mission Control provider
const missionControlProvider = new MissionControlProvider(
    context.extensionUri,
    stateManager,
    logger
);

// Register it
context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
        MissionControlProvider.viewType,
        missionControlProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true  // Keep state when sidebar hidden
            }
        }
    )
);

// Store reference for wizard progress updates
commandManager.setMissionControlProvider(missionControlProvider);
```

#### Step 1.4: Add Webpack Entry Point

In `webpack.config.js`:

```javascript
entry: {
    wizard: './src/features/project-creation/ui/wizard/index.tsx',
    welcome: './webview-ui/src/welcome/index.tsx',
    dashboard: './webview-ui/src/dashboard/index.tsx',
    configure: './webview-ui/src/configure/index.tsx',
    missionControl: './src/features/sidebar/ui/index.tsx'  // NEW
}
```

---

### Phase 2: React UI Components

#### Step 2.1: Entry Point

New file: `src/features/sidebar/ui/index.tsx`

```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WebviewApp } from '@/core/ui/components/WebviewApp';
import { MissionControlSidebar } from './MissionControlSidebar';

// Import shared styles
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/custom-spectrum.css';

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
    <WebviewApp>
        {(initData) => <MissionControlSidebar initData={initData} />}
    </WebviewApp>
);
```

#### Step 2.2: Main Container Component

New file: `src/features/sidebar/ui/MissionControlSidebar.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { WelcomeView } from './views/WelcomeView';
import { WizardProgressView } from './views/WizardProgressView';
import { ProjectView } from './views/ProjectView';

interface SidebarState {
    project: Project | null;
    demoStatus: 'running' | 'stopped' | 'starting' | 'stopping';
    wizardProgress: { step: number; totalSteps: number; stepName: string } | null;
}

export const MissionControlSidebar: React.FC<{ initData: any }> = ({ initData }) => {
    const [state, setState] = useState<SidebarState>({
        project: initData?.project || null,
        demoStatus: initData?.demoStatus || 'stopped',
        wizardProgress: null
    });

    useEffect(() => {
        // Listen for state updates from extension
        const unsubState = webviewClient.onMessage('stateUpdate', (payload) => {
            setState(prev => ({ ...prev, ...payload }));
        });

        // Listen for wizard progress updates
        const unsubWizard = webviewClient.onMessage('wizardProgress', (payload) => {
            setState(prev => ({ ...prev, wizardProgress: payload }));
        });

        // Listen for wizard completion
        const unsubComplete = webviewClient.onMessage('wizardComplete', () => {
            setState(prev => ({ ...prev, wizardProgress: null }));
        });

        return () => {
            unsubState();
            unsubWizard();
            unsubComplete();
        };
    }, []);

    // Determine which view to show based on state
    const renderContent = () => {
        // If wizard is in progress, show progress view
        if (state.wizardProgress) {
            return <WizardProgressView progress={state.wizardProgress} />;
        }

        // If no project, show welcome
        if (!state.project) {
            return <WelcomeView />;
        }

        // Otherwise show project view
        return (
            <ProjectView
                project={state.project}
                demoStatus={state.demoStatus}
            />
        );
    };

    return (
        <div className="mission-control-sidebar">
            {renderContent()}
        </div>
    );
};
```

#### Step 2.3: Welcome View (No Project)

New file: `src/features/sidebar/ui/views/WelcomeView.tsx`

```typescript
import React from 'react';
import { Button, Heading, Text, Divider } from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import BookOpen from '@spectrum-icons/workflow/BookOpen';
import Help from '@spectrum-icons/workflow/Help';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

export const WelcomeView: React.FC = () => {
    const handleCreateProject = () => {
        webviewClient.postMessage('createProject', {});
    };

    return (
        <div className="flex flex-column gap-4 p-3">
            {/* Hero Section */}
            <div className="welcome-card p-4 rounded-lg">
                <Heading level={4} UNSAFE_className="mb-2">
                    Welcome!
                </Heading>
                <Text UNSAFE_className="text-sm text-gray-400 mb-4">
                    Ready to create your first Adobe Commerce demo?
                </Text>

                <Button
                    variant="accent"
                    onPress={handleCreateProject}
                    UNSAFE_className="w-full"
                >
                    <Add />
                    <Text>Create New Demo</Text>
                </Button>
            </div>

            <Divider size="S" />

            {/* Quick Links */}
            <div className="flex flex-column gap-2">
                <Text UNSAFE_className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
                    Quick Links
                </Text>

                <button
                    className="quick-link-button"
                    onClick={() => webviewClient.postMessage('openDocs', {})}
                >
                    <BookOpen size="S" />
                    <span>Documentation</span>
                </button>

                <button
                    className="quick-link-button"
                    onClick={() => webviewClient.postMessage('openHelp', {})}
                >
                    <Help size="S" />
                    <span>Get Help</span>
                </button>
            </div>
        </div>
    );
};
```

#### Step 2.4: Wizard Progress View

New file: `src/features/sidebar/ui/views/WizardProgressView.tsx`

```typescript
import React from 'react';
import { Heading, Text, ProgressBar } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Circle from '@spectrum-icons/workflow/Circle';

interface WizardProgressViewProps {
    progress: {
        step: number;
        totalSteps: number;
        stepName: string;
    };
}

const STEP_NAMES = [
    'Welcome',
    'Adobe Sign-In',
    'Select Project',
    'Select Workspace',
    'Choose Components',
    'API Mesh Setup',
    'Review & Create'
];

export const WizardProgressView: React.FC<WizardProgressViewProps> = ({ progress }) => {
    const { step, totalSteps, stepName } = progress;
    const percentage = Math.round((step / totalSteps) * 100);

    return (
        <div className="flex flex-column gap-4 p-3">
            {/* Header */}
            <div className="mb-2">
                <Heading level={4} UNSAFE_className="mb-1">
                    Creating Your Demo
                </Heading>
                <Text UNSAFE_className="text-sm text-gray-400">
                    Step {step} of {totalSteps}
                </Text>
            </div>

            {/* Progress Bar */}
            <ProgressBar
                value={percentage}
                label="Progress"
                showValueLabel={false}
                UNSAFE_className="mb-3"
            />

            {/* Step List */}
            <div className="flex flex-column gap-1">
                {STEP_NAMES.slice(0, totalSteps).map((name, index) => {
                    const stepNum = index + 1;
                    const isComplete = stepNum < step;
                    const isCurrent = stepNum === step;

                    return (
                        <div
                            key={name}
                            className={`
                                flex items-center gap-2 py-1 px-2 rounded
                                ${isCurrent ? 'bg-blue-900 bg-opacity-20' : ''}
                            `}
                        >
                            {isComplete ? (
                                <CheckmarkCircle
                                    size="S"
                                    UNSAFE_className="text-green-500"
                                />
                            ) : (
                                <Circle
                                    size="S"
                                    UNSAFE_className={isCurrent ? 'text-blue-500' : 'text-gray-600'}
                                />
                            )}
                            <Text
                                UNSAFE_className={`
                                    text-sm
                                    ${isComplete ? 'text-gray-500' : ''}
                                    ${isCurrent ? 'font-semibold' : ''}
                                `}
                            >
                                {name}
                            </Text>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
```

#### Step 2.5: Project View (Project Loaded)

New file: `src/features/sidebar/ui/views/ProjectView.tsx`

```typescript
import React from 'react';
import { Button, Heading, Text, Divider } from '@adobe/react-spectrum';
import Play from '@spectrum-icons/workflow/Play';
import Stop from '@spectrum-icons/workflow/Stop';
import Refresh from '@spectrum-icons/workflow/Refresh';
import Globe from '@spectrum-icons/workflow/Globe';
import Settings from '@spectrum-icons/workflow/Settings';
import Dashboard from '@spectrum-icons/workflow/Dashboard';
import FolderOpen from '@spectrum-icons/workflow/FolderOpen';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ProjectCard } from '../components/ProjectCard';
import { QuickActions } from '../components/QuickActions';
import { RecentProjects } from '../components/RecentProjects';

interface ProjectViewProps {
    project: Project;
    demoStatus: 'running' | 'stopped' | 'starting' | 'stopping';
}

export const ProjectView: React.FC<ProjectViewProps> = ({ project, demoStatus }) => {
    const isRunning = demoStatus === 'running';
    const isTransitioning = demoStatus === 'starting' || demoStatus === 'stopping';

    const handleStart = () => webviewClient.postMessage('startDemo', {});
    const handleStop = () => webviewClient.postMessage('stopDemo', {});
    const handleRestart = () => webviewClient.postMessage('restartDemo', {});
    const handleOpenBrowser = () => webviewClient.postMessage('openBrowser', {});

    return (
        <div className="flex flex-column gap-3 p-3">
            {/* Project Status Card */}
            <ProjectCard project={project} demoStatus={demoStatus} />

            {/* Demo Controls */}
            <div className="flex gap-2">
                {!isRunning ? (
                    <Button
                        variant="accent"
                        onPress={handleStart}
                        isDisabled={isTransitioning}
                        UNSAFE_className="flex-1"
                    >
                        <Play />
                        <Text>Start</Text>
                    </Button>
                ) : (
                    <>
                        <Button
                            variant="negative"
                            onPress={handleStop}
                            isDisabled={isTransitioning}
                            UNSAFE_className="flex-1"
                        >
                            <Stop />
                            <Text>Stop</Text>
                        </Button>
                        <Button
                            variant="secondary"
                            onPress={handleRestart}
                            isDisabled={isTransitioning}
                        >
                            <Refresh />
                        </Button>
                    </>
                )}
            </div>

            {/* Open in Browser (when running) */}
            {isRunning && (
                <Button
                    variant="secondary"
                    onPress={handleOpenBrowser}
                    UNSAFE_className="w-full"
                >
                    <Globe />
                    <Text>Open in Browser</Text>
                </Button>
            )}

            <Divider size="S" />

            {/* Quick Actions */}
            <QuickActions />

            <Divider size="S" />

            {/* Recent Projects (collapsible) */}
            <RecentProjects currentProjectPath={project.path} />
        </div>
    );
};
```

#### Step 2.6: Supporting Components

**ProjectCard.tsx:**
```typescript
import React from 'react';
import { Text } from '@adobe/react-spectrum';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';

interface ProjectCardProps {
    project: Project;
    demoStatus: string;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, demoStatus }) => {
    const statusConfig = {
        running: { color: 'green', label: 'Running' },
        stopped: { color: 'gray', label: 'Stopped' },
        starting: { color: 'blue', label: 'Starting...' },
        stopping: { color: 'orange', label: 'Stopping...' }
    };

    const status = statusConfig[demoStatus] || statusConfig.stopped;

    return (
        <div className="project-card p-3 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between mb-2">
                <Text UNSAFE_className="font-semibold text-md truncate">
                    {project.name}
                </Text>
            </div>

            <div className="flex items-center gap-2">
                <StatusDot status={status.color} />
                <Text UNSAFE_className="text-sm text-gray-400">
                    {status.label}
                    {demoStatus === 'running' && project.frontendPort && (
                        <> on :{project.frontendPort}</>
                    )}
                </Text>
            </div>
        </div>
    );
};
```

**QuickActions.tsx:**
```typescript
import React from 'react';
import { Text } from '@adobe/react-spectrum';
import Dashboard from '@spectrum-icons/workflow/Dashboard';
import Settings from '@spectrum-icons/workflow/Settings';
import Refresh from '@spectrum-icons/workflow/Refresh';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

export const QuickActions: React.FC = () => {
    const actions = [
        {
            icon: Dashboard,
            label: 'Open Dashboard',
            action: () => webviewClient.postMessage('openDashboard', {})
        },
        {
            icon: Settings,
            label: 'Configure',
            action: () => webviewClient.postMessage('openConfigure', {})
        },
        {
            icon: Refresh,
            label: 'Check for Updates',
            action: () => webviewClient.postMessage('checkUpdates', {})
        }
    ];

    return (
        <div className="flex flex-column gap-1">
            <Text UNSAFE_className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                Quick Actions
            </Text>

            {actions.map(({ icon: Icon, label, action }) => (
                <button
                    key={label}
                    className="quick-action-button"
                    onClick={action}
                >
                    <Icon size="S" />
                    <span>{label}</span>
                </button>
            ))}
        </div>
    );
};
```

---

### Phase 3: Styling

#### Step 3.1: Add Sidebar-Specific Styles

Add to `src/core/ui/styles/custom-spectrum.css`:

```css
/* ============================================
   MISSION CONTROL SIDEBAR
   ============================================ */

.mission-control-sidebar {
    height: 100%;
    overflow-y: auto;
    background: var(--vscode-sideBar-background);
}

/* Project Card */
.project-card {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    transition: border-color 0.15s ease;
}

.project-card:hover {
    border-color: var(--vscode-focusBorder);
}

/* Quick Action Buttons */
.quick-action-button,
.quick-link-button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--vscode-foreground);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;
}

.quick-action-button:hover,
.quick-link-button:hover {
    background: var(--vscode-list-hoverBackground);
}

.quick-action-button:active,
.quick-link-button:active {
    background: var(--vscode-list-activeSelectionBackground);
}

/* Welcome Card */
.welcome-card {
    background: linear-gradient(
        135deg,
        var(--spectrum-global-color-blue-900) 0%,
        var(--spectrum-global-color-blue-800) 100%
    );
    border-radius: 8px;
}

/* Wizard Progress Indicators */
.wizard-step-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    transition: background-color 0.15s ease;
}

.wizard-step-indicator.current {
    background: rgba(var(--spectrum-global-color-blue-500-rgb), 0.15);
}

.wizard-step-indicator.complete .step-icon {
    color: var(--spectrum-global-color-green-500);
}
```

---

### Phase 4: Integration

#### Step 4.1: Wire Up Wizard Progress

In the wizard container, broadcast progress to sidebar:

```typescript
// In WizardContainer.tsx or step navigation logic
const updateSidebarProgress = (step: number) => {
    // Send progress to extension, which forwards to sidebar
    webviewClient.postMessage('wizardStepChanged', {
        step,
        totalSteps: TOTAL_STEPS,
        stepName: STEP_NAMES[step - 1]
    });
};
```

In extension command handler:
```typescript
// Forward wizard progress to Mission Control
case 'wizardStepChanged':
    missionControlProvider.updateWizardProgress(
        message.payload.step,
        message.payload.totalSteps,
        message.payload.stepName
    );
    break;
```

#### Step 4.2: Remove Old TreeView Provider

1. Delete `src/features/components/providers/componentTreeProvider.ts`
2. Remove TreeView registration from `extension.ts`
3. Update any references

#### Step 4.3: Update Welcome Screen Logic

Since the sidebar now shows welcome content, simplify the auto-open logic:

```typescript
// In extension.ts - the sidebar IS the welcome experience now
// No need to auto-open a separate Welcome webview for first-time users
```

---

### Phase 5: Testing

#### Test Scenarios

1. **First-time user**: Click icon → See welcome view with "Create New Demo" button
2. **During wizard**: Click "Create New Demo" → Sidebar shows progress as user advances
3. **After project creation**: Sidebar shows project card with Start button
4. **Running demo**: Start button → Stop/Restart + Open Browser appear
5. **Project switching**: "Other Projects" section allows switching

#### Unit Tests

- `MissionControlProvider.test.ts` - Provider message handling
- `MissionControlSidebar.test.tsx` - State-based rendering
- `WelcomeView.test.tsx` - Welcome interactions
- `ProjectView.test.tsx` - Demo control interactions

---

## Design System Compliance

| Aspect | Implementation |
|--------|----------------|
| **Components** | React Spectrum (Button, Text, Heading, Divider, ProgressBar) |
| **Icons** | @spectrum-icons/workflow |
| **Layout** | Existing CSS flex/gap utilities |
| **Colors** | VS Code theme variables + Spectrum semantic colors |
| **Typography** | Existing .text-* and .font-* utilities |
| **Spacing** | Existing .p-*, .m-*, .gap-* utilities |
| **Theming** | Automatic via vscode-theme.css integration |
| **Communication** | WebviewClient handshake protocol |

---

## Migration Path

1. **Phase 1**: Implement new sidebar alongside existing TreeView (can coexist during development)
2. **Phase 2**: Test thoroughly with all user flows
3. **Phase 3**: Remove old TreeView, update package.json
4. **Phase 4**: Remove auto-open Welcome logic (sidebar handles it)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| WebviewView slower than TreeView | Use `retainContextWhenHidden: true` to preserve state |
| Complex state synchronization | Leverage existing StateManager + onProjectChanged pattern |
| Design inconsistency | Strict use of existing CSS utilities, no custom one-offs |
| Wizard/sidebar desync | Clear message protocol, single source of truth (extension) |

---

## Success Metrics

- [ ] First-time user can create project without confusion
- [ ] Sidebar never shows "empty" or confusing state
- [ ] All actions achievable in ≤2 clicks
- [ ] Visual consistency with existing webviews
- [ ] No performance regression

---

## Time Estimate

| Phase | Effort |
|-------|--------|
| Phase 1: Foundation | 4-6 hours |
| Phase 2: React Components | 6-8 hours |
| Phase 3: Styling | 2-3 hours |
| Phase 4: Integration | 3-4 hours |
| Phase 5: Testing | 4-6 hours |
| **Total** | **19-27 hours** |

---

## Open Questions for PM

1. Should "Recent Projects" section be collapsed by default to save space?
2. Should we include mesh status in the project card, or keep it dashboard-only?
3. Do we want wizard progress in sidebar, or is that over-engineering for V1?
4. Should clicking the Activity Bar icon when sidebar is open close it, or keep it open?
