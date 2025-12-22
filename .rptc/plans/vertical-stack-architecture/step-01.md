# Step 1: Data Model - Brands and Stacks

## Status

- [x] Tests Written (RED)
- [x] Implementation Complete (GREEN)
- [x] Refactored (REFACTOR)

---

## Purpose

Define the new data model that separates **brands** (content/vertical) from **stacks** (frontend + backend architecture). This replaces the current monolithic template approach where each template hardcodes a specific brand + stack combination.

**Key Concepts:**
- **Brand**: Content, store codes, branding (CitiSignal, Default, BuildRight)
- **Stack**: Frontend + backend + dependencies (Headless, Edge Delivery)

---

## Prerequisites

- [ ] Previous steps completed: None (first step)
- [ ] Required knowledge: Current `demo-templates.json` structure
- [ ] Access required: `templates/` directory

---

## Files to Create/Modify

### New Files

1. **`templates/brands.json`** - Brand definitions
2. **`templates/stacks.json`** - Stack definitions
3. **`templates/brands.schema.json`** - JSON schema for validation
4. **`templates/stacks.schema.json`** - JSON schema for validation
5. **`src/types/brands.ts`** - TypeScript interfaces
6. **`src/types/stacks.ts`** - TypeScript interfaces

### Modified Files

1. **`templates/demo-templates.json`** - Deprecate or remove (replaced by brands + stacks)

---

## Data Model Design

### Brands (`templates/brands.json`)

```json
{
  "$schema": "./brands.schema.json",
  "version": "1.0.0",
  "brands": [
    {
      "id": "default",
      "name": "Default",
      "description": "Generic storefront with default content",
      "icon": "default",
      "configDefaults": {},
      "contentSources": {
        "eds": "main--boilerplate--adobe-commerce.aem.live"
      }
    },
    {
      "id": "citisignal",
      "name": "CitiSignal",
      "description": "Telecommunications demo with CitiSignal branding",
      "icon": "citisignal",
      "featured": true,
      "configDefaults": {
        "ADOBE_COMMERCE_WEBSITE_CODE": "citisignal",
        "ADOBE_COMMERCE_STORE_CODE": "citisignal_store",
        "ADOBE_COMMERCE_STORE_VIEW_CODE": "citisignal_us"
      },
      "contentSources": {
        "eds": "main--accs-citisignal--demo-system-stores.aem.live"
      }
    },
    {
      "id": "buildright",
      "name": "BuildRight",
      "description": "Construction/hardware demo with BuildRight branding",
      "icon": "buildright",
      "configDefaults": {
        "ADOBE_COMMERCE_WEBSITE_CODE": "buildright",
        "ADOBE_COMMERCE_STORE_CODE": "buildright_store",
        "ADOBE_COMMERCE_STORE_VIEW_CODE": "buildright_us"
      },
      "contentSources": {
        "eds": "main--accs-buildright--demo-system-stores.aem.live"
      }
    }
  ]
}
```

### Stacks (`templates/stacks.json`)

```json
{
  "$schema": "./stacks.schema.json",
  "version": "1.0.0",
  "stacks": [
    {
      "id": "headless",
      "name": "Headless",
      "description": "NextJS storefront with API Mesh and Commerce PaaS",
      "icon": "nextjs",
      "frontend": "citisignal-nextjs",
      "backend": "adobe-commerce-paas",
      "dependencies": ["commerce-mesh", "demo-inspector"],
      "features": ["Server-side rendering", "API Mesh integration", "Full customization"]
    },
    {
      "id": "edge-delivery",
      "name": "Edge Delivery",
      "description": "EDS storefront with Commerce Drop-ins and ACCS",
      "icon": "eds",
      "frontend": "eds-storefront",
      "backend": "adobe-commerce-accs",
      "dependencies": ["demo-inspector"],
      "features": ["Ultra-fast delivery", "DA.live content", "Commerce Drop-ins"],
      "requiresGitHub": true,
      "requiresDaLive": true
    }
  ]
}
```

### TypeScript Interfaces (`src/types/brands.ts`)

