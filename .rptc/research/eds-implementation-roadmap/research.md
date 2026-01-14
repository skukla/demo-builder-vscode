# EDS Component Implementation Roadmap

**Research Date:** December 16, 2025
**Last Updated:** January 12, 2026
**Approach:** Option C (Full Integration)
**Priority:** Build right (solid foundation)
**Estimated Duration:** ~5 weeks

---

## Overview

Building Option C (Full Integration) with a "build right" approach. This roadmap is organized into phases that build on each other, with each phase delivering working functionality.

**Implementation Status:**
| Phase | Name | Status |
|-------|------|--------|
| Phase 1 | Foundation | ⬜ Not Started |
| Phase 2 | GitHub Integration | ⬜ Not Started |
| Phase 3 | DA.live Integration | ⬜ Not Started |
| Phase 4 | Block Provisioning | ⬜ Not Started |
| Phase 5 | Orchestration & Polish | ⬜ Not Started |
| Phase 6 | Code Sync Guidance | ✅ **IMPLEMENTED** (Jan 2026) |
| Phase 7 | EDS Dashboard Actions | ✅ **IMPLEMENTED** (Jan 2026) |

**Note:** Phases 6 and 7 were implemented early to support initial EDS workflow. Phases 1-5 remain for full automation.

**Capabilities Being Implemented:**
1. Add new DA.live project for a user
2. Populate it with documents
3. Populate it with custom blocks
4. Associate the new DA.live project to an EDS GitHub project
5. ✅ Guide users through GitHub App installation (Phase 6)
6. ✅ Publish and Reset EDS projects from dashboard (Phase 7)

---

## Phase 1: Foundation (Week 1)

### Goal: Add EDS as a selectable component with basic clone functionality

### 1.1 Component Registry Entry

| Task | File | Description |
|------|------|-------------|
| Add EDS component definition | `templates/components.json` | Define `eds-storefront` with source, deps, env vars |
| Add to frontend selection group | `templates/components.json` | Add to `selectionGroups.frontends` |
| Add demo template | `templates/demo-templates.json` | Create "EDS Commerce Demo" template |

**Component Definition:**
```json
{
  "eds-storefront": {
    "name": "EDS Headless Storefront",
    "description": "Edge Delivery Services powered storefront with Adobe Commerce integration",
    "source": {
      "type": "git",
      "url": "https://github.com/adobe/aem-boilerplate",
      "gitOptions": { "shallow": true }
    },
    "dependencies": {
      "required": ["commerce-mesh"]
    },
    "configuration": {
      "nodeVersion": "20",
      "port": 3000,
      "requiredEnvVars": ["MESH_ENDPOINT", "DA_LIVE_ORG", "DA_LIVE_SITE", "GITHUB_REPO_OWNER", "GITHUB_REPO_NAME"],
      "customSetup": "eds"
    }
  }
}
```

### 1.2 Environment Variables

| New Env Var | Purpose |
|-------------|---------|
| `DA_LIVE_ORG` | DA.live organization identifier |
| `DA_LIVE_SITE` | DA.live site/project name |
| `GITHUB_REPO_OWNER` | GitHub org/user for EDS repo |
| `GITHUB_REPO_NAME` | GitHub repository name |

### Deliverable
Users can select EDS frontend, clone from template repo, configure env vars manually.

---

## Phase 2: GitHub Integration (Weeks 2-3)

### Goal: Create GitHub repos and configure fstab.yaml automatically

### 2.1 GitHub OAuth Service

| Task | New File | Description |
|------|----------|-------------|
| Create OAuth service | `src/features/eds/services/githubOAuthService.ts` | Popup-based OAuth flow |
| Add token storage | `src/features/eds/services/githubTokenManager.ts` | Secure localStorage + validation |
| Create API client | `src/features/eds/services/githubApiClient.ts` | Octokit wrapper with retry |

**OAuth Flow (from storefront-tools pattern):**
```
User clicks "Configure GitHub" in wizard
    ↓
Opens popup → github.com/login/oauth/authorize
    ↓
User authorizes → callback with code
    ↓
Exchange code for token → store securely
    ↓
Validate token → display success
```

