# EDS Frontend Component Feasibility Assessment

**Research Date:** December 16, 2025
**Research Scope:** Hybrid (Demo Builder Codebase + DA.live/EDS APIs)
**Research Depth:** Comprehensive
**Topic:** Feasibility of adding EDS frontend component to Demo Builder

---

## Executive Summary

**Answer: Yes, all four capabilities are technically feasible**, but with important caveats:

| Capability | Feasibility | Automation Level |
|------------|-------------|------------------|
| 1. Add new DA.live project | **Partial** | Requires manual org creation, then API for content |
| 2. Populate with documents | **Full** | DA Admin API with existing IMS tokens |
| 3. Populate with custom blocks | **Full** | GitHub API (blocks live in repo, not DA.live) |
| 4. Associate DA.live ↔ GitHub EDS project | **Full** | GitHub API to create fstab.yaml |

**Key Constraint:** AEM Code Sync GitHub App installation requires one-time user authorization.

---

## Answering Your Specific Questions

### 1. Add a new DA.live project for a user

**Feasibility: PARTIAL**

**What's Possible:**
- ✅ Write content to an **existing** DA.live organization via Admin API
- ✅ Create directory structures within existing orgs
- ✅ Configure permissions for users within orgs

**What's NOT Possible:**
- ❌ Create new DA.live **organizations** programmatically (no public API)
- ❌ Provision new "sites" without prior org setup

**API Endpoint for Content:**
```http
POST https://admin.da.live/source/{org}/{repo}/{path}
Authorization: Bearer <IMS_TOKEN>
Content-Type: multipart/form-data
```

**Workaround Options:**

| Option | Description | User Interaction |
|--------|-------------|------------------|
| **Pre-created org** | Demo Builder uses a shared DA.live org (e.g., `demo-builder-sites`) | None |
| **User's existing org** | User provides their org name during wizard | Minimal (text input) |
| **Cloud Manager API** | Create EDS sites via Cloud Manager (if user has license) | IMS auth already in Demo Builder |

---

### 2. Populate it with documents

**Feasibility: FULL AUTOMATION**

**How it Works:**
```http
POST https://admin.da.live/source/{org}/{repo}/{path}
Authorization: Bearer <IMS_TOKEN>
Content-Type: multipart/form-data

{file content as HTML}
```

**Content Format:** HTML documents (not markdown) following EDS block structure.

**Supported Operations:**

| Operation | API | Method |
|-----------|-----|--------|
| Create document | `/source/{org}/{repo}/{path}` | POST |
| Copy existing content | `/copy/{org}/{repo}/{path}` | POST |
| Move content | `/move/{org}/{repo}/{path}` | POST |
| Version content | `/versionsource/{org}/{repo}/{path}` | POST |
| List directory | `/list/{org}/{repo}/{path}` | GET |

**Authentication:** Adobe IMS tokens that Demo Builder already has should work (same identity provider).

**Rate Limits:** 10 requests/second per project (generous for typical use).

---

### 3. Populate it with custom blocks

**Feasibility: FULL AUTOMATION**

**Key Insight:** Blocks live in the **GitHub repository**, NOT in DA.live.

**Block Structure:**
```
your-eds-repo/
└── blocks/
    └── custom-block/
        ├── custom-block.js    ← JavaScript logic
        └── custom-block.css   ← Styling
```

**GitHub API to Create Block:**
```http
PUT https://api.github.com/repos/{owner}/{repo}/contents/blocks/{block-name}/{block-name}.js
Authorization: token {GITHUB_PAT}
Content-Type: application/json

{
  "message": "Add custom block",
  "content": "<base64-encoded-javascript>"
}
```

**Demo Builder Integration:**
- Blocks are part of the EDS component template repository
- Can clone from template with pre-built blocks
- Can programmatically add blocks via GitHub API if needed

---

### 4. Associate DA.live project to EDS GitHub project

**Feasibility: FULL AUTOMATION**

**How Association Works:**

**Step 1: Create GitHub repo from AEM boilerplate**
```http
POST https://api.github.com/repos/adobe/aem-boilerplate/generate
Authorization: token {GITHUB_PAT}

{
  "owner": "user-org",
  "name": "eds-storefront",
  "private": true
}
```

**Step 2: Configure fstab.yaml (Helix 4) or use Config Service (Helix 5)**
```http
PUT https://api.github.com/repos/{owner}/{repo}/contents/fstab.yaml
Authorization: token {GITHUB_PAT}

{
  "message": "Configure DA.live content source",
  "content": "<base64-encoded-fstab>"
}
```

**fstab.yaml Content:**
```yaml
mountpoints:
  /: https://content.da.live/{org}/{site}/
```

**Step 3: User authorizes AEM Code Sync (ONE TIME)**
- User visits: `https://github.com/apps/aem-code-sync/installations/new`
- Authorizes for their repository
- Code automatically syncs to Edge Delivery CDN

