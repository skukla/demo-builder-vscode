# EDS Content & Code Separation Architecture

## Overview

Edge Delivery Services (EDS) uses a **two-repository architecture** that separates code and content into distinct systems, connected via configuration.

## The Architecture

### GitHub Repository = CODE 🔧

The GitHub repository contains **only code** - no content:

```
demo-system-stores/accs-citisignal (GitHub)
├── blocks/              # JavaScript/CSS for UI components
│   ├── header/
│   ├── footer/
│   ├── product-list/
│   └── ...
├── scripts/             # Site JavaScript (aem.js, etc.)
├── styles/              # Global CSS stylesheets
├── fstab.yaml           # Configuration pointing to content source
├── site.json            # Runtime configuration (endpoints, etc.)
└── ...
```

**What lives here**:
- UI components (blocks)
- JavaScript code
- CSS styles
- Build configuration
- **Configuration that points to content** (`fstab.yaml`)

**What does NOT live here**:
- Page content (markdown)
- Images, videos, media
- Product data
- Blog posts

### DA.live = CONTENT 📝

DA.live is a **separate content management system**:

```
{org}/{site} (DA.live - completely separate from GitHub)
├── /                    # Homepage content (Markdown)
├── /products/          # Product pages (Markdown)
│   ├── /product-1
│   ├── /product-2
│   └── ...
├── /blog/              # Blog posts (Markdown)
├── /pages/             # Static pages (Markdown)
└── /media/             # Images, videos, assets
```

**What lives here**:
- All page content (Markdown format)
- Media files (images, videos)
- Document metadata
- Content structure

**What does NOT live here**:
- Code (JavaScript, CSS)
- UI components
- Build tools

## How They Connect: `fstab.yaml`

The **critical linking file** is `fstab.yaml`, which lives in the **GitHub code repository** but **points to** the DA.live content location:

```yaml
# fstab.yaml (in GitHub repo)
mountpoints:
  /: https://content.da.live/{org}/{site}/
```

### Runtime Behavior

When a user visits the live site:

```
User Request
    ↓
Helix CDN
    ↓
1. Fetch CODE from GitHub
   - Read fstab.yaml
   - Load blocks/*.js, scripts/*.js, styles/*.css
    ↓
2. Read fstab.yaml to find content location
    ↓
3. Fetch CONTENT from DA.live
   - Fetch /products/product-1 → Markdown
   - Fetch /media/hero.jpg → Image
    ↓
4. Render: CODE (GitHub) + CONTENT (DA.live) = Live Site
```

**Key insight**: You can **change content sources** by just updating `fstab.yaml` - no code changes needed!

## Current Demo Builder Implementation

### Two Separate Operations

When creating an EDS project, Demo Builder performs **two independent operations**:

#### 1. Clone CODE Repository

```typescript
// src/features/eds/services/githubRepoOperations.ts
await createFromTemplate({
  templateOwner: 'demo-system-stores',
  templateRepo: 'accs-citisignal',  // GitHub template
  owner: userGithubOrg,
  name: 'my-new-storefront'
});
```

**Result**: User gets their own GitHub repo with all the code (blocks, scripts, styles).

#### 2. Copy CONTENT to DA.live

```typescript
// src/features/eds/services/daLiveContentOperations.ts
const CITISIGNAL_SOURCE = {
  org: 'demo-system-stores',
  site: 'accs-citisignal'  // DA.live site (NOT GitHub)
};

await copyCitisignalContent(
  destOrg: userDaLiveOrg,
  destSite: 'my-new-site'
);
```

**Result**: User gets their own DA.live site with all the content.

#### 3. Generate fstab.yaml

```typescript
// Connect user's code to user's content
const fstabContent = `mountpoints:
  /: https://content.da.live/${userDaLiveOrg}/${userDaLiveSite}/
`;
```

**Result**: User's code repo points to user's content location.

### Key Files

| File | Purpose | Location |
|------|---------|----------|
| `edsSetupPhases.ts` | Orchestrates code & content setup | `src/features/eds/services/` |
| `githubRepoOperations.ts` | Clones code repository | `src/features/eds/services/` |
| `daLiveContentOperations.ts` | Copies content | `src/features/eds/services/` |
| `daLiveConstants.ts` | **Hardcoded source** 👈 | `src/features/eds/services/` |

### Current Limitation: Hardcoded Content Source

```typescript
// src/features/eds/services/daLiveConstants.ts
export const CITISIGNAL_SOURCE = {
    org: 'demo-system-stores',
    site: 'accs-citisignal',  // ← ALWAYS uses this content
    indexUrl: 'https://main--accs-citisignal--demo-system-stores.aem.live/full-index.json',
};
```

**Users cannot currently**:
- Choose different content templates
- Start with blank content
- Bring their own content
- Point to existing DA.live sites