**OAuth Service Interface:**
```typescript
interface GitHubOAuthService {
  // Initiate OAuth flow via popup
  initiateOAuth(): Promise<void>;

  // Handle callback with authorization code
  handleCallback(code: string): Promise<string>;

  // Validate existing token
  validateToken(): Promise<TokenValidationResult>;

  // Get current token (if valid)
  getToken(): Promise<string | null>;

  // Clear stored token
  logout(): Promise<void>;
}
```

### 2.2 GitHub Operations Service

| Task | New File | Description |
|------|----------|-------------|
| Repository operations | `src/features/eds/services/githubRepoService.ts` | Create from template, update files |

**Key Operations:**
```typescript
interface GitHubRepoService {
  // Create repo from aem-boilerplate template
  createFromTemplate(owner: string, name: string, options?: {
    private?: boolean;
    description?: string;
  }): Promise<RepoInfo>;

  // Check if repo exists
  repoExists(owner: string, name: string): Promise<boolean>;

  // Update/create file in repo
  updateFile(owner: string, repo: string, path: string, content: string, message: string): Promise<void>;

  // Generate and push fstab.yaml
  configureFstab(owner: string, repo: string, daLiveOrg: string, daLiveSite: string): Promise<void>;

  // Get file contents
  getFile(owner: string, repo: string, path: string): Promise<string | null>;
}
```

**fstab.yaml Template:**
```yaml
mountpoints:
  /: https://content.da.live/{daLiveOrg}/{daLiveSite}/
```

### 2.3 Wizard Integration

| Task | File | Description |
|------|------|-------------|
| Add GitHub auth step | `src/features/eds/ui/steps/GitHubAuthStep.tsx` | OAuth UI in wizard |
| Add repo config step | `src/features/eds/ui/steps/RepoConfigStep.tsx` | Repo name, visibility settings |

**GitHub Auth Step UI:**
```
┌─────────────────────────────────────────────────┐
│  🔗 Connect GitHub Account                      │
│                                                 │
│  To create your EDS repository, we need         │
│  permission to access your GitHub account.      │
│                                                 │
│  [Connect with GitHub]                          │
│                                                 │
│  ✓ Connected as @username                       │
│    Org: your-org (3 repos)                     │
└─────────────────────────────────────────────────┘
```

### Deliverable
Wizard creates GitHub repo from template and configures fstab.yaml automatically.

---

## Phase 3: DA.live Integration (Weeks 3-4)

### Goal: Populate DA.live with initial content

### 3.1 DA.live API Service

| Task | New File | Description |
|------|----------|-------------|
| Admin API client | `src/features/eds/services/daLiveApiClient.ts` | HTTP client for admin.da.live |
| Content operations | `src/features/eds/services/daLiveContentService.ts` | Create, copy, list operations |

**API Client Interface:**
```typescript
interface DaLiveApiClient {
  // Set authentication token (from IMS)
  setToken(token: string): void;

  // Source operations
  getSource(org: string, repo: string, path: string): Promise<Response>;
  createSource(org: string, repo: string, path: string, content: FormData): Promise<Response>;
  deleteSource(org: string, repo: string, path: string): Promise<Response>;

  // Copy/move operations
  copySource(org: string, repo: string, sourcePath: string, destPath: string): Promise<Response>;
  moveSource(org: string, repo: string, sourcePath: string, destPath: string): Promise<Response>;

  // List operations
  listDirectory(org: string, repo: string, path: string): Promise<DirectoryListing>;

  // Config operations
  getConfig(org: string, repo: string, path: string): Promise<SheetConfig>;
  setConfig(org: string, repo: string, path: string, config: SheetConfig): Promise<Response>;
}
```

**Content Service Interface:**
```typescript
interface DaLiveContentService {
  // Check if site exists
  siteExists(org: string, site: string): Promise<boolean>;

  // Create directory structure
  createDirectory(org: string, site: string, path: string): Promise<void>;

  // Upload HTML document
  uploadDocument(org: string, site: string, path: string, html: string): Promise<void>;

  // Upload media asset
  uploadAsset(org: string, site: string, path: string, file: Buffer, mimeType: string): Promise<void>;

  // Copy content from template source
  copyFromTemplate(templateOrg: string, templateSite: string, destOrg: string, destSite: string): Promise<void>;

  // Bulk upload documents
  uploadDocuments(org: string, site: string, documents: DocumentUpload[]): Promise<UploadResult>;
}
```

