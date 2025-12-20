/**
 * Tests for citisignal-eds demo template
 * Step 4: Add citisignal-eds template to demo-templates.json
 *
 * Verifies:
 * - citisignal-eds template exists and has proper structure
 * - Template references valid component IDs
 * - Template does NOT include commerce-mesh dependency
 */

import * as fs from 'fs';
import * as path from 'path';

interface TemplateDefaults {
    frontend: string;
    backend: string;
    dependencies?: string[];
    integrations?: string[];
    appBuilder?: string[];
    configDefaults?: Record<string, string>;
}

interface DemoTemplate {
    id: string;
    name: string;
    description: string;
    icon?: string;
    featured?: boolean;
    tags?: string[];
    defaults: TemplateDefaults;
}

interface DemoTemplatesConfig {
    $schema: string;
    version: string;
    templates: DemoTemplate[];
}

interface ComponentsRegistry {
    components: Record<string, unknown>;
}

describe('Demo Templates - citisignal-eds', () => {
    let templatesConfig: DemoTemplatesConfig;
    let componentsRegistry: ComponentsRegistry;

    beforeAll(() => {
        // Load demo templates
        const templatesPath = path.join(__dirname, '../../../templates/demo-templates.json');
        const templatesContent = fs.readFileSync(templatesPath, 'utf-8');
        templatesConfig = JSON.parse(templatesContent) as DemoTemplatesConfig;

        // Load components registry for validation
        const componentsPath = path.join(__dirname, '../../../templates/components.json');
        const componentsContent = fs.readFileSync(componentsPath, 'utf-8');
        componentsRegistry = JSON.parse(componentsContent) as ComponentsRegistry;
    });

    describe('citisignal-eds template existence', () => {
        it('should exist in templates array', () => {
            // Arrange & Act
            const template = templatesConfig.templates.find(t => t.id === 'citisignal-eds');

            // Assert
            expect(template).toBeDefined();
        });
    });

    describe('citisignal-eds template structure', () => {
        it('should have required fields (name, description, defaults)', () => {
            // Arrange
            const template = templatesConfig.templates.find(t => t.id === 'citisignal-eds');

            // Assert
            expect(template).toBeDefined();
            expect(template!.name).toBeDefined();
            expect(template!.name).toBe('CitiSignal EDS Experience');
            expect(template!.description).toBeDefined();
            expect(template!.description).toContain('Edge Delivery Services');
            expect(template!.defaults).toBeDefined();
        });

        it('should have appropriate tags for EDS', () => {
            // Arrange
            const template = templatesConfig.templates.find(t => t.id === 'citisignal-eds');

            // Assert
            expect(template!.tags).toBeDefined();
            expect(template!.tags).toContain('eds');
            expect(template!.tags).toContain('edge-delivery');
        });

        it('should be marked as featured', () => {
            // Arrange
            const template = templatesConfig.templates.find(t => t.id === 'citisignal-eds');

            // Assert
            expect(template!.featured).toBe(true);
        });

        it('should have eds icon', () => {
            // Arrange
            const template = templatesConfig.templates.find(t => t.id === 'citisignal-eds');

            // Assert
            expect(template!.icon).toBe('eds');
        });
    });

    describe('citisignal-eds template defaults', () => {
        it('should reference eds-citisignal-storefront as frontend', () => {
            // Arrange
            const template = templatesConfig.templates.find(t => t.id === 'citisignal-eds');

            // Assert
            expect(template!.defaults.frontend).toBe('eds-citisignal-storefront');
        });

        it('should reference adobe-commerce-accs as backend', () => {
            // Arrange
            const template = templatesConfig.templates.find(t => t.id === 'citisignal-eds');

            // Assert
            expect(template!.defaults.backend).toBe('adobe-commerce-accs');
        });

        it('should NOT include commerce-mesh in dependencies', () => {
            // Arrange
            const template = templatesConfig.templates.find(t => t.id === 'citisignal-eds');
            const dependencies = template!.defaults.dependencies || [];

            // Assert
            // EDS does not use API Mesh
            expect(dependencies).not.toContain('commerce-mesh');
        });

        it('should include demo-inspector in dependencies', () => {
            // Arrange
            const template = templatesConfig.templates.find(t => t.id === 'citisignal-eds');
            const dependencies = template!.defaults.dependencies || [];

            // Assert
            expect(dependencies).toContain('demo-inspector');
        });
    });

    describe('citisignal-eds template component validation', () => {
        it('should reference valid component IDs from components.json', () => {
            // Arrange
            const template = templatesConfig.templates.find(t => t.id === 'citisignal-eds');
            const knownComponentIds = Object.keys(componentsRegistry.components);

            // Assert - Frontend is valid
            expect(knownComponentIds).toContain(template!.defaults.frontend);

            // Assert - Backend is valid
            expect(knownComponentIds).toContain(template!.defaults.backend);

            // Assert - All dependencies are valid
            const dependencies = template!.defaults.dependencies || [];
            for (const depId of dependencies) {
                expect(knownComponentIds).toContain(depId);
            }
        });
    });

    describe('existing templates preservation', () => {
        it('should maintain citisignal (nextjs) template', () => {
            // Arrange & Act
            const template = templatesConfig.templates.find(t => t.id === 'citisignal');

            // Assert
            expect(template).toBeDefined();
            expect(template!.defaults.frontend).toBe('citisignal-nextjs');
        });
    });
});
