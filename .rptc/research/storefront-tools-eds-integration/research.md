# Comprehensive Research Report: Storefront-Tools & Adobe Edge Delivery Services Ecosystem

**Research Date:** December 16, 2025
**Research Scope:** Hybrid (Codebase + Web)
**Research Depth:** Comprehensive
**Topic:** Understanding storefront-tools repository and its integration with Adobe DA.live, Adobe Helix, and GitHub APIs

---

## Executive Summary

**storefront-tools** is an Adobe Edge Delivery Services (EDS) application that automates the creation of Adobe Commerce storefronts. It orchestrates multiple Adobe services (DA.live, Helix/EDS, Commerce GraphQL) and GitHub APIs through a sophisticated self-service wizard, enabling developers to bootstrap complete commerce storefronts in minutes rather than days.

---

## 1. Architecture Overview

### What storefront-tools Does

| Capability | Description |
|------------|-------------|
| **Site Creation** | Creates GitHub repositories from commerce boilerplate templates |
| **Content Import** | Copies sample storefront content to DA.live |
| **Config Generation** | Auto-detects Commerce environment and generates configuration |
| **OAuth Integration** | Handles GitHub authentication for repository operations |

### Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (LitElement SPA)                  │
│  site-creator.js │ worker-api.js │ create-site.js           │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                 Cloudflare Worker (Backend)                  │
│  /github-auth │ /create │ /get-config │ /validate-config    │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┬─────────────┐
        ▼             ▼             ▼             ▼
   ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐
   │ GitHub  │  │  DA.live │  │ Commerce │  │  Helix  │
   │   API   │  │  Admin   │  │ GraphQL  │  │  Admin  │
   └─────────┘  └──────────┘  └──────────┘  └─────────┘
```

### Project Structure

```
storefront-tools/
├── fstab.yaml              # DA.live content mounting
├── package.json            # v1.3.0, AEM boilerplate
├── scripts/
│   ├── aem.js              # Helix utilities (738 lines)
│   └── scripts.js          # Main entry point
├── blocks/                 # Helix block components
│   ├── header/
│   ├── footer/
│   ├── hero/
│   ├── cards/
│   ├── columns/
│   └── fragment/
├── tools/
│   ├── site-creator/       # Main site creation wizard
│   └── config-generator/   # Commerce config generation
└── worker/                 # Cloudflare Worker backend
```

---

## 2. DA.live Integration

### What is DA.live?

DA.live (Document Authoring) is Adobe's browser-based content authoring platform for Edge Delivery Services. It provides:
- Google Docs-like editing experience
- Real-time collaborative editing
- Direct preview and publish capabilities
- Markdown-based content storage

### How storefront-tools Uses DA.live

**Key Integration Points:**

| API Endpoint | Purpose | File Reference |
|--------------|---------|----------------|
| `https://admin.da.live/list/{org}/{site}` | Check if destination exists | `permissions.js:150-180` |
| `https://admin.da.live/config/{org}/` | Read/write org permissions | `permissions.js:180-250` |
| `https://content.da.live/{org}/{site}/` | Content storage mount point | `fstab.yaml:1-4` |

**DA.live SDK Usage** (`create-site.js:1-30`):
```javascript
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
const { context, token, actions } = await DA_SDK;
```

**Content Flow:**
1. **Crawl**: Fetches content index from source variation (`full-index.json`)
2. **Convert**: Transforms markdown to AEM document format (`mdToDocDom`, `docDomToAemHtml`)
3. **Copy**: Writes content to DA.live destination
4. **Publish**: Publishes to preview → live partitions

**Mount Configuration** (`fstab.yaml`):
```yaml
mountpoints:
  /:
    url: https://content.da.live/{org}/{site}/
    type: markup
```

**Organization Protection** (`permissions.js:150-250`):
- Creates/updates org config with permissions sheet
- Adds user permissions for site paths
- Ensures support org (77C920686809469C0A495FE5) has access

**Content Crawling** (`create-site.js:135-240`):
- Crawls source variation index (e.g., `https://main--boilerplate--adobe-commerce.aem.live/full-index.json`)
- Extracts markdown and metadata
- Converts markdown to AEM document format
- Copies files with retry logic (3 retries on 504)

---

## 3. Adobe Helix / Edge Delivery Services Integration

### What is Helix/EDS?