---

## Demo Builder Integration Architecture

### How This Fits Demo Builder's Existing Patterns

Based on the codebase exploration, here's how an EDS component would integrate:

**1. Component Definition** (`templates/components.json`):
```json
{
  "eds-storefront": {
    "name": "EDS Headless Storefront",
    "description": "Edge Delivery Services powered storefront",
    "source": {
      "type": "git",
      "url": "https://github.com/your-org/eds-commerce-template",
      "gitOptions": { "shallow": true }
    },
    "dependencies": {
      "required": ["commerce-mesh"]
    },
    "configuration": {
      "nodeVersion": "20",
      "port": 3000,
      "requiredEnvVars": ["MESH_ENDPOINT", "DA_LIVE_ORG", "DA_LIVE_SITE"],
      "customSetup": "eds"
    }
  }
}
```

**2. EDS-Specific Setup Service** (new service):
```typescript
// src/features/eds/services/edsSetupService.ts
export class EdsSetupService {
  async setupEdsProject(config: EdsConfig): Promise<void> {
    // 1. Create GitHub repo from template
    await this.createGitHubRepo(config);

    // 2. Configure fstab.yaml with DA.live mount
    await this.configureFstab(config);

    // 3. Populate initial content to DA.live
    await this.populateContent(config);

    // 4. Add custom blocks if specified
    await this.provisionBlocks(config);
  }
}
```

**3. Authentication Reuse:**
- Demo Builder already has Adobe IMS tokens via `AuthenticationService`
- These should work for DA.live Admin API
- GitHub OAuth would need to be added (similar pattern to storefront-tools)

---

## Implementation Options

### Option A: Minimal Integration (Fastest)

**What it does:** Clone EDS boilerplate, user configures DA.live separately

**Effort:** Low (1-2 days)
**User Interaction:** User must set up DA.live org and install Code Sync manually

```json
// Just add to components.json
{
  "eds-storefront": {
    "source": { "type": "git", "url": "https://github.com/adobe/aem-boilerplate" },
    "configuration": { "port": 3000 }
  }
}
```

### Option B: GitHub Integration (Medium)

**What it does:** Create GitHub repo from template, configure fstab.yaml

**Effort:** Medium (1-2 weeks)
**User Interaction:** GitHub OAuth once, Code Sync authorization once

**New Components:**
- GitHub OAuth flow (popup pattern from storefront-tools)
- GitHub API service for repo/file operations
- fstab.yaml generator

### Option C: Full Integration (Most Complete)

**What it does:** All of Option B plus DA.live content population

**Effort:** High (3-4 weeks)
**User Interaction:** Same as Option B, plus DA.live org selection

**New Components:**
- DA.live Admin API service
- Content template system (HTML documents)
- Block provisioning system
- Multi-step wizard for EDS configuration

---

## Comparison: Demo Builder Current vs EDS Requirements

| Capability | Demo Builder Current | EDS Requirement | Gap |
|------------|---------------------|-----------------|-----|
| Git clone | ✅ Yes (componentManager.ts) | ✅ Same | None |
| GitHub repo creation | ❌ No (clones only) | ✅ Needed | GitHub API integration |
| GitHub file operations | ❌ No | ✅ Needed for fstab/blocks | GitHub API integration |
| GitHub OAuth | ❌ No | ✅ Needed for user repos | OAuth flow (similar to storefront-tools) |
| Adobe IMS auth | ✅ Yes | ✅ Same | None |
| DA.live API | ❌ No | ✅ Needed for content | New service |
| Node version mgmt | ✅ Yes | ✅ Same | None |
| Port management | ✅ Yes | ✅ Same | None |
| .env generation | ✅ Yes | ✅ Same | None |

---

## DA.live Admin API Reference

### Available Endpoints

**Source Operations:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/source/{org}/{repo}/{path}` | Retrieve content from organization |
| POST | `/source/{org}/{repo}/{path}` | Store new content (multipart/form-data) |
| DELETE | `/source/{org}/{repo}/{path}` | Remove content or directory |

**Copy & Move Operations:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/copy/{org}/{repo}/{path}` | Duplicate source within organization |
| POST | `/move/{org}/{repo}/{path}` | Relocate source to new destination |

**Version Control:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/versionsource/{org}/{repo}/{guid}` | Access specific version by GUID |
| POST | `/versionsource/{org}/{repo}/{path}` | Create snapshot of source |
| GET | `/versionlist/{org}/{repo}/{path}` | Retrieve version history with audit trail |

**Directory & Configuration:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/list/{org}/{repo}/{path}` | Enumerate directory contents |
| GET | `/config/{org}/{repo}/{path}` | Retrieve sheet-formatted settings |
| POST | `/config/{org}/{repo}/{path}` | Establish configuration rules |

**Base URL:** `https://admin.da.live`