### 3.2 Content Templates

| Task | New Directory | Description |
|------|---------------|-------------|
| Create content templates | `templates/eds-content/` | HTML documents for initial site |

**Template Structure:**
```
templates/eds-content/
├── index.html           # Homepage with hero, featured products
├── nav.html             # Navigation structure
├── footer.html          # Footer content with links
├── products/
│   └── index.html       # Product listing page
├── cart/
│   └── index.html       # Cart page
├── checkout/
│   └── index.html       # Checkout page
└── account/
    └── index.html       # Account page
```

**Example Homepage Template (index.html):**
```html
<body>
  <header></header>
  <main>
    <div class="hero">
      <div>
        <picture>
          <source type="image/webp" srcset="./media/hero.webp">
          <img src="./media/hero.png" alt="Hero image">
        </picture>
      </div>
      <div>
        <h1>Welcome to Your Store</h1>
        <p>Discover our amazing products</p>
        <p><a href="/products">Shop Now</a></p>
      </div>
    </div>
    <div class="product-list">
      <div>
        <div>Featured Products</div>
      </div>
    </div>
  </main>
  <footer></footer>
</body>
```

### 3.3 IMS Token Verification

| Task | File | Description |
|------|------|-------------|
| Test IMS compatibility | `src/features/eds/services/daLiveAuthAdapter.ts` | Verify existing IMS tokens work |

**Auth Adapter Interface:**
```typescript
interface DaLiveAuthAdapter {
  // Get IMS token from Demo Builder's auth service
  getImsToken(): Promise<string | null>;

  // Test if IMS token works for DA.live
  verifyDaLiveAccess(org: string): Promise<boolean>;

  // Get user's DA.live permissions
  getUserPermissions(org: string): Promise<DaLivePermissions>;
}
```

### Deliverable
Wizard populates DA.live with initial content structure.

---

## Phase 4: Block Provisioning (Week 4)

### Goal: Add custom commerce blocks to GitHub repo

### 4.1 Block Templates

| Task | New Directory | Description |
|------|---------------|-------------|
| Create block templates | `templates/eds-blocks/` | JS/CSS for commerce blocks |

**Block Structure:**
```
templates/eds-blocks/
├── product-list/
│   ├── product-list.js
│   └── product-list.css
├── product-details/
│   ├── product-details.js
│   └── product-details.css
├── cart/
│   ├── cart.js
│   └── cart.css
├── mini-cart/
│   ├── mini-cart.js
│   └── mini-cart.css
├── checkout/
│   ├── checkout.js
│   └── checkout.css
└── account/
    ├── account.js
    └── account.css
```

**Example Block (product-list.js):**
```javascript
import { initializeDropin } from '@dropins/storefront-sdk';
import ProductList from '@dropins/storefront-plp';

export default async function decorate(block) {
  const category = block.querySelector('[data-category]')?.dataset.category || 'default';

  await initializeDropin(ProductList, {
    container: block,
    config: {
      catalogServiceEndpoint: window.MESH_ENDPOINT,
      category
    }
  });
}
```

### 4.2 Block Provisioning Service

| Task | New File | Description |
|------|----------|-------------|
| Block provisioner | `src/features/eds/services/blockProvisioningService.ts` | Upload blocks to GitHub repo |

**Service Interface:**
```typescript
interface BlockProvisioningService {
  // Get available block templates
  getAvailableBlocks(): BlockTemplate[];

  // Provision selected blocks to GitHub repo
  provisionBlocks(owner: string, repo: string, blocks: string[]): Promise<ProvisionResult>;

  // Provision single block
  provisionBlock(owner: string, repo: string, blockId: string): Promise<void>;

  // Check if block already exists
  blockExists(owner: string, repo: string, blockId: string): Promise<boolean>;
}

interface BlockTemplate {
  id: string;
  name: string;
  description: string;
  category: 'commerce' | 'layout' | 'content';
  files: { path: string; content: string }[];
  dependencies?: string[];
}
```

### 4.3 Block Selection UI

| Task | File | Description |
|------|------|-------------|
| Block selection step | `src/features/eds/ui/steps/BlockSelectionStep.tsx` | Checkbox list of available blocks |

