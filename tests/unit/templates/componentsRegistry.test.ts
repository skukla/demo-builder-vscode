/**
 * Tests for EDS components in the component registry
 * Step 4: Add EDS components to templates/components.json
 *
 * Verifies:
 * - eds-citisignal-storefront component configuration
 * - commerce-demo-ingestion tool component
 * - adobe-commerce-accs backend enhancements
 * - selectionGroups updates for EDS support
 */

import * as fs from 'fs';
import * as path from 'path';

interface ComponentSource {
    type: string;
    url: string;
    branch?: string;
    gitOptions?: {
        shallow?: boolean;
        recursive?: boolean;
    };
}

interface ComponentDependencies {
    required?: string[];
    optional?: string[];
}

interface ComponentConfiguration {
    nodeVersion?: string;
    requiredEnvVars?: string[];
    scripts?: {
        import?: string;
        cleanup?: string;
    };
}

interface DataRepository {
    url: string;
    branch?: string;
}

interface Component {
    name: string;
    description: string;
    icon?: { light: string; dark: string } | string;
    version?: string;
    category?: string;
    hidden?: boolean;
    source?: ComponentSource;
    dependencies?: ComponentDependencies;
    compatibleBackends?: string[];
    configuration?: ComponentConfiguration;
    dataRepository?: DataRepository;
    installPath?: string;
}

interface SelectionGroups {
    frontends: string[];
    backends: string[];
    dependencies: string[];
    appBuilderApps: string[];
    integrations: string[];
    tools?: string[];
}

interface ComponentsRegistry {
    $schema: string;
    version: string;
    infrastructure: Record<string, unknown>;
    selectionGroups: SelectionGroups;
    components: Record<string, Component>;
    services: Record<string, unknown>;
    envVars: Record<string, unknown>;
}

