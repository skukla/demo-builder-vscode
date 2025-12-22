# Step 4: Component Registry Updates

## Overview

Add the EDS CitiSignal Storefront, enhanced ACCS backend, and supporting tools to the existing component registry (`templates/components.json`). This step establishes the foundation for the entire EDS deployment feature by making the new frontend/backend/tools options available to the wizard and services.

**Key Changes:**
- Add `eds-citisignal-storefront` frontend component pointing to citisignal-one boilerplate
- Enhance `adobe-commerce-accs` backend component with required configuration
- Add `tools` selection group with `commerce-demo-ingestion` tool component
- Update `selectionGroups` to include new frontend and tools
- Add new demo template for EDS + ACCS combination

**Why Tools in Registry (not hardcoded):**
- **Discoverable** - developers can see all tools in components.json
- **Configurable** - change tool sources via config, not code
- **Consistent** - follows existing frontend/backend pattern
- **Updatable** - leverages existing component update system

## Prerequisites

- [ ] Previous steps completed: None (first step)
- [ ] Required knowledge: Component registry structure (`templates/components.json`)
- [ ] Access required: `templates/components.json`, `templates/demo-templates.json`

## Tests to Write First (TDD)

### Unit Tests

**Test File:** `tests/unit/templates/componentsRegistry.test.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('components.json Registry', () => {
    let componentsConfig: Record<string, unknown>;

    beforeAll(() => {
        const componentsPath = path.join(__dirname, '../../../templates/components.json');
        const content = fs.readFileSync(componentsPath, 'utf-8');
        componentsConfig = JSON.parse(content);
    });

    describe('eds-citisignal-storefront component', () => {
        it('should exist in components registry', () => {
            expect(componentsConfig.components).toHaveProperty('eds-citisignal-storefront');
        });

        it('should have required fields', () => {
            const component = (componentsConfig.components as Record<string, unknown>)['eds-citisignal-storefront'] as Record<string, unknown>;
            expect(component.name).toBeDefined();
            expect(component.description).toBeDefined();
            expect(component.source).toBeDefined();
        });

        it('should have correct source configuration', () => {
            const component = (componentsConfig.components as Record<string, unknown>)['eds-citisignal-storefront'] as Record<string, unknown>;
            const source = component.source as Record<string, unknown>;
            expect(source.type).toBe('git');
            expect(source.url).toContain('citisignal-one');
        });

        it('should specify compatible backends', () => {
            const component = (componentsConfig.components as Record<string, unknown>)['eds-citisignal-storefront'] as Record<string, unknown>;
            expect(component.compatibleBackends).toContain('adobe-commerce-accs');
        });

        it('should NOT require commerce-mesh dependency', () => {
            const component = (componentsConfig.components as Record<string, unknown>)['eds-citisignal-storefront'] as Record<string, unknown>;
            const dependencies = component.dependencies as Record<string, string[]> | undefined;
            // EDS uses Commerce Drop-in components, not API Mesh
            expect(dependencies?.required || []).not.toContain('commerce-mesh');
        });
    });

    describe('adobe-commerce-accs component', () => {
        it('should exist in components registry', () => {
            expect(componentsConfig.components).toHaveProperty('adobe-commerce-accs');
        });

        it('should have enhanced configuration for EDS', () => {
            const component = (componentsConfig.components as Record<string, unknown>)['adobe-commerce-accs'] as Record<string, unknown>;
            const config = component.configuration as Record<string, unknown>;
            expect(config.requiredEnvVars).toBeDefined();
        });
    });

    describe('selectionGroups', () => {
        it('should include eds-citisignal-storefront in frontends group', () => {
            const selectionGroups = componentsConfig.selectionGroups as Record<string, string[]>;
            expect(selectionGroups.frontends).toContain('eds-citisignal-storefront');
        });

        it('should maintain existing frontends', () => {
            const selectionGroups = componentsConfig.selectionGroups as Record<string, string[]>;
            expect(selectionGroups.frontends).toContain('citisignal-nextjs');
        });

        it('should include adobe-commerce-accs in backends group', () => {
            const selectionGroups = componentsConfig.selectionGroups as Record<string, string[]>;
            expect(selectionGroups.backends).toContain('adobe-commerce-accs');
        });

        it('should have tools group with commerce-demo-ingestion', () => {
            const selectionGroups = componentsConfig.selectionGroups as Record<string, string[]>;
            expect(selectionGroups.tools).toContain('commerce-demo-ingestion');
        });
    });

    describe('commerce-demo-ingestion tool component', () => {
        it('should exist in components registry', () => {
            expect(componentsConfig.components).toHaveProperty('commerce-demo-ingestion');
        });

        it('should have required fields', () => {
            const tool = (componentsConfig.components as Record<string, unknown>)['commerce-demo-ingestion'] as Record<string, unknown>;
            expect(tool.name).toBeDefined();
            expect(tool.description).toBeDefined();
            expect(tool.source).toBeDefined();
            expect(tool.category).toBe('tools');
        });

        it('should have correct source configuration', () => {
            const tool = (componentsConfig.components as Record<string, unknown>)['commerce-demo-ingestion'] as Record<string, unknown>;
            const source = tool.source as Record<string, unknown>;
            expect(source.type).toBe('git');
            expect(source.url).toContain('PMET-public/commerce-demo-ingestion');
        });

        it('should have dataRepository for demo data', () => {
            const tool = (componentsConfig.components as Record<string, unknown>)['commerce-demo-ingestion'] as Record<string, unknown>;
            const dataRepo = tool.dataRepository as Record<string, unknown>;
            expect(dataRepo.url).toContain('PMET-public/vertical-data-citisignal');
            expect(dataRepo.branch).toBe('accs');
        });

        it('should have execution scripts defined', () => {
            const tool = (componentsConfig.components as Record<string, unknown>)['commerce-demo-ingestion'] as Record<string, unknown>;
            const config = tool.configuration as Record<string, unknown>;
            const scripts = config.scripts as Record<string, string>;
            expect(scripts.import).toBe('npm run import:aco');
            expect(scripts.cleanup).toBe('npm run delete:aco');
        });

        it('should specify install path in user data directory', () => {
            const tool = (componentsConfig.components as Record<string, unknown>)['commerce-demo-ingestion'] as Record<string, unknown>;
            expect(tool.installPath).toContain('.demo-builder/tools');
        });

        it('should be hidden from UI (tools are not user-selectable)', () => {
            const tool = (componentsConfig.components as Record<string, unknown>)['commerce-demo-ingestion'] as Record<string, unknown>;
            expect(tool.hidden).toBe(true);
        });
    });
});
```