**Block Selection UI:**
```
┌─────────────────────────────────────────────────┐
│  🧱 Select Commerce Blocks                      │
│                                                 │
│  Choose which blocks to include in your project │
│                                                 │
│  Commerce Blocks:                               │
│  ☑ Product List    - Display product grids     │
│  ☑ Product Details - Single product view       │
│  ☑ Cart            - Shopping cart             │
│  ☑ Mini Cart       - Header cart widget        │
│  ☐ Checkout        - Full checkout flow        │
│  ☐ Account         - User account pages        │
│                                                 │
│  [Select All]  [Select None]                   │
└─────────────────────────────────────────────────┘
```

### Deliverable
Users can select which commerce blocks to include in their EDS project.

---

## Phase 5: Orchestration & Polish (Week 5)

### Goal: Tie everything together into a smooth wizard flow

### 5.1 EDS Setup Orchestrator

| Task | New File | Description |
|------|----------|-------------|
| Setup orchestrator | `src/features/eds/services/edsSetupOrchestrator.ts` | Coordinates all EDS setup steps |

**Orchestration Flow:**
```
1. Validate Prerequisites
   ├── GitHub token valid?
   ├── IMS token valid?
   └── DA.live org accessible?

2. Create GitHub Repository
   ├── Generate from aem-boilerplate
   ├── Wait for repo ready (poll)
   └── Configure fstab.yaml

3. Provision Blocks
   ├── Upload selected block templates
   └── Verify files created

4. Populate DA.live Content
   ├── Create directory structure
   ├── Upload template documents
   └── Verify content accessible

5. Configure Commerce Integration
   ├── Update config.json with mesh endpoint
   └── Set environment variables

6. Finalize
   ├── Clone repo locally
   ├── npm install
   └── Save project manifest
```

**Orchestrator Interface:**
```typescript
interface EdsSetupOrchestrator {
  // Execute full setup
  setup(config: EdsSetupConfig): Promise<EdsSetupResult>;

  // Resume from checkpoint
  resume(checkpointId: string): Promise<EdsSetupResult>;

  // Get current progress
  getProgress(): EdsSetupProgress;

  // Cancel in-progress setup
  cancel(): Promise<void>;
}

interface EdsSetupConfig {
  github: {
    owner: string;
    repoName: string;
    private: boolean;
  };
  daLive: {
    org: string;
    site: string;
  };
  blocks: string[];
  commerce: {
    meshEndpoint: string;
    commerceUrl: string;
  };
}

interface EdsSetupProgress {
  phase: 'prerequisites' | 'github' | 'blocks' | 'content' | 'commerce' | 'finalize';
  step: number;
  totalSteps: number;
  message: string;
  error?: string;
}
```

### 5.2 Error Handling & Recovery

| Task | File | Description |
|------|------|-------------|
| Error recovery service | `src/features/eds/services/edsErrorRecovery.ts` | Handle partial failures |

**Recovery Scenarios:**

| Failure Point | Recovery Strategy |
|---------------|-------------------|
| GitHub repo created but fstab failed | Retry fstab update |
| Content upload partial | Resume from last successful document |
| Block upload failed | Retry individual blocks |
| npm install failed | Retry with clean node_modules |
| Clone failed | Retry clone with fresh token |

**Recovery Service Interface:**
```typescript
interface EdsErrorRecovery {
  // Create checkpoint for current state
  createCheckpoint(state: EdsSetupState): string;

  // Load checkpoint
  loadCheckpoint(checkpointId: string): EdsSetupState | null;

  // Determine recovery action
  getRecoveryAction(error: EdsSetupError): RecoveryAction;

  // Execute recovery
  executeRecovery(action: RecoveryAction, state: EdsSetupState): Promise<EdsSetupState>;
}
```

### 5.3 Progress Tracking

| Task | File | Description |
|------|------|-------------|
| Progress integration | `src/features/eds/ui/components/EdsSetupProgress.tsx` | Real-time progress display |