## Future: Content as a Component

### Vision

Treat content sources as **first-class components** in Demo Builder, just like frontends and backends.

### Proposed Component Definition

```json
// components.json
{
  "contentSources": [
    {
      "id": "citisignal-retail",
      "name": "CitiSignal Retail Demo",
      "description": "Full retail storefront with products, categories, and blog",
      "type": "dalive",
      "source": {
        "org": "demo-system-stores",
        "site": "accs-citisignal"
      },
      "metadata": {
        "pageCount": 150,
        "mediaCount": 200,
        "industries": ["retail", "fashion"]
      }
    },
    {
      "id": "citisignal-b2b",
      "name": "CitiSignal B2B Demo",
      "description": "B2B commerce experience with catalogs and quotes",
      "type": "dalive",
      "source": {
        "org": "demo-system-stores",
        "site": "b2b-citisignal"
      }
    },
    {
      "id": "blank",
      "name": "Blank Site",
      "description": "Start with no content (code only)",
      "type": "none"
    },
    {
      "id": "custom-dalive",
      "name": "Custom DA.live Site",
      "description": "Use your own existing DA.live content",
      "type": "dalive",
      "source": "user-provided"
    },
    {
      "id": "local-markdown",
      "name": "Local Markdown Files",
      "description": "Upload local markdown files to DA.live",
      "type": "local",
      "source": "user-provided"
    }
  ]
}
```

### Proposed Wizard Flow

```
┌────────────────────────────────────────────────────┐
│ Select Content Source                              │
│                                                    │
│ Choose the content for your storefront:           │
│                                                    │
│ ○ CitiSignal Retail Demo                          │
│   Full retail storefront with 150 pages           │
│                                                    │
│ ○ CitiSignal B2B Demo                             │
│   B2B commerce with catalogs and quotes           │
│                                                    │
│ ○ Blank Site                                       │
│   Start with no content (code only)               │
│                                                    │
│ ● Custom DA.live Site                              │
│   ┌─────────────────────────────────────────────┐ │
│   │ Organization: my-org                        │ │
│   │ Site: my-existing-site                      │ │
│   └─────────────────────────────────────────────┘ │
│                                                    │
│ ○ Upload Local Files                              │
│   Choose folder...                                │
│                                                    │
│                           [Back]  [Continue]       │
└────────────────────────────────────────────────────┘
```

### Implementation Changes Needed

#### 1. Add Content Source to Wizard State

```typescript
// src/features/project-creation/types/wizardTypes.ts
export interface WizardState {
  // ... existing fields
  contentSource?: {
    id: string;
    type: 'dalive' | 'local' | 'none';
    org?: string;      // For DA.live sources
    site?: string;     // For DA.live sources
    localPath?: string; // For local sources
  };
}
```

#### 2. Add Content Selection Step

```typescript
// src/features/project-creation/ui/wizard/steps/ContentSourceStep.tsx
export const ContentSourceStep: React.FC = () => {
  // UI for selecting content source
  // - Radio buttons for predefined sources
  // - Input fields for custom DA.live org/site
  // - File picker for local markdown
};
```

#### 3. Refactor Content Operations

```typescript
// src/features/eds/services/daLiveContentOperations.ts

// Before (hardcoded)
async copyCitisignalContent(
  destOrg: string,
  destSite: string
): Promise<DaLiveCopyResult>

// After (flexible)
async copyContent(
  source: ContentSource,  // From wizard selection
  destOrg: string,
  destSite: string
): Promise<DaLiveCopyResult>

interface ContentSource {
  type: 'dalive' | 'local' | 'none';
  org?: string;
  site?: string;
  localPath?: string;
}
```

#### 4. Update Configuration Generation

```typescript
// src/features/eds/services/edsSetupPhases.ts

// Generate fstab.yaml based on selected content source
async generateFstabYaml(config: EdsProjectConfig): Promise<void> {
  let fstabContent: string;
  
  if (config.contentSource.type === 'dalive') {
    fstabContent = `mountpoints:
  /: https://content.da.live/${config.contentSource.org}/${config.contentSource.site}/
`;
  } else if (config.contentSource.type === 'none') {
    // No mountpoint - blank site
    fstabContent = `mountpoints: {}
`;
  }
  
  await fs.writeFile(fstabPath, fstabContent, 'utf-8');
}
```

### Benefits of Content Componentization

| Benefit | Description |
|---------|-------------|
| **Flexibility** | Users choose content that fits their demo needs |
| **Reusability** | Same code base, multiple content variations |
| **Bring Your Own** | Users can use existing content |
| **Testing** | Test code changes without modifying content |
| **Scalability** | Easy to add new content templates |
| **Independence** | Content and code versioned separately |

### Use Cases