**Test File:** `tests/unit/templates/demoTemplates.test.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('demo-templates.json', () => {
    let templatesConfig: Record<string, unknown>;
    let componentsConfig: Record<string, unknown>;

    beforeAll(() => {
        const templatesPath = path.join(__dirname, '../../../templates/demo-templates.json');
        const componentsPath = path.join(__dirname, '../../../templates/components.json');
        templatesConfig = JSON.parse(fs.readFileSync(templatesPath, 'utf-8'));
        componentsConfig = JSON.parse(fs.readFileSync(componentsPath, 'utf-8'));
    });

    describe('citisignal-eds template', () => {
        it('should exist in templates array', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const edsTemplate = templates.find(t => t.id === 'citisignal-eds');
            expect(edsTemplate).toBeDefined();
        });

        it('should have required fields', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const edsTemplate = templates.find(t => t.id === 'citisignal-eds');
            expect(edsTemplate?.name).toBeDefined();
            expect(edsTemplate?.description).toBeDefined();
            expect(edsTemplate?.defaults).toBeDefined();
        });

        it('should reference eds-citisignal-storefront as frontend', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const edsTemplate = templates.find(t => t.id === 'citisignal-eds');
            const defaults = edsTemplate?.defaults as Record<string, unknown>;
            expect(defaults.frontend).toBe('eds-citisignal-storefront');
        });

        it('should reference adobe-commerce-accs as backend', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const edsTemplate = templates.find(t => t.id === 'citisignal-eds');
            const defaults = edsTemplate?.defaults as Record<string, unknown>;
            expect(defaults.backend).toBe('adobe-commerce-accs');
        });

        it('should NOT include commerce-mesh in dependencies', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const edsTemplate = templates.find(t => t.id === 'citisignal-eds');
            const defaults = edsTemplate?.defaults as Record<string, unknown>;
            const dependencies = defaults.dependencies as string[] || [];
            expect(dependencies).not.toContain('commerce-mesh');
        });

        it('should reference valid component IDs from components.json', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const edsTemplate = templates.find(t => t.id === 'citisignal-eds');
            const defaults = edsTemplate?.defaults as Record<string, unknown>;
            const components = componentsConfig.components as Record<string, unknown>;

            // Frontend must exist
            expect(components).toHaveProperty(defaults.frontend as string);
            // Backend must exist
            expect(components).toHaveProperty(defaults.backend as string);
        });
    });
});
```