**Progress UI:**
```
┌─────────────────────────────────────────────────┐
│  🚀 Setting Up Your EDS Project                 │
│                                                 │
│  ✓ Prerequisites verified                       │
│  ✓ GitHub repository created                    │
│  ● Provisioning blocks... (3/6)                │
│  ○ Populating DA.live content                  │
│  ○ Configuring commerce                         │
│  ○ Finalizing project                          │
│                                                 │
│  [████████░░░░░░░░░░] 45%                       │
│                                                 │
│  Uploading: product-details block...           │
└─────────────────────────────────────────────────┘
```

### Deliverable
Complete EDS project creation flow with robust error handling.

---

## Phase 6: Code Sync Guidance (Week 5) ✅ IMPLEMENTED

### Goal: Guide users through AEM Code Sync authorization

**Status**: ✅ Implemented (January 2026) with different approach than originally planned.

### 6.1 Code Sync UI - IMPLEMENTED

| Task | File | Description | Status |
|------|------|-------------|--------|
| Code Sync dialog | `src/features/eds/ui/components/GitHubAppInstallDialog.tsx` | Installation dialog with polling | ✅ Done |
| Pre-flight check | `src/features/project-creation/ui/steps/ProjectCreationStep.tsx` | Check before creation starts | ✅ Done |
| Error recovery | `src/features/project-creation/ui/steps/ProjectCreationStep.tsx` | Handle mid-creation failures | ✅ Done |

**Implementation Notes:**
- Used a **dialog component** instead of a wizard step for better UX
- Dialog appears as pre-flight check or on-error recovery
- Integrated into `ProjectCreationStep` with multiple entry points

**Actual UI Flow:**
```
┌─────────────────────────────────────────────────┐
│  📦 Install AEM Code Sync                       │
│                                                 │
│  The AEM Code Sync GitHub App is required to    │
│  sync your code to Edge Delivery Services.      │
│                                                 │
│  1. Click "Open Installation Page"              │
│  2. Select "Only select repositories"           │
│  3. Choose: owner/repo                          │
│  4. Click "Install"                             │
│  5. Return here - we'll detect it automatically │
│                                                 │
│  [Open Installation Page]  [Check Installation] │
│                                                 │
│  Status: ○ Waiting for installation...          │
└─────────────────────────────────────────────────┘
```

### 6.2 Verification - IMPLEMENTED (Different Approach)

| Task | Description | Status |
|------|-------------|--------|
| Check via Status API | Uses `admin.hlx.page/status/{owner}/{repo}/main` endpoint | ✅ Done |
| Parse `code.status` field | 200 = App installed, 404 = Not installed | ✅ Done |
| Polling with detection | 5-second intervals, auto-detect when installed | ✅ Done |
| Manual check button | "Check Installation" for immediate verification | ✅ Done |

**Actual Verification Logic (implemented):**
```typescript
// src/features/eds/services/GitHubAppService.ts
async function isAppInstalled(owner: string, repo: string): Promise<GitHubAppCheckResult> {
  const statusUrl = `https://admin.hlx.page/status/${owner}/${repo}/main`;

  const response = await fetch(statusUrl, {
    headers: { 'x-auth-token': githubToken }
  });

  if (!response.ok) {
    return { isInstalled: false, installUrl: buildInstallUrl(owner) };
  }

  const data = await response.json();
  // code.status = 200 means app is installed and syncing
  // code.status = 404 means app is not installed
  const isInstalled = data.code?.status === 200;

  return {
    isInstalled,
    installUrl: isInstalled ? undefined : buildInstallUrl(owner)
  };
}
```

**Key Difference from Original Plan:**
- Original: Poll `/code/{org}/{repo}/main/scripts/aem.js` with HEAD request
- Actual: Poll `/status/{owner}/{repo}/main` and check `code.status` field
- Reason: Status endpoint provides explicit installation status, more reliable than file presence check

### 6.3 Error Handling - IMPLEMENTED

| Component | Error Handling | Status |
|-----------|---------------|--------|
| `GitHubAppNotInstalledError` | Custom error class with `owner`, `repo`, `installUrl` | ✅ Done |
| `checkGitHubAppHandler.ts` | Pre-flight check handler | ✅ Done |
| `ProjectCreationStep.tsx` | Listens for `creationFailed` message with `GITHUB_APP_NOT_INSTALLED` error type | ✅ Done |
| `dashboardHandlers.ts` | Shows VS Code error dialog with "Install GitHub App" button | ✅ Done |
| `projectsListHandlers.ts` | Same dashboard error handling | ✅ Done |

**Error Recovery Flow:**
```
1. Pre-flight check before creation
   ├─ App installed? → Proceed with creation
   └─ App not installed? → Show GitHubAppInstallDialog
       ├─ User installs app → Polling detects → Continue creation
       └─ User cancels → Return to wizard