Adobe Helix (now branded as Edge Delivery Services) is a serverless, composable architecture for ultra-fast content delivery:
- **Document-to-HTML Pipeline**: Transforms documents into optimized web pages
- **Block System**: Modular CSS/JS components that decorate content
- **Edge Caching**: Three-tier CDN architecture for global performance
- **GitHub-based Code Deployment**: Code Sync app monitors repository changes

### Helix Architecture Versions

| Version | Status | Configuration | Domains |
|---------|--------|---------------|---------|
| Helix 4 (Franklin) | Sunset Dec 2025 | fstab.yaml | hlx.page/hlx.live |
| Helix 5 | Current | Configuration Service | aem.page/aem.live |

### How storefront-tools Uses Helix

**Block Architecture** (`scripts/aem.js:570-605`):
```javascript
async function loadBlock(block) {
  const { blockName } = block.dataset;
  const cssLoaded = loadCSS(`/blocks/${blockName}/${blockName}.css`);
  const mod = await import(`/blocks/${blockName}/${blockName}.js`);
  if (mod.default) await mod.default(block);
}
```

**Available Blocks** (`blocks/` directory):
- `header/` - Navigation with menu toggle
- `footer/` - Footer component
- `hero/` - Hero banner with auto-blocking
- `cards/` - Card grid with image optimization
- `columns/` - Multi-column layout
- `fragment/` - Content fragment loader

**RUM (Real User Monitoring)** (`aem.js:14-127`):
- Sends beacon data to `rum.hlx.page`
- Tracks performance checkpoints
- Optional rum-enhancer integration

**Code Bus Verification** (`site-creator.js:600-650`):
```javascript
// Polls to verify repository is synced to Helix
const codeBusUrl = `https://admin.hlx.page/code/${org}/${site}/main/scripts/aem.js`;
// Max 25 attempts, 5s interval (125s total)
```

**E-L-D Loading Pattern** (`scripts/scripts.js`):
- **Eager**: Above-fold content, critical CSS/JS
- **Lazy**: Below-fold blocks, images
- **Delayed**: Analytics, non-critical features

---

## 4. GitHub API Integration

### OAuth Flow

**Implementation** (`worker.js:746-1044`, `worker-api.js:123-191`):

```
User clicks "Create Site"
        ↓
Opens popup to /github-auth (Cloudflare Worker)
        ↓
Redirects to github.com/login/oauth/authorize
  - Scope: 'repo' (full repository access)
  - Client ID from Worker environment
        ↓
User authorizes → GitHub redirects to /github-auth/callback
        ↓
Worker exchanges code for access_token
        ↓
Token returned via postMessage to browser
        ↓
Stored in localStorage as 'github_access_token'
```

### Token Validation (`worker-api.js:46-93`):
- Validates token by calling GitHub API `/user`
- Checks OAuth scopes in response header
- Returns: `{ valid, reason, message }`

### Repository Operations

**Octokit Configuration** (`worker.js:383-392`):
```javascript
const MyOctokit = Octokit.plugin(retry);
new MyOctokit({
  auth: token,
  request: { retries: 3, retryAfter: 1 }
});
```

**Repository Creation Sequence** (`worker.js:395-670`):

| Step | API Call | Purpose |
|------|----------|---------|
| 1 | `GET /user` | Get authenticated user info |
| 2 | `GET /repos/{owner}/{repo}` | Check if repo exists |
| 3 | `POST /repos/{template}/generate` | Create from `hlxsites/aem-boilerplate-commerce` |
| 4 | `PUT /repos/{owner}/{repo}/contents/fstab.yaml` | Set DA.live mount point |
| 5 | `PUT /repos/{owner}/{repo}/contents/config.json` | Commerce configuration |
| 6 | `PUT /repos/{owner}/{repo}/contents/tools/sidekick/config.json` | Sidekick config |

**Retry Configuration**:
- API calls: 3 retries, 1s delay
- File updates: 5 retries, 2s delay
- Content crawl: 2 retries on 504 errors, 3s delay

---

## 5. Adobe Commerce Integration

### Environment Detection

**Detection Logic** (`worker.js:65-158`):

```
1. Try FULL_STORE_CONFIG_QUERY (PaaS)
   - Queries: storeConfig + dataServicesStorefrontInstanceContext
   - If success → PaaS environment detected
        ↓
2. Fallback to BASIC_STORE_CONFIG_QUERY (ACCS)
   - Queries: storeConfig only
   - If success → ACCS environment detected
        ↓
3. Final fallback → ACO (Adobe Commerce Optimizer)
   - Uses placeholder configuration