#### 1. Multiple Industry Demos
```
Same EDS code + Different content = Different industries
- Retail storefront content
- B2B commerce content
- Digital goods content
```

#### 2. Localization
```
Same EDS code + Localized content = Multi-language demos
- English content (US)
- French content (Canada)
- Spanish content (Mexico)
```

#### 3. Progressive Demos
```
Same EDS code + Increasing content = Demo progression
- Starter: 10 pages
- Standard: 50 pages
- Full: 150 pages
```

#### 4. Custom Demos
```
Same EDS code + Customer's content = Personalized demo
- Use customer's actual products
- Use customer's branding
- Use customer's content structure
```

## Alternative Content Sources

While DA.live is the primary content storage for EDS, other sources are architecturally possible:

### 1. Local Markdown Files
```
User provides folder:
/my-content/
  ├── index.md
  ├── products/
  │   ├── product-1.md
  │   └── product-2.md
  └── media/

Demo Builder:
  → Uploads to user's DA.live site
  → Generates fstab.yaml pointing to DA.live
```

### 2. GitHub Repository
```
User provides GitHub repo with markdown:
github.com/user/my-content/
  ├── index.md
  ├── products/
  └── media/

Demo Builder:
  → Converts/syncs to DA.live
  → Generates fstab.yaml pointing to DA.live
```

### 3. SharePoint/Google Docs
```
User provides SharePoint site or Google Drive folder

Demo Builder:
  → Uses DA.live's built-in connectors
  → Generates fstab.yaml pointing to DA.live
```

**Note**: All paths lead to DA.live because that's what Helix expects in `fstab.yaml`. DA.live acts as the content normalization layer.

## DA.live Spreadsheet Limitation (Discovered January 2025)

### The Problem

EDS uses spreadsheets for configuration data (placeholders, redirects, metadata, etc.). These spreadsheets:
- Are stored as `.xlsx` files in DA.live
- Are served as `.json` endpoints by Helix CDN
- Example: `/placeholders/global.xlsx` → `https://site.aem.live/placeholders/global.json`

**The limitation**: DA.live's `/source/` API does NOT support programmatic spreadsheet creation.

### What We Tried (All Failed)

| Approach | Result |
|----------|--------|
| Upload HTML table as `.html` | DA.live creates HTML document, not spreadsheet |
| Upload HTML table without extension | 404 - not recognized |
| Upload JSON directly | 404 - not served as endpoint |
| Upload `.xlsx` binary | Stored as raw file, not recognized as spreadsheet |
| Upload `.xlsx` with `helix-` prefixed sheets | Same result - still raw file storage |

### Root Cause Analysis

DA.live's source API (`POST /source/{org}/{site}/{path}`) has no spreadsheet-specific handling. Verified by:

1. **API Documentation** (docs.da.live): Only describes generic blob upload via `multipart/form-data`
2. **Source Code** (`adobe/da-admin` GitHub repo): `put.js` treats all data generically, no content-type inspection for xlsx/csv

**How spreadsheets actually work in DA.live:**
- Spreadsheets require **document authoring** (connected Google Sheets or SharePoint via `fstab.yaml`)
- When authors edit a Google Sheet, DA.live syncs it and serves as JSON
- The `/source/` API is for **storing files**, not creating spreadsheets

### The Solution: GitHub Code Files

Since DA.live can't programmatically create spreadsheets, we commit JSON files directly to GitHub:

```
┌─────────────────────────────────────────────────────────────────┐
│                     EDS Reset Flow                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Source CDN                    GitHub Repo                       │
│  (demo-system-stores)          (user's repo)                     │
│                                                                  │
│  placeholders/global.json  →   placeholders/global.json          │
│  placeholders/auth.json    →   placeholders/auth.json            │
│  placeholders/cart.json    →   placeholders/cart.json            │
│                                                                  │
│  Committed as CODE files, not uploaded to DA.live                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation** (`dashboardHandlers.ts`):
```typescript
const placeholderPaths = [
    'placeholders/global',
    'placeholders/auth',
    'placeholders/cart',
    'placeholders/recommendations',
    'placeholders/wishlist',
];

