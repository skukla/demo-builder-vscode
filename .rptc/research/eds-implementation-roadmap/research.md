# EDS Component Implementation Roadmap

**Research Date:** December 16, 2025
**Approach:** Option C (Full Integration)
**Priority:** Build right (solid foundation)
**Estimated Duration:** ~5 weeks

---

## Overview

Building Option C (Full Integration) with a "build right" approach. This roadmap is organized into phases that build on each other, with each phase delivering working functionality.

**Capabilities Being Implemented:**
1. Add new DA.live project for a user
2. Populate it with documents
3. Populate it with custom blocks
4. Associate the new DA.live project to an EDS GitHub project

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

## Phase 6: Code Sync Guidance (Week 5)

### Goal: Guide users through AEM Code Sync authorization

### 6.1 Code Sync Instruction UI

| Task | File | Description |
|------|------|-------------|
| Code Sync step | `src/features/eds/ui/steps/CodeSyncStep.tsx` | Instructions + verification |

**UI Flow:**
```
┌─────────────────────────────────────────────────┐
│  📦 Install AEM Code Sync                       │
│                                                 │
│  To sync your code to Edge Delivery Services:   │
│                                                 │
│  1. Click the button below to open GitHub       │
│  2. Select "Only select repositories"           │
│  3. Choose your new repository                  │
│  4. Click "Install"                             │
│  5. Return here and click "Verify"              │
│                                                 │
│  [Open GitHub App Installation]                 │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  [Verify Installation]  [Skip for Now]          │
└─────────────────────────────────────────────────┘
```

### 6.2 Verification

| Task | Description |
|------|-------------|
| Poll Code Bus | Check `admin.hlx.page/code/{org}/{repo}/main/scripts/aem.js` |
| Timeout handling | After 2 minutes, show manual verification option |
| Success display | Show preview URL when verified |

**Verification Logic:**
```typescript
async function verifyCodeSync(owner: string, repo: string): Promise<boolean> {
  const codeBusUrl = `https://admin.hlx.page/code/${owner}/${repo}/main/scripts/aem.js`;
  const maxAttempts = 24; // 2 minutes with 5s interval

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(codeBusUrl, { method: 'HEAD' });
      if (response.ok) {
        return true;
      }
    } catch {
      // Continue polling
    }
    await sleep(5000);
  }

  return false;
}
```

### Deliverable
Users are guided through Code Sync setup with verification.

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
│   ├── daLiveApiClient.ts             # DA.live Admin API
│   ├── daLiveContentService.ts        # Content operations
│   ├── daLiveAuthAdapter.ts           # IMS token adapter
│   ├── blockProvisioningService.ts    # Block upload
│   ├── edsSetupOrchestrator.ts        # Main orchestrator
│   └── edsErrorRecovery.ts            # Error handling
├── ui/
│   ├── steps/
│   │   ├── GitHubAuthStep.tsx         # GitHub OAuth UI
│   │   ├── RepoConfigStep.tsx         # Repo settings
│   │   ├── DaLiveConfigStep.tsx       # DA.live settings
│   │   ├── BlockSelectionStep.tsx     # Block picker
│   │   └── CodeSyncStep.tsx           # Code Sync guidance
│   └── components/
│       └── EdsSetupProgress.tsx       # Progress display
├── handlers/
│   └── edsHandlers.ts                 # Message handlers
└── types.ts                           # TypeScript types
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
Phase 6: Code Sync Guidance
```

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

1. **6 phases, ~5 weeks** for full integration with "build right" approach
2. **Phase 2 (GitHub) is the critical path** - most complex, most dependencies
3. **Reuse storefront-tools patterns** for OAuth and GitHub operations
4. **IMS token compatibility should be tested early** (Phase 3 risk)
5. **Each phase delivers working functionality** - can ship incrementally
6. **Code Sync authorization is unavoidable user interaction** - make it as smooth as possible