### Test Scenarios Checklist

- [ ] Test: eds-citisignal-storefront component exists in components registry
  - **Given:** components.json is loaded
  - **When:** Accessing components.eds-citisignal-storefront
  - **Then:** Component definition exists with required fields
  - **File:** `tests/unit/templates/componentsRegistry.test.ts`

- [ ] Test: eds-citisignal-storefront has correct source configuration
  - **Given:** eds-citisignal-storefront component exists
  - **When:** Checking source.url
  - **Then:** URL points to citisignal-one repository
  - **File:** `tests/unit/templates/componentsRegistry.test.ts`

- [ ] Test: eds-citisignal-storefront specifies ACCS as compatible backend
  - **Given:** eds-citisignal-storefront component exists
  - **When:** Checking compatibleBackends array
  - **Then:** adobe-commerce-accs is included
  - **File:** `tests/unit/templates/componentsRegistry.test.ts`

- [ ] Test: eds-citisignal-storefront does NOT require commerce-mesh
  - **Given:** eds-citisignal-storefront component exists
  - **When:** Checking dependencies.required
  - **Then:** commerce-mesh is NOT in the list
  - **File:** `tests/unit/templates/componentsRegistry.test.ts`

- [ ] Test: adobe-commerce-accs has enhanced configuration
  - **Given:** adobe-commerce-accs component exists
  - **When:** Checking configuration.requiredEnvVars
  - **Then:** Required environment variables are defined
  - **File:** `tests/unit/templates/componentsRegistry.test.ts`

- [ ] Test: selectionGroups includes eds-citisignal-storefront in frontends
  - **Given:** components.json is loaded
  - **When:** Checking selectionGroups.frontends
  - **Then:** eds-citisignal-storefront is in the array
  - **File:** `tests/unit/templates/componentsRegistry.test.ts`

- [ ] Test: citisignal-eds demo template exists
  - **Given:** demo-templates.json is loaded
  - **When:** Finding template by id 'citisignal-eds'
  - **Then:** Template exists with required fields
  - **File:** `tests/unit/templates/demoTemplates.test.ts`

- [ ] Test: citisignal-eds template references valid component IDs
  - **Given:** Both config files loaded
  - **When:** Checking template defaults against components
  - **Then:** All referenced components exist in registry
  - **File:** `tests/unit/templates/demoTemplates.test.ts`

- [ ] Test: tools group exists in selectionGroups
  - **Given:** components.json is loaded
  - **When:** Checking selectionGroups.tools
  - **Then:** tools array exists with commerce-demo-ingestion
  - **File:** `tests/unit/templates/componentsRegistry.test.ts`

- [ ] Test: commerce-demo-ingestion has required tool fields
  - **Given:** commerce-demo-ingestion component exists
  - **When:** Checking required fields
  - **Then:** Has name, description, source, category=tools, dataRepository, scripts
  - **File:** `tests/unit/templates/componentsRegistry.test.ts`