```typescript
/**
 * Brand - Content/vertical configuration
 */
export interface Brand {
    /** Unique identifier (e.g., 'citisignal') */
    id: string;
    /** Display name */
    name: string;
    /** Description */
    description: string;
    /** Icon identifier */
    icon?: string;
    /** Whether this brand is featured */
    featured?: boolean;
    /** Default configuration values for this brand */
    configDefaults: Record<string, string>;
    /** Content sources by stack type */
    contentSources: {
        eds?: string;  // DA.live content source for EDS
    };
}

export interface BrandsConfig {
    version: string;
    brands: Brand[];
}
```

### TypeScript Interfaces (`src/types/stacks.ts`)

```typescript
/**
 * Stack - Frontend + Backend architecture combination
 */
export interface Stack {
    /** Unique identifier (e.g., 'headless', 'edge-delivery') */
    id: string;
    /** Display name */
    name: string;
    /** Description */
    description: string;
    /** Icon identifier */
    icon?: string;
    /** Frontend component ID from components.json */
    frontend: string;
    /** Backend component ID from components.json */
    backend: string;
    /** Dependency component IDs */
    dependencies: string[];
    /** Feature highlights for UI display */
    features?: string[];
    /** Whether this stack requires GitHub OAuth */
    requiresGitHub?: boolean;
    /** Whether this stack requires DA.live access */
    requiresDaLive?: boolean;
}

export interface StacksConfig {
    version: string;
    stacks: Stack[];
}
```

---

## Tests to Write First (TDD)

### Unit Tests

**Test File:** `tests/templates/brands.test.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('brands.json', () => {
    let brandsConfig: Record<string, unknown>;

    beforeAll(() => {
        const brandsPath = path.join(__dirname, '../../templates/brands.json');
        brandsConfig = JSON.parse(fs.readFileSync(brandsPath, 'utf-8'));
    });

    it('should have required version field', () => {
        expect(brandsConfig.version).toBeDefined();
        expect(typeof brandsConfig.version).toBe('string');
    });

    it('should have brands array with at least 2 brands', () => {
        const brands = brandsConfig.brands as Array<Record<string, unknown>>;
        expect(Array.isArray(brands)).toBe(true);
        expect(brands.length).toBeGreaterThanOrEqual(2);
    });

    describe('default brand', () => {
        it('should exist', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const defaultBrand = brands.find(b => b.id === 'default');
            expect(defaultBrand).toBeDefined();
        });

        it('should have required fields', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const defaultBrand = brands.find(b => b.id === 'default');
            expect(defaultBrand?.name).toBe('Default');
            expect(defaultBrand?.description).toBeDefined();
            expect(defaultBrand?.configDefaults).toBeDefined();
        });
    });

    describe('citisignal brand', () => {
        it('should exist with store codes', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const citisignal = brands.find(b => b.id === 'citisignal');
            expect(citisignal).toBeDefined();

            const configDefaults = citisignal?.configDefaults as Record<string, string>;
            expect(configDefaults.ADOBE_COMMERCE_WEBSITE_CODE).toBe('citisignal');
            expect(configDefaults.ADOBE_COMMERCE_STORE_CODE).toBe('citisignal_store');
            expect(configDefaults.ADOBE_COMMERCE_STORE_VIEW_CODE).toBe('citisignal_us');
        });

        it('should have EDS content source', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const citisignal = brands.find(b => b.id === 'citisignal');
            const contentSources = citisignal?.contentSources as Record<string, string>;
            expect(contentSources?.eds).toContain('citisignal');
        });
    });

    describe('all brands', () => {
        it('should have unique IDs', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const ids = brands.map(b => b.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });

        it('should all have required fields', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            brands.forEach(brand => {
                expect(brand.id).toBeDefined();
                expect(brand.name).toBeDefined();
                expect(brand.description).toBeDefined();
                expect(brand.configDefaults).toBeDefined();
            });
        });
    });
});
```

