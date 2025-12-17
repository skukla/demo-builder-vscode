# Step 1: Create Demo Templates Configuration Schema

## Purpose

Define the `demo-templates.json` schema and create an initial template configuration that will drive the template selection UI. This establishes the data model for all subsequent steps.

## Prerequisites

- [ ] Phase 2 complete (backend component IDs available in components.json)
  - OR: Use existing component IDs for initial template

## Tests to Write First (RED Phase)

### Test File: `tests/features/project-creation/ui/helpers/templateLoader.test.ts`

```typescript
import { loadDemoTemplates, validateTemplate } from '../templateLoader';

describe('templateLoader', () => {
    describe('loadDemoTemplates', () => {
        it('should load templates from demo-templates.json', async () => {
            const templates = await loadDemoTemplates();
            expect(templates).toBeDefined();
            expect(Array.isArray(templates)).toBe(true);
        });

        it('should return at least one template', async () => {
            const templates = await loadDemoTemplates();
            expect(templates.length).toBeGreaterThanOrEqual(1);
        });

        it('should have required properties on each template', async () => {
            const templates = await loadDemoTemplates();
            templates.forEach(template => {
                expect(template.id).toBeDefined();
                expect(template.name).toBeDefined();
                expect(template.description).toBeDefined();
                expect(template.defaults).toBeDefined();
            });
        });
    });

    describe('validateTemplate', () => {
        it('should return valid for template with all required fields', () => {
            const template = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template',
                defaults: {
                    backend: 'adobe-commerce-paas',
                    frontend: 'citisignal-nextjs',
                    dependencies: ['commerce-mesh']
                }
            };
            expect(validateTemplate(template).valid).toBe(true);
        });

        it('should return invalid for template missing id', () => {
            const template = {
                name: 'Test Template',
                description: 'A test template',
                defaults: {}
            };
            expect(validateTemplate(template).valid).toBe(false);
            expect(validateTemplate(template).errors).toContain('id');
        });

        it('should return invalid for template with unknown component references', () => {
            const template = {
                id: 'test-template',
                name: 'Test',
                description: 'Test',
                defaults: {
                    backend: 'nonexistent-backend'
                }
            };
            const result = validateTemplate(template);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('backend: nonexistent-backend');
        });
    });
});
```

**Test Scenarios:**
- [ ] Templates load successfully from JSON
- [ ] At least one template exists
- [ ] Required properties present (id, name, description, defaults)
- [ ] Template validation passes for valid templates
- [ ] Validation fails for missing required fields
- [ ] Validation warns on unknown component references

## Files to Create

### 1. `templates/demo-templates.schema.json`

JSON schema for template validation:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Demo Templates",
  "type": "object",
  "required": ["templates"],
  "properties": {
    "templates": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "description", "defaults"],
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
          "name": { "type": "string", "minLength": 1 },
          "description": { "type": "string" },
          "icon": { "type": "string" },
          "defaults": {
            "type": "object",
            "properties": {
              "backend": { "type": "string" },
              "frontend": { "type": "string" },
              "dependencies": { "type": "array", "items": { "type": "string" } },
              "services": { "type": "array", "items": { "type": "string" } }
            }
          },
          "supportedBackends": { "type": "array", "items": { "type": "string" } },
          "supportedFrontends": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}
```

### 2. `templates/demo-templates.json`

Initial template configuration:

```json
{
  "$schema": "./demo-templates.schema.json",
  "templates": [
    {
      "id": "citisignal-financial",
      "name": "CitiSignal Financial Services",
      "description": "Complete financial services demo with headless storefront and API Mesh integration",
      "icon": "building",
      "defaults": {
        "backend": "adobe-commerce-paas",
        "frontend": "citisignal-nextjs",
        "dependencies": ["commerce-mesh", "demo-inspector"],
        "services": ["catalog-service", "live-search"]
      },
      "supportedBackends": ["adobe-commerce-paas"],
      "supportedFrontends": ["citisignal-nextjs"]
    }
  ]
}
```

### 3. `src/features/project-creation/ui/helpers/templateLoader.ts`

Template loading utility:

```typescript
import type { DemoTemplate, TemplateValidationResult } from '@/types/templates';

/**
 * Load demo templates from configuration
 */
export async function loadDemoTemplates(): Promise<DemoTemplate[]> {
    // In webview context, templates are passed via message
    // This is a placeholder for the message-based loading
    return [];
}

/**
 * Validate a template definition
 */
export function validateTemplate(template: unknown): TemplateValidationResult {
    const errors: string[] = [];
    const t = template as Record<string, unknown>;

    if (!t.id) errors.push('id');
    if (!t.name) errors.push('name');
    if (!t.description) errors.push('description');
    if (!t.defaults) errors.push('defaults');

    // Validate component references (will be enhanced in Step 4)

    return {
        valid: errors.length === 0,
        errors
    };
}
```

## Files to Modify

### `src/types/templates.ts` (create new file)

Type definitions for demo templates:

```typescript
export interface DemoTemplate {
    id: string;
    name: string;
    description: string;
    icon?: string;
    defaults: TemplateDefaults;
    supportedBackends?: string[];
    supportedFrontends?: string[];
}

export interface TemplateDefaults {
    backend?: string;
    frontend?: string;
    dependencies?: string[];
    services?: string[];
}

export interface TemplateValidationResult {
    valid: boolean;
    errors: string[];
}
```

## Implementation Details (GREEN Phase)

1. Create JSON schema file first
2. Create demo-templates.json with one template
3. Create types file
4. Create loader utility with basic validation
5. Run tests to verify

## Refactor Phase

- Ensure type exports are clean
- Verify JSON validates against schema
- Check template references match components.json component IDs

## Expected Outcome

- [ ] `demo-templates.schema.json` created with valid JSON Schema
- [ ] `demo-templates.json` created with CitiSignal template
- [ ] `src/types/templates.ts` created with type definitions
- [ ] `templateLoader.ts` created with load and validate functions
- [ ] All tests passing

## Acceptance Criteria

- [ ] JSON schema validates correctly
- [ ] At least one template defined
- [ ] Template references valid component IDs
- [ ] Types exported and available
- [ ] Loader functions work in test environment
- [ ] No TypeScript errors