- [ ] Test: commerce-demo-ingestion is hidden from UI
  - **Given:** commerce-demo-ingestion component exists
  - **When:** Checking hidden flag
  - **Then:** hidden=true (tools not user-selectable in wizard)
  - **File:** `tests/unit/templates/componentsRegistry.test.ts`

## Files to Create/Modify

### Modified Files

1. **`templates/components.json`**
   - Add `eds-citisignal-storefront` component definition
   - Add `commerce-demo-ingestion` tool component definition
   - Update `selectionGroups.frontends` to include new frontend
   - Add `selectionGroups.tools` with commerce-demo-ingestion
   - Enhance `adobe-commerce-accs` component with EDS-specific configuration

2. **`templates/demo-templates.json`**
   - Add `citisignal-eds` demo template for quick selection

### New Files

- **`tests/unit/templates/componentsRegistry.test.ts`** - Registry validation tests
- **`tests/unit/templates/demoTemplates.test.ts`** - Template validation tests

## Implementation Details (RED-GREEN-REFACTOR)

### RED Phase

Write failing tests that verify:
1. `eds-citisignal-storefront` exists with correct source URL
2. `eds-citisignal-storefront` is in `selectionGroups.frontends`
3. `eds-citisignal-storefront` specifies `adobe-commerce-accs` as compatible backend
4. `adobe-commerce-accs` has required configuration for EDS
5. `citisignal-eds` demo template exists with correct defaults

**Run tests to confirm they fail:**
```bash
npm run test:file -- tests/unit/templates/componentsRegistry.test.ts
npm run test:file -- tests/unit/templates/demoTemplates.test.ts
```

### GREEN Phase

**1. Update `templates/components.json`:**

Add `eds-citisignal-storefront` to components object:

```json
"eds-citisignal-storefront": {
  "name": "CitiSignal EDS Storefront",
  "description": "Edge Delivery Services storefront with Commerce Drop-in components",
  "icon": {
    "light": "eds-file-icon-light.svg",
    "dark": "eds-file-icon-dark.svg"
  },
  "version": "latest",
  "source": {
    "type": "git",
    "url": "https://github.com/skukla/citisignal-one",
    "branch": "main",
    "gitOptions": {
      "shallow": true,
      "recursive": false
    }
  },
  "dependencies": {
    "required": [],
    "optional": ["demo-inspector"]
  },
  "compatibleBackends": ["adobe-commerce-accs"],
  "configuration": {
    "nodeVersion": "20",
    "requiredEnvVars": [
      "COMMERCE_STORE_URL",
      "COMMERCE_STORE_CODE",
      "COMMERCE_STORE_VIEW_CODE",
      "COMMERCE_WEBSITE_CODE"
    ],
    "optionalEnvVars": [
      "DA_LIVE_ORG",
      "DA_LIVE_SITE"
    ]
  }
}
```

**2. Add `commerce-demo-ingestion` tool to components object:**

```json
"commerce-demo-ingestion": {
  "name": "Commerce Demo Ingestion",
  "description": "Tool for populating ACCS instances with demo data",
  "category": "tools",
  "hidden": true,
  "source": {
    "type": "git",
    "url": "https://github.com/PMET-public/commerce-demo-ingestion",
    "branch": "main",
    "gitOptions": {
      "shallow": true
    }
  },
  "dataRepository": {
    "url": "https://github.com/PMET-public/vertical-data-citisignal",
    "branch": "accs"
  },
  "installPath": "~/.demo-builder/tools/commerce-demo-ingestion",
  "configuration": {
    "nodeVersion": "18",
    "requiredEnvVars": [
      "ACO_API_URL",
      "ACO_API_KEY",
      "ACO_TENANT_ID",
      "ACO_ENVIRONMENT_ID"
    ],
    "scripts": {
      "import": "npm run import:aco",
      "cleanup": "npm run delete:aco"
    }
  }
}
```

**3. Update `selectionGroups`:**