**Authentication:** Bearer token (Adobe IMS JWT)

---

## Authentication Requirements Summary

| System | Authentication Method | Token Type |
|--------|----------------------|------------|
| DA.live Admin API | Bearer token | JWT (Adobe IMS) |
| AEM Admin API (admin.hlx.page) | X-Auth-Token or Authorization header | API Key or IMS token |
| Cloud Manager API | OAuth Server-to-Server | Access Token |
| GitHub API | Personal Access Token or OAuth App | PAT or OAuth token |

### Can Adobe IMS tokens (Demo Builder already has) work for DA.live?

**Finding:** **Yes, Adobe IMS tokens should work for DA.live authentication.**

**Technical Requirements:**
- DA.live uses Adobe IMS as identity provider
- Same IMS organization membership should grant access
- IMS access tokens from Demo Builder's existing authentication flow could be reused
- Token format: Bearer token in Authorization header

**Important Distinction:**
- IMS user IDs must be added to DA organization config for access
- Permission configuration in DA.live permissions sheet required

---

## Key File References (Demo Builder Codebase)

### Component System

| File | Purpose |
|------|---------|
| `templates/components.json` | Component registry definitions |
| `src/types/components.ts:59-200` | TypeScript type definitions |
| `src/features/components/services/componentManager.ts:99-200` | Component installation logic |
| `src/features/components/services/ComponentRegistryManager.ts:131-200` | Registry loading and validation |

### Project Creation

| File | Purpose |
|------|---------|
| `src/features/project-creation/handlers/executor.ts:60-150` | Creation orchestration |
| `src/features/project-creation/handlers/services/componentInstallationOrchestrator.ts:35-120` | Installation flow |
| `src/features/project-creation/helpers/envFileGenerator.ts:32-100` | .env file generation |

### Authentication

| File | Purpose |
|------|---------|
| `src/features/authentication/services/authenticationService.ts` | Adobe IMS auth handling |

### Lifecycle

| File | Purpose |
|------|---------|
| `src/features/lifecycle/commands/startDemo.ts:147-200` | Start demo server |

---

## Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **No DA.live org API** | Can't create orgs programmatically | Use shared org OR require user to have org |
| **Code Sync requires auth** | User must authorize GitHub app | Guide user through one-time setup |
| **IMS token compatibility** | May not work for DA.live | Test early, implement token exchange if needed |
| **Rate limits** | Could hit 10 req/sec limit | Use bulk APIs, implement backoff |
| **GitHub OAuth security** | Tokens need secure storage | Follow storefront-tools pattern (localStorage + validation) |

---

## Rate Limits and Restrictions

| Limit Type | Value |
|------------|-------|
| Admin API requests | 10 requests/second per project |
| BYOM concurrent requests | 100 max concurrent |
| BYOM requests per minute | 600 max |
| Response payload | 6MB max (compressed) |
| Index size | 50,000 pages max |
| GitHub sync | 500 files/ref, 100 active refs, 10MB/ref |

**Throttled Response:** HTTP 429 or 503 status code with `x-error` header

---

## Recommended Next Steps

1. **Verify IMS Token Compatibility** - Quick test: can Demo Builder's IMS token call DA.live Admin API?

2. **Decide on Integration Level** - Option A, B, or C based on desired UX

3. **Prototype GitHub OAuth** - Reuse storefront-tools pattern for popup-based OAuth

4. **Design DA.live Org Strategy** - Shared org vs user-provided vs Cloud Manager

5. **Plan Content Templates** - What initial content should EDS projects have?

---

## Key Takeaways

1. **All four capabilities are feasible** with varying levels of automation
2. **DA.live org creation is the main gap** - no public API, requires manual setup or shared org strategy
3. **Demo Builder's existing patterns are highly reusable** - component registry, IMS auth, git clone, env generation
4. **GitHub integration is the primary new development** needed for full automation
5. **storefront-tools provides a reference implementation** for GitHub OAuth and API patterns
6. **One-time user authorization** for AEM Code Sync is unavoidable

---

## Sources

### Demo Builder Codebase
- Component registry system (`templates/components.json`)
- Authentication service (`src/features/authentication/`)
- Project creation flow (`src/features/project-creation/`)
- Component manager (`src/features/components/`)

### Web Research
- [DA Admin API Reference](https://opensource.adobe.com/da-admin/)
- [DA.live Documentation](https://docs.da.live/)
- [AEM Admin API](https://www.aem.live/docs/admin.html)
- [Edge Delivery Services Overview](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/edge-delivery/overview)
- [Cloud Manager API](https://developer.adobe.com/experience-cloud/cloud-manager/)
- [GitHub REST API](https://docs.github.com/en/rest)
- [storefront-tools repository](https://github.com/adobe-commerce/storefront-tools)

### Previous Research
- [Storefront-Tools EDS Integration Research](.rptc/research/storefront-tools-eds-integration/research.md)