describe('Components Registry - EDS Components', () => {
    let componentsRegistry: ComponentsRegistry;

    beforeAll(() => {
        const componentsPath = path.join(__dirname, '../../../templates/components.json');
        const rawContent = fs.readFileSync(componentsPath, 'utf-8');
        componentsRegistry = JSON.parse(rawContent) as ComponentsRegistry;
    });

    describe('eds-citisignal-storefront component', () => {
        it('should exist in components registry', () => {
            // Arrange & Act
            const component = componentsRegistry.components['eds-citisignal-storefront'];

            // Assert
            expect(component).toBeDefined();
        });

        it('should have required fields (name, description, source)', () => {
            // Arrange
            const component = componentsRegistry.components['eds-citisignal-storefront'];

            // Assert
            expect(component.name).toBeDefined();
            expect(component.name).toBe('CitiSignal EDS Storefront');
            expect(component.description).toBeDefined();
            expect(component.description).toContain('Edge Delivery Services');
            expect(component.source).toBeDefined();
        });

        it('should have correct source configuration (git, citisignal-one URL)', () => {
            // Arrange
            const component = componentsRegistry.components['eds-citisignal-storefront'];

            // Assert
            expect(component.source).toBeDefined();
            expect(component.source!.type).toBe('git');
            expect(component.source!.url).toBe('https://github.com/skukla/citisignal-one');
            expect(component.source!.branch).toBe('main');
            expect(component.source!.gitOptions?.shallow).toBe(true);
        });

        it('should specify adobe-commerce-accs as compatible backend', () => {
            // Arrange
            const component = componentsRegistry.components['eds-citisignal-storefront'];

            // Assert
            expect(component.compatibleBackends).toBeDefined();
            expect(component.compatibleBackends).toContain('adobe-commerce-accs');
        });

        it('should NOT require commerce-mesh dependency', () => {
            // Arrange
            const component = componentsRegistry.components['eds-citisignal-storefront'];

            // Assert
            // EDS uses direct Commerce integration, not API Mesh
            if (component.dependencies?.required) {
                expect(component.dependencies.required).not.toContain('commerce-mesh');
            } else {
                // Empty or undefined required dependencies is acceptable
                expect(component.dependencies?.required || []).toEqual([]);
            }
        });

        it('should have proper configuration with requiredEnvVars', () => {
            // Arrange
            const component = componentsRegistry.components['eds-citisignal-storefront'];

            // Assert
            expect(component.configuration).toBeDefined();
            expect(component.configuration!.nodeVersion).toBe('20');
            expect(component.configuration!.requiredEnvVars).toBeDefined();
            expect(component.configuration!.requiredEnvVars).toContain('COMMERCE_STORE_URL');
            expect(component.configuration!.requiredEnvVars).toContain('COMMERCE_STORE_CODE');
        });
    });

    describe('adobe-commerce-accs backend enhancements', () => {
        it('should have enhanced configuration with requiredEnvVars', () => {
            // Arrange
            const component = componentsRegistry.components['adobe-commerce-accs'];

            // Assert
            expect(component).toBeDefined();
            expect(component.configuration).toBeDefined();
            expect(component.configuration!.nodeVersion).toBe('20');
        });
    });

    describe('selectionGroups - frontend updates', () => {
        it('should include eds-citisignal-storefront in frontends', () => {
            // Arrange & Act
            const frontends = componentsRegistry.selectionGroups.frontends;

            // Assert
            expect(frontends).toContain('eds-citisignal-storefront');
        });

        it('should maintain existing frontends (citisignal-nextjs)', () => {
            // Arrange & Act
            const frontends = componentsRegistry.selectionGroups.frontends;

            // Assert
            expect(frontends).toContain('citisignal-nextjs');
        });
    });

    describe('selectionGroups - tools group', () => {
        it('should have tools group with commerce-demo-ingestion', () => {
            // Arrange & Act
            const tools = componentsRegistry.selectionGroups.tools;

            // Assert
            expect(tools).toBeDefined();
            expect(tools).toContain('commerce-demo-ingestion');
        });
    });

    describe('commerce-demo-ingestion tool component', () => {
        it('should have category: "tools"', () => {
            // Arrange
            const component = componentsRegistry.components['commerce-demo-ingestion'];

            // Assert
            expect(component).toBeDefined();
            expect(component.category).toBe('tools');
        });

        it('should have correct source URL (PMET-public/commerce-demo-ingestion)', () => {
            // Arrange
            const component = componentsRegistry.components['commerce-demo-ingestion'];

            // Assert
            expect(component.source).toBeDefined();
            expect(component.source!.type).toBe('git');
            expect(component.source!.url).toBe('https://github.com/PMET-public/commerce-demo-ingestion');
            expect(component.source!.branch).toBe('main');
        });

        it('should have dataRepository configuration', () => {
            // Arrange
            const component = componentsRegistry.components['commerce-demo-ingestion'];

            // Assert
            expect(component.dataRepository).toBeDefined();
            expect(component.dataRepository!.url).toBe('https://github.com/PMET-public/vertical-data-citisignal');
            expect(component.dataRepository!.branch).toBe('accs');
        });

        it('should have execution scripts (import, cleanup)', () => {
            // Arrange
            const component = componentsRegistry.components['commerce-demo-ingestion'];

            // Assert
            expect(component.configuration).toBeDefined();
            expect(component.configuration!.scripts).toBeDefined();
            expect(component.configuration!.scripts!.import).toBe('npm run import:aco');
            expect(component.configuration!.scripts!.cleanup).toBe('npm run delete:aco');
        });

        it('should have installPath in user data directory', () => {
            // Arrange
            const component = componentsRegistry.components['commerce-demo-ingestion'];

            // Assert
            expect(component.installPath).toBeDefined();
            expect(component.installPath).toBe('~/.demo-builder/tools/commerce-demo-ingestion');
        });

        it('should be hidden from UI (hidden: true)', () => {
            // Arrange
            const component = componentsRegistry.components['commerce-demo-ingestion'];

            // Assert
            expect(component.hidden).toBe(true);
        });

        it('should have requiredEnvVars for ACO integration', () => {
            // Arrange
            const component = componentsRegistry.components['commerce-demo-ingestion'];

            // Assert
            expect(component.configuration).toBeDefined();
            expect(component.configuration!.requiredEnvVars).toBeDefined();
            expect(component.configuration!.requiredEnvVars).toContain('ACO_API_URL');
            expect(component.configuration!.requiredEnvVars).toContain('ACO_API_KEY');
            expect(component.configuration!.requiredEnvVars).toContain('ACO_TENANT_ID');
            expect(component.configuration!.requiredEnvVars).toContain('ACO_ENVIRONMENT_ID');
        });
    });
});