```

**GraphQL Queries** (`tools/config-generator/schema.js`):
- `FULL_STORE_CONFIG_QUERY`: 24 fields from 2 root queries
- `BASIC_STORE_CONFIG_QUERY`: 8 fields from storeConfig
- Both POST to GraphQL endpoint with `Content-Type: application/json`

**Generated Configuration Structure** (`tools/config-generator/config.js`):
```json
{
  "public": {
    "default": {
      "commerce-core-endpoint": "https://catalog-service.adobe.io/graphql",
      "commerce-endpoint": "https://your-store.com/graphql",
      "headers": {
        "all": { "Store": "default" },
        "cs": {
          "Magento-Store-Code": "default",
          "Magento-Store-View-Code": "default",
          "Magento-Website-Code": "base",
          "x-api-key": "...",
          "Magento-Environment-Id": "..."
        }
      },
      "analytics": {
        "base-currency-code": "USD",
        "environment-id": "...",
        "store-code": "default"
      },
      "plugins": {
        "picker": { "rootCategory": "..." }
      }
    }
  }
}
```

**API Endpoint Validation** (`worker.js:672-733`):
- Validates HTTPS URL format
- Tests with GraphQL introspection query `{ __schema { types { name } } }`
- Checks HTTP status and GraphQL error responses

---

## 6. Complete Data Flow

```
User → Browser (site-creator.js)
  ↓
  ├→ DA.live SDK (get token)
  │   ↓
  │   ├→ Check destination (/admin/list)
  │   └→ Protect organization (/config)
  │
  ├→ GitHub OAuth (worker-api.js)
  │   ↓
  │   Cloudflare Worker (/github-auth)
  │   ↓
  │   GitHub API (authorize)
  │   ↓
  │   GitHub API (access_token)
  │   ↓
  │   Return to browser
  │
  ├→ Create Repository
  │   ↓
  │   Cloudflare Worker (/create)
  │   ↓
  │   GitHub API (generate from template)
  │   ↓
  │   GitHub API (update files)
  │
  ├→ Validate Config (if API endpoint provided)
  │   ↓
  │   Cloudflare Worker (/get-config)
  │   ↓
  │   Adobe Commerce GraphQL (detect environment)
  │   ↓
  │   Generate config.json
  │
  └→ Create Content
      ↓
      DA.live crawl/copy/publish
      ↓
      Content → DA.live repository