2. Error during creation (mid-flight)
   ├─ Extension sends: { type: 'creationFailed', errorType: 'GITHUB_APP_NOT_INSTALLED', errorDetails: {...} }
   └─ UI catches message → Shows GitHubAppInstallDialog → User installs → Retries

3. Dashboard actions (Publish/Reset)
   ├─ Operation fails with GitHubAppNotInstalledError
   └─ VS Code shows native dialog: "Install GitHub App" button → Opens install URL
```

### Deliverable
✅ Users are guided through Code Sync setup with automatic detection and multiple recovery paths.

---

## Phase 7: EDS Dashboard Actions ✅ IMPLEMENTED

### Goal: Provide Publish and Reset actions for EDS projects in the dashboard

**Status**: ✅ Implemented (January 2026) - Not in original roadmap, added based on user needs.

### 7.1 Publish Action - IMPLEMENTED

| Task | File | Description | Status |
|------|------|-------------|--------|
| Publish button | `src/features/dashboard/ui/components/EdsActionsPanel.tsx` | Dashboard Publish button | ✅ Done |
| Publish handler | `src/features/dashboard/handlers/dashboardHandlers.ts` | `handlePublishEds` function | ✅ Done |
| Helix Admin API | `src/features/eds/services/HelixService.ts` | Calls preview/publish endpoints | ✅ Done |

**Publish Flow:**
```
User clicks "Publish" in dashboard
    ↓
handlePublishEds() called
    ↓
HelixService.preview(owner, repo, path) - Preview all content
    ↓
HelixService.publish(owner, repo, path) - Publish to live CDN
    ↓
Success notification shown to user
```

### 7.2 Reset Action - IMPLEMENTED

| Task | File | Description | Status |
|------|------|-------------|--------|
| Reset button | `src/features/dashboard/ui/components/EdsActionsPanel.tsx` | Dashboard Reset button | ✅ Done |
| Reset handler | `src/features/dashboard/handlers/dashboardHandlers.ts` | `handleResetEds` function | ✅ Done |
| GitHub repo deletion | `src/features/eds/services/GitHubService.ts` | Delete and recreate repo | ✅ Done |
| DA.live content reset | `src/features/eds/services/DaLiveService.ts` | Delete and recopy content | ✅ Done |
| Helix config reset | `src/features/eds/services/HelixService.ts` | Re-register site | ✅ Done |

**Reset Flow:**
```
User clicks "Reset" in dashboard
    ↓
Confirmation dialog: "This will delete repo and content. Continue?"
    ↓
handleResetEds() called
    ↓
1. Delete GitHub repo (GitHubService.deleteRepo)
2. Delete DA.live content (DaLiveService.deleteContent)
3. Recreate from template (same as initial setup)
4. Re-register with Helix (HelixService.register)
    ↓