```json
"selectionGroups": {
  "frontends": ["citisignal-nextjs", "eds-citisignal-storefront"],
  "backends": ["adobe-commerce-paas", "adobe-commerce-accs"],
  "tools": ["commerce-demo-ingestion"],
  ...
}
```

**4. Enhance `adobe-commerce-accs` component:**

```json
"adobe-commerce-accs": {
  "name": "Adobe Commerce Cloud Service",
  "description": "App Builder-based commerce backend for EDS storefronts",
  "configuration": {
    "nodeVersion": "20",
    "requiredEnvVars": [
      "COMMERCE_STORE_URL",
      "COMMERCE_STORE_CODE",
      "COMMERCE_STORE_VIEW_CODE",
      "COMMERCE_WEBSITE_CODE",
      "COMMERCE_CATALOG_API_KEY"
    ]
  }
}
```

**5. Update `templates/demo-templates.json`:**

Add new template to the templates array:

```json
{
  "id": "citisignal-eds",
  "name": "CitiSignal EDS Experience",
  "description": "Edge Delivery Services storefront with Commerce Drop-in components and DA.live content",
  "icon": "eds",
  "featured": true,
  "tags": ["eds", "edge-delivery", "dropin", "citisignal"],
  "defaults": {
    "frontend": "eds-citisignal-storefront",
    "backend": "adobe-commerce-accs",
    "dependencies": ["demo-inspector"]
  }
}
```

### REFACTOR Phase

1. Verify component structure matches existing patterns (compare to `citisignal-nextjs`)
2. Ensure all required fields are present and consistently formatted
3. Verify JSON validates against schema (if schema exists)
4. Check that icon files exist or note them as needed for future step

## Expected Outcome

- [ ] `eds-citisignal-storefront` selectable in wizard Frontend selection
- [ ] `adobe-commerce-accs` selectable in wizard Backend selection
- [ ] `citisignal-eds` template appears in Demo Template selection
- [ ] Component registry loads without JSON parse errors
- [ ] All unit tests passing

## Acceptance Criteria

- [ ] Component registry loads without errors (JSON valid)
- [ ] New components visible in Component Selection step
- [ ] Demo template visible in Welcome step template picker
- [ ] Dependencies correctly specified (no commerce-mesh for EDS)
- [ ] Compatible backends correctly mapped
- [ ] All tests passing with 100% coverage for new test files
- [ ] No TypeScript/ESLint errors

## Dependencies from Other Steps

- **None** - This is the foundation step with no dependencies

## Dependencies for Other Steps

- **Step 2 (GitHub Service):** Uses component ID `eds-citisignal-storefront` for source URL
- **Step 3 (DA.live Service):** Uses component configuration for DA.live variables
- **Step 4 (EDS Project Service):** Reads component configuration for setup
- **Step 5 (Tool Integration):** Reads `commerce-demo-ingestion` component from registry for tool URL, scripts, and config
- **Step 6 (Wizard Steps):** Shows component options based on registry

## Estimated Complexity

**Simple** - Registry JSON updates only, no code changes required

**Estimated Time:** 1-2 hours (including test writing and validation)

## Notes

### Key Differences from NextJS Frontend

| Aspect | citisignal-nextjs | eds-citisignal-storefront |
|--------|-------------------|---------------------------|
| **Requires Mesh** | Yes (commerce-mesh) | No |
| **Compatible Backends** | adobe-commerce-paas | adobe-commerce-accs |
| **Deployment** | Node.js server | Edge CDN (Helix) |
| **Content Source** | None | DA.live |
| **Repository** | citisignal-nextjs | citisignal-one |

### Icon Files Note

The component references icon files (`eds-file-icon-light.svg`, `eds-file-icon-dark.svg`). If these don't exist yet, create placeholder icons or reuse existing ones initially. Icon creation is a low-priority enhancement.

### Validation Tip

After updating JSON files, validate with:
```bash
# Check JSON syntax
npx jsonlint templates/components.json
npx jsonlint templates/demo-templates.json

# Run tests
npm run test:file -- tests/unit/templates/
```