```

---

## 7. External Services Summary

| Service | Endpoint | Purpose | Auth |
|---------|----------|---------|------|
| **GitHub** | `api.github.com` | User info, repo ops | OAuth token |
| **GitHub** | `github.com/login/oauth/*` | OAuth flow | Client ID/Secret |
| **Adobe Commerce** | `{endpoint}/graphql` | Store config | Variable |
| **Adobe Commerce** | `catalog-service.adobe.io/graphql` | PaaS catalog service | x-api-key header |
| **Adobe IMS** | `ims-na1.adobelogin.com/ims/profile/v1` | User profile (email check) | Bearer token |
| **DA.live** | `admin.da.live/` | Content management | Bearer token |
| **AEM Helix** | `admin.hlx.page/` | Code Bus, publishing | DA.live token |
| **Sentry** | `o4509713025859584.ingest.us.sentry.io` | Error reporting | DSN |

---

## 8. Content Variations

| Variation | Name | Import Base | Repo Base |
|-----------|------|-------------|-----------|
| `base` | Default Variation | `main--boilerplate--adobe-commerce.aem.live` | Default |
| `citisignal` | Citisignal Variation | `main--accs-citisignal--demo-system-stores.aem.live` | `demo-system-stores/accs-citisignal` |

**Adobe Employee-Only Variations**:
- Access controlled via `_isAdobeEmployee` check
- Determined by email domain check against Adobe login

---

## 9. Comparison: Implementation vs Industry Best Practices

| Aspect | storefront-tools Implementation | Industry Best Practice | Assessment |
|--------|--------------------------------|------------------------|------------|
| **OAuth Flow** | Popup-based with localStorage token storage | Popup or redirect, secure token storage | ✅ Matches |
| **Error Handling** | Sentry integration, user-friendly messages | Centralized error tracking | ✅ Matches |
| **Retry Logic** | Exponential backoff, configurable retries | Retry with backoff for transient failures | ✅ Matches |
| **Block Architecture** | Standard Helix block pattern | EDS block best practices | ✅ Matches |
| **Content Pipeline** | Crawl → Convert → Copy → Publish | Two-stage preview/publish | ✅ Matches |
| **Configuration** | JSON-based config generation | Environment-specific configs | ✅ Matches |
| **Security** | Token validation, org protection | IDP auth, permission checks | ✅ Matches |

---

## 10. Key File Reference Guide

### Critical Files by Function

| Function | Files | Key Lines |
|----------|-------|-----------|
| **Main UI Component** | `tools/site-creator/site-creator.js` | 45-851 |
| **GitHub OAuth** | `worker/worker.js` | 746-1044 |
| **Repository Creation** | `worker/worker.js` | 395-670 |
| **DA.live Operations** | `tools/site-creator/create-site.js` | 80-350 |
| **Permission Checks** | `tools/site-creator/permissions.js` | 150-250 |
| **Config Generation** | `tools/config-generator/config.js` | 1-150 |
| **GraphQL Queries** | `tools/config-generator/schema.js` | Full file |
| **Block Loading** | `scripts/aem.js` | 570-605 |
| **Content Variations** | `tools/site-creator/constants.js` | 14-40 |

---

## 11. Key Constants & Magic Numbers

| Constant | Value | Purpose |
|----------|-------|---------|
| Template Repo | `hlxsites/aem-boilerplate-commerce` | Base repository for new sites |
| Support Org ID | `77C920686809469C0A495FE5` | Adobe internal org for access |
| Code Bus Poll | 25 attempts × 5s = 125s max | Verify Helix sync |
| OAuth Timeout | 5 minutes (300000ms) | Popup authentication timeout |
| Content Crawl Retry | 2 retries, 3s delay | Handle 504 errors |
| GitHub API Retry | 3 retries, 1s delay | Handle transient failures |
| File Update Retry | 5 retries, 2s delay | Ensure file writes succeed |

---

## 12. Integration Opportunities for Demo Builder

### Option A: Reference Architecture
Use storefront-tools as a reference for understanding how to:
- Integrate with DA.live APIs
- Generate Commerce configurations
- Handle GitHub OAuth flows
- Implement retry/error handling patterns

### Option B: Component Addition
Add storefront-tools as an optional component in Demo Builder:
- Clone/fork the repository
- Configure for specific demo scenarios
- Integrate with existing project creation workflow

### Option C: API Integration
Leverage storefront-tools' Cloudflare Worker endpoints:
- `/get-config` - Auto-detect Commerce environment
- `/validate-config` - Validate storefront configuration
- Could potentially call these APIs from Demo Builder

---

## 13. Recommended Tools & Libraries

| Tool | Purpose | Source |
|------|---------|--------|
| **AEM CLI** (`@adobe/aem-cli`) | Local development server | npm |
| **AEM Sidekick** | Content author toolbar | Chrome Web Store |
| **AEM Block Collection** | Reusable block library | GitHub |
| **Drop-in Components** (`@dropins/*`) | Pre-built commerce UI | npm |
| **Catalog Service API** | Fast product data access | Adobe Developer |

---

## 14. Common Pitfalls to Avoid

1. **Using fstab.yaml with Helix 5**: New projects use Configuration Service, not file-based config
2. **Forgetting postinstall**: Always run `npm run postinstall` after drop-in updates
3. **Adding build processes**: EDS intentionally avoids webpack/bundlers for simplicity
4. **Incorrect block tables**: First row must contain block name
5. **Missing Code Sync app**: Must be installed on each repository, including private ones
6. **Ignoring service dependencies**: Drop-in components require Catalog Service v2.2.0+

---

## Key Takeaways

1. **storefront-tools is a sophisticated integration layer** that orchestrates DA.live, GitHub, Commerce GraphQL, and Helix services through a unified self-service interface.

2. **The OAuth flow is well-implemented** using popup-based authentication with proper token validation and retry logic.

3. **DA.live serves as the content CMS** with the SDK providing authentication tokens and content management APIs.

4. **Helix/EDS provides the delivery layer** through the block system, CDN caching, and GitHub Code Sync.

5. **Commerce integration is environment-aware** with automatic detection of PaaS, ACCS, or ACO environments.

6. **The architecture is highly modular** with clear separation between browser UI (LitElement), backend (Cloudflare Worker), and external services.

---

## Sources

### Codebase Analysis
- `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/storefront-tools/` (full codebase exploration)

### Web Research
- Adobe Experience League - Edge Delivery Services documentation
- Adobe Commerce Storefront documentation
- GitHub - adobe/helix-home architecture docs
- GitHub - hlxsites/aem-boilerplate-commerce
- aem.live - Admin API and security documentation