Success notification + refresh dashboard
```

### 7.3 Error Handling - IMPLEMENTED

Both Publish and Reset actions include comprehensive error handling:

| Error Type | Handling | User Experience |
|------------|----------|-----------------|
| `GitHubAppNotInstalledError` | VS Code dialog with "Install GitHub App" button | User clicks → Opens install URL |
| Network errors | Logged + user-friendly message | "Failed to publish: Network error" |
| Rate limiting | Exponential backoff retry | Automatic retry, user sees progress |
| Auth failures | Re-authentication prompt | "Please reconnect GitHub account" |

**Error Handling Implementation:**
```typescript
// src/features/dashboard/handlers/dashboardHandlers.ts
async function handleResetEds(context: HandlerContext) {
  try {
    // ... reset logic
  } catch (error) {
    if (error instanceof GitHubAppNotInstalledError) {
      const selection = await vscode.window.showErrorMessage(
        `Cannot reset: GitHub App not installed on ${error.owner}/${error.repo}`,
        'Install GitHub App'
      );
      if (selection === 'Install GitHub App') {
        await vscode.env.openExternal(vscode.Uri.parse(error.installUrl));
      }
      return { success: false, errorType: 'GITHUB_APP_NOT_INSTALLED', errorDetails: {...} };
    }
    // ... other error handling
  }
}
```

### 7.4 Files Added/Modified

| File | Type | Purpose |
|------|------|---------|
| `src/features/eds/services/types.ts` | New | `GitHubAppNotInstalledError` class |
| `src/features/eds/services/GitHubAppService.ts` | New | `isAppInstalled()` check via status endpoint |
| `src/features/dashboard/handlers/dashboardHandlers.ts` | Modified | Added `handlePublishEds`, `handleResetEds` |
| `src/features/projects-dashboard/handlers/projectsListHandlers.ts` | Modified | Same error handling |

### Deliverable
✅ EDS projects have Publish (force CDN refresh) and Reset (recreate from template) actions with robust error handling.

---

## Architecture Summary

### New Feature Directory Structure

```
src/features/eds/
├── index.ts                           # Public API exports
├── commands/
│   └── setupEdsProject.ts             # VS Code command
├── services/
│   ├── githubOAuthService.ts          # GitHub OAuth flow
│   ├── githubTokenManager.ts          # Token storage
│   ├── githubApiClient.ts             # Octokit wrapper
│   ├── githubRepoService.ts           # Repo operations
│   ├── GitHubAppService.ts            # ✅ GitHub App installation check (Phase 6)
│   ├── daLiveApiClient.ts             # DA.live Admin API
│   ├── daLiveContentService.ts        # Content operations
│   ├── daLiveAuthAdapter.ts           # IMS token adapter
│   ├── blockProvisioningService.ts    # Block upload
│   ├── edsSetupOrchestrator.ts        # Main orchestrator
│   ├── edsErrorRecovery.ts            # Error handling
│   └── types.ts                       # ✅ GitHubAppNotInstalledError (Phase 6)
├── ui/
│   ├── steps/
│   │   ├── GitHubAuthStep.tsx         # GitHub OAuth UI
│   │   ├── RepoConfigStep.tsx         # Repo settings
│   │   ├── DaLiveConfigStep.tsx       # DA.live settings
│   │   └── BlockSelectionStep.tsx     # Block picker
│   └── components/
│       ├── EdsSetupProgress.tsx       # Progress display
│       └── GitHubAppInstallDialog.tsx # ✅ Code Sync install dialog (Phase 6)
├── handlers/
│   ├── edsHandlers.ts                 # Message handlers
│   └── checkGitHubAppHandler.ts       # ✅ GitHub App check handler (Phase 6)
└── types.ts                           # TypeScript types

src/features/dashboard/handlers/
└── dashboardHandlers.ts               # ✅ Added handlePublishEds, handleResetEds (Phase 7)

src/features/projects-dashboard/handlers/
└── projectsListHandlers.ts            # ✅ GitHubAppNotInstalledError handling (Phase 7)

src/features/project-creation/
├── ui/steps/
│   └── ProjectCreationStep.tsx        # ✅ GitHub App pre-flight check + error listener (Phase 6)
├── ui/wizard/hooks/
│   └── useMessageListeners.ts         # ✅ Optional onGitHubAppRequired callback (Phase 6)
└── handlers/
    └── checkGitHubAppHandler.ts       # ✅ Handler for check-github-app message (Phase 6)
```

### Template Additions

```
templates/
├── eds-content/                       # DA.live content templates
│   ├── index.html
│   ├── nav.html
│   ├── footer.html
│   ├── products/
│   │   └── index.html
│   ├── cart/
│   │   └── index.html
│   └── ...
├── eds-blocks/                        # Block templates
│   ├── product-list/
│   │   ├── product-list.js
│   │   └── product-list.css
│   ├── product-details/
│   ├── cart/
│   ├── mini-cart/
│   └── ...
├── components.json                    # Updated with eds-storefront
└── demo-templates.json                # Updated with EDS template
```

---

## Implementation Order (Dependency Graph)

```
Phase 1: Foundation
    │
    ▼
Phase 2: GitHub Integration ──────┐
    │                             │
    ▼                             │
Phase 3: DA.live Integration      │
    │                             │
    ▼                             │