**Test File:** `tests/templates/stacks.test.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('stacks.json', () => {
    let stacksConfig: Record<string, unknown>;
    let componentsConfig: Record<string, unknown>;

    beforeAll(() => {
        const stacksPath = path.join(__dirname, '../../templates/stacks.json');
        const componentsPath = path.join(__dirname, '../../templates/components.json');
        stacksConfig = JSON.parse(fs.readFileSync(stacksPath, 'utf-8'));
        componentsConfig = JSON.parse(fs.readFileSync(componentsPath, 'utf-8'));
    });

    it('should have required version field', () => {
        expect(stacksConfig.version).toBeDefined();
    });

    it('should have stacks array with at least 2 stacks', () => {
        const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
        expect(Array.isArray(stacks)).toBe(true);
        expect(stacks.length).toBeGreaterThanOrEqual(2);
    });

    describe('headless stack', () => {
        it('should exist with NextJS + PaaS', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const headless = stacks.find(s => s.id === 'headless');
            expect(headless).toBeDefined();
            expect(headless?.frontend).toBe('citisignal-nextjs');
            expect(headless?.backend).toBe('adobe-commerce-paas');
        });

        it('should include commerce-mesh dependency', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const headless = stacks.find(s => s.id === 'headless');
            const deps = headless?.dependencies as string[];
            expect(deps).toContain('commerce-mesh');
        });
    });

    describe('edge-delivery stack', () => {
        it('should exist with EDS + ACCS', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const eds = stacks.find(s => s.id === 'edge-delivery');
            expect(eds).toBeDefined();
            expect(eds?.frontend).toBe('eds-storefront');
            expect(eds?.backend).toBe('adobe-commerce-accs');
        });

        it('should NOT include commerce-mesh dependency', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const eds = stacks.find(s => s.id === 'edge-delivery');
            const deps = eds?.dependencies as string[];
            expect(deps).not.toContain('commerce-mesh');
        });

        it('should require GitHub and DA.live', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const eds = stacks.find(s => s.id === 'edge-delivery');
            expect(eds?.requiresGitHub).toBe(true);
            expect(eds?.requiresDaLive).toBe(true);
        });
    });

    describe('component references', () => {
        it('should reference valid frontend components', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const components = componentsConfig.components as Record<string, unknown>;

            stacks.forEach(stack => {
                const frontend = stack.frontend as string;
                // eds-storefront won't exist yet - skip or expect it to be added
                if (frontend !== 'eds-storefront') {
                    expect(components).toHaveProperty(frontend);
                }
            });
        });

        it('should reference valid backend components', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const components = componentsConfig.components as Record<string, unknown>;

            stacks.forEach(stack => {
                const backend = stack.backend as string;
                expect(components).toHaveProperty(backend);
            });
        });
    });
});
```

---

## Implementation Details (RED-GREEN-REFACTOR)

### RED Phase

Write failing tests that verify:
1. `brands.json` exists with default and citisignal brands
2. `stacks.json` exists with headless and edge-delivery stacks
3. All required fields are present
4. Component references are valid

### GREEN Phase

1. Create `templates/brands.json` with brand definitions
2. Create `templates/stacks.json` with stack definitions
3. Create JSON schemas for validation
4. Create TypeScript interfaces

### REFACTOR Phase

1. Ensure consistent naming conventions
2. Add JSDoc comments to interfaces
3. Validate JSON against schemas

---

## Migration Notes

### Backward Compatibility

The existing `demo-templates.json` will be kept temporarily for backward compatibility. The new brands + stacks model will be used by the updated Welcome step UI (Step 2).

### Template → Brand + Stack Mapping

| Old Template | Brand | Stack |
|--------------|-------|-------|
| `citisignal` | `citisignal` | `headless` |
| (new) | `citisignal` | `edge-delivery` |
| (new) | `default` | `edge-delivery` |

---

## Acceptance Criteria

- [ ] `brands.json` validates against schema
- [ ] `stacks.json` validates against schema
- [ ] TypeScript interfaces exported from `@/types`
- [ ] At least 2 brands defined (default, citisignal)
- [ ] At least 2 stacks defined (headless, edge-delivery)
- [ ] All tests passing

---

## Dependencies for Other Steps

- **Step 2 (Welcome UI):** Uses brands and stacks for selection UI
- **Step 3 (Component Wiring):** Uses stack definitions to load components
- **Step 4+ (EDS):** Uses brand content sources for DA.live copy

---

## Estimated Complexity

**Simple** - JSON file creation and TypeScript interfaces

**Estimated Time:** 2-3 hours (including tests)