for (const placeholderPath of placeholderPaths) {
    const sourceUrl = `https://main--${templateRepo}--${templateOwner}.aem.live/${placeholderPath}.json`;
    const response = await fetch(sourceUrl);
    const jsonContent = await response.text();
    fileOverrides.set(`${placeholderPath}.json`, jsonContent);
}
```

### Why This Works: Helix Content > Code Precedence

Helix has a **Content overrides Code** rule:
- If both DA.live content AND GitHub code exist at the same path, **content wins**
- This means authors can later create DA.live spreadsheets to override the GitHub defaults

**The authoring experience**:
1. **Day 1**: Site works immediately (JSON served from GitHub)
2. **Day N**: Author creates spreadsheet in DA.live → automatically overrides GitHub version
3. **No migration needed**: Just create the DA.live spreadsheet when ready

### File Types Summary

| Path Pattern | Stored In | Served As | Notes |
|--------------|-----------|-----------|-------|
| `/*.html` | DA.live | HTML page | Content pages |
| `/placeholders/*.json` | GitHub | JSON | Code files (workaround for DA.live limitation) |
| `/config.json` | GitHub | JSON | Commerce config (nested object, not spreadsheet) |
| `/demo-config.json` | GitHub | JSON | Brand/theming config |
| `/media/*` | DA.live | Binary | Images, videos |

### Related Files

- `src/features/projects-dashboard/handlers/dashboardHandlers.ts` - GitHub code file approach (placeholder JSON fetch)
- `src/features/eds/services/daLiveContentOperations.ts` - HTML content copy (spreadsheet copy code removed)

## Comparison with Other Architectures

### Headless (PWA Studio, Venia)
```
Code:    GitHub repo (React components)
Content: Commerce backend (products, categories)
Link:    GraphQL queries in code
```

### EDS (Edge Delivery Services)
```
Code:    GitHub repo (blocks, scripts, styles)
Content: DA.live (markdown pages, media)
Link:    fstab.yaml configuration file
```

**Key difference**: In EDS, content and code are **more loosely coupled**. You can completely swap content sources without touching code, just by changing `fstab.yaml`.

## Technical Deep Dive

### How Content Fetching Works at Runtime

```
1. User visits: https://main--my-storefront--user.aem.live/products/product-1

2. Helix CDN receives request

3. CDN reads fstab.yaml from GitHub:
   mountpoints:
     /: https://content.da.live/user/my-site/

4. CDN resolves content path:
   /products/product-1 → https://content.da.live/user/my-site/products/product-1

5. CDN fetches content from DA.live (markdown)

6. CDN applies code from GitHub:
   - Runs blocks/product-list/product-list.js
   - Applies styles/product-list.css
   - Executes scripts/aem.js

7. CDN returns rendered HTML
```

### Content Copy Implementation

```typescript
// Current implementation in daLiveContentOperations.ts

async copyCitisignalContent(
  destOrg: string,
  destSite: string
): Promise<DaLiveCopyResult> {
  
  // 1. Fetch content index from source
  const indexResponse = await fetch(CITISIGNAL_SOURCE.indexUrl);
  const index = await indexResponse.json();
  
  // 2. Iterate all content files
  for (const entry of index.data) {
    const sourcePath = entry.path;
    
    // 3. Fetch source content
    const sourceContent = await this.getSource(
      CITISIGNAL_SOURCE.org,
      CITISIGNAL_SOURCE.site,
      sourcePath
    );
    
    // 4. Create in destination
    await this.createSource(
      destOrg,
      destSite,
      sourcePath,
      sourceContent
    );
  }
}
```

**To support flexible sources**, this would become:

```typescript
async copyContent(
  source: ContentSource,
  destOrg: string,
  destSite: string
): Promise<DaLiveCopyResult> {
  
  let contentFiles: ContentFile[];
  
  // Fetch content based on source type
  if (source.type === 'dalive') {
    contentFiles = await this.fetchDaLiveContent(source.org, source.site);
  } else if (source.type === 'local') {
    contentFiles = await this.readLocalContent(source.localPath);
  }
  
  // Copy to destination (same for all sources)
  for (const file of contentFiles) {
    await this.createSource(destOrg, destSite, file.path, file.content);
  }
}
```

## Migration Path

To implement content componentization:

### Phase 1: Extract Content Selection Logic
1. Create `ContentSource` type
2. Move hardcoded values to configuration
3. No UI changes yet

### Phase 2: Add Basic Content Selection
1. Add predefined content sources to `components.json`
2. Add content selection wizard step
3. Support 2-3 predefined sources

### Phase 3: Custom DA.live Sources
1. Add "Custom DA.live" option
2. Add org/site input fields
3. Validate DA.live site exists

### Phase 4: Alternative Sources
1. Add local file upload
2. Add GitHub repository sync
3. Add SharePoint/Google Docs connectors

## Summary

**Current Reality**:
- ✅ Code and content are **architecturally separate**
- ✅ They connect via `fstab.yaml` configuration
- ❌ Content source is **hardcoded** in Demo Builder
- ❌ Users cannot choose alternative content

**Future Possibility**:
- ✅ Treat content as a **component** (like frontend/backend)
- ✅ Users select content source in wizard
- ✅ Support multiple content templates
- ✅ Support "bring your own content"
- ✅ Content truly independent from code

**Key Insight**: The architecture already supports this - we just need to expose it as a user-facing feature! 🎯