Phase 4: Block Provisioning ◄─────┘
    │
    ▼
Phase 5: Orchestration & Polish
    │
    ▼
Phase 6: Code Sync Guidance ✅ IMPLEMENTED
    │
    ▼
Phase 7: EDS Dashboard Actions ✅ IMPLEMENTED
```

**Note:** Phases 6 and 7 were implemented out-of-order to support the initial EDS workflow with manual setup. The remaining phases (1-5) will enable full automation.

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| IMS tokens don't work for DA.live | Medium | High | Test early in Phase 3; implement token exchange if needed |
| GitHub OAuth complexity | Low | Medium | Reuse storefront-tools pattern exactly |
| Rate limits (DA.live or GitHub) | Low | Medium | Implement exponential backoff; use bulk APIs |
| User abandons mid-setup | Medium | Low | Save progress; allow resume from checkpoint |
| Code Sync installation varies | Medium | Low | Provide manual verification option |
| Template repo changes | Low | Medium | Pin to specific tag/version |

---

## Success Metrics

| Phase | Success Criteria | Validation |
|-------|------------------|------------|
| Phase 1 | EDS component selectable, clones successfully | Manual test in wizard |
| Phase 2 | GitHub repo created with correct fstab.yaml | Verify repo exists, fstab correct |
| Phase 3 | DA.live content accessible via preview URL | Check admin.da.live/list |
| Phase 4 | Blocks visible in GitHub repo blocks/ directory | GitHub API verification |
| Phase 5 | Full flow completes without manual intervention | End-to-end test |
| Phase 6 | Code visible on aem.page preview URL | Poll Code Bus |

---

## Testing Strategy

### Unit Tests
- GitHub API client methods
- DA.live API client methods
- Token validation logic
- Error recovery logic

### Integration Tests
- GitHub OAuth flow (mocked)
- Repository creation flow
- Content upload flow
- Block provisioning flow

### End-to-End Tests
- Full wizard flow with test accounts
- Error recovery scenarios
- Resume from checkpoint

---

## Dependencies

### External Libraries (to add)

| Library | Purpose | Version |
|---------|---------|---------|
| `@octokit/core` | GitHub API client | ^6.0.0 |
| `@octokit/plugin-retry` | Retry logic | ^7.0.0 |

### Adobe Services

| Service | Authentication |
|---------|----------------|
| DA.live Admin API | Adobe IMS token |
| AEM Admin API | Adobe IMS token |
| GitHub API | OAuth token |

---

## Related Research

- [Storefront-Tools EDS Integration](../storefront-tools-eds-integration/research.md)
- [EDS Component Feasibility Assessment](../eds-component-feasibility/research.md)

---

## Key Takeaways

1. **7 phases, ~5 weeks** for full integration with "build right" approach
2. **Phase 2 (GitHub) is the critical path** - most complex, most dependencies
3. **Reuse storefront-tools patterns** for OAuth and GitHub operations
4. **IMS token compatibility should be tested early** (Phase 3 risk)
5. **Each phase delivers working functionality** - can ship incrementally
6. ✅ **Code Sync authorization is unavoidable user interaction** - implemented with smooth dialog and auto-detection (Phase 6)
7. ✅ **Dashboard actions (Publish/Reset)** provide ongoing management for EDS projects (Phase 7)

### Current State (January 2026)

**What's Working:**
- GitHub App installation guidance with automatic detection (`GitHubAppInstallDialog`)
- Pre-flight checks before project creation
- Error recovery during and after creation
- Dashboard Publish/Reset actions with comprehensive error handling
- Helix Admin API integration using status endpoint

**What's Next:**
- Phases 1-5 for full automation (no manual GitHub repo creation)
- Automated DA.live content population
- Block provisioning to GitHub repos
- End-to-end orchestration

**Technical Learnings from Implementation:**
1. **Status endpoint over Code endpoint**: `/status/{owner}/{repo}/main` with `code.status` field is more reliable than checking `/code/...` file presence
2. **GitHub token auth for Helix**: Use `x-auth-token` header (not Authorization bearer) for Helix Admin API
3. **Structured error types**: `GitHubAppNotInstalledError` with `owner`, `repo`, `installUrl` enables rich error handling across contexts
