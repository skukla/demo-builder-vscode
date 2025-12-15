import { View, Text, Flex, Heading, Divider } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useEffect, useMemo } from 'react';
import { BaseStepProps } from '@/types/wizard';
import { hasRequiredReviewData } from './reviewPredicates';
import { cn } from '@/core/ui/utils/classNames';

export interface ComponentData {
    id: string;
    name: string;
    description?: string;
    configuration?: {
        services?: Array<{
            id: string;
            name: string;
            description: string;
            required: boolean;
        }>;
    };
}

export interface ComponentsData {
    frontends?: ComponentData[];
    backends?: ComponentData[];
    dependencies?: ComponentData[];
    integrations?: ComponentData[];
    appBuilder?: ComponentData[];
}

interface ReviewStepProps extends BaseStepProps {
    componentsData?: ComponentsData;
}

/**
 * LabelValue - Single row with label and value
 * Uses existing utility classes for consistent styling
 */
function LabelValue({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
    return (
        <Flex gap="size-200" alignItems="flex-start">
            <Text UNSAFE_className={cn('text-sm', 'text-gray-600', 'review-label-width')}>{label}</Text>
            <Flex gap="size-100" alignItems="center" flex={1}>
                {icon}
                <Text UNSAFE_className="text-sm">{value}</Text>
            </Flex>
        </Flex>
    );
}

/**
 * Section - Group of label/value pairs with heading
 * Uses existing utility classes: text-xs, font-semibold, text-gray-700, text-uppercase, letter-spacing-05
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View marginBottom="size-300">
            <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'text-uppercase', 'letter-spacing-05')}>
                {title}
            </Text>
            <Flex direction="column" gap="size-100" marginTop="size-150">
                {children}
            </Flex>
        </View>
    );
}

/**
 * Count total configured environment variables
 */
function countConfiguredVariables(componentConfigs?: Record<string, Record<string, unknown>>): number {
    if (!componentConfigs) return 0;
    return Object.values(componentConfigs).reduce(
        (sum, config) => sum + Object.keys(config).length,
        0
    );
}

/**
 * Build Adobe context breadcrumb string
 */
function buildAdobeContext(
    orgName?: string,
    projectName?: string,
    workspaceName?: string
): string | null {
    const parts = [orgName, projectName, workspaceName].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : null;
}

export function ReviewStep({ state, setCanProceed, componentsData }: ReviewStepProps) {
    useEffect(() => {
        const canProceed = hasRequiredReviewData(state);
        setCanProceed(canProceed);
    }, [state, setCanProceed]);

    // Derive component info
    const componentInfo = useMemo(() => {
        const info: { label: string; value: React.ReactNode }[] = [];

        // Frontend
        if (state.components?.frontend && componentsData?.frontends) {
            const frontend = componentsData.frontends.find(f => f.id === state.components?.frontend);
            if (frontend) {
                info.push({ label: 'Frontend', value: frontend.name });
            }
        }

        // Middleware (API Mesh)
        if (state.components?.dependencies?.includes('commerce-mesh') && componentsData?.dependencies) {
            const mesh = componentsData.dependencies.find(d => d.id === 'commerce-mesh');
            if (mesh) {
                const isDeployed = state.apiMesh?.meshStatus === 'deployed';
                info.push({
                    label: 'Middleware',
                    value: (
                        <Flex gap="size-100" alignItems="center">
                            <Text>{mesh.name}</Text>
                            {isDeployed && (
                                <>
                                    <Text UNSAFE_className="text-gray-500">·</Text>
                                    <CheckmarkCircle size="XS" UNSAFE_className="text-green-600" />
                                    <Text>Deployed</Text>
                                </>
                            )}
                        </Flex>
                    )
                });
            }
        }

        // Backend
        if (state.components?.backend && componentsData?.backends) {
            const backend = componentsData.backends.find(b => b.id === state.components?.backend);
            if (backend) {
                info.push({ label: 'Backend', value: backend.name });
            }
        }

        // Other dependencies (not mesh, not demo-inspector which is frontend-associated)
        if (state.components?.dependencies && componentsData?.dependencies) {
            const otherDeps = state.components.dependencies
                .filter(id => id !== 'commerce-mesh' && id !== 'demo-inspector')
                .map(id => componentsData.dependencies?.find(d => d.id === id))
                .filter(Boolean);

            if (otherDeps.length > 0) {
                info.push({
                    label: 'Dependencies',
                    value: otherDeps.map(d => d!.name).join(', ')
                });
            }
        }

        // Integrations
        if (state.components?.integrations && componentsData?.integrations) {
            const integrations = state.components.integrations
                .map(id => componentsData.integrations?.find(i => i.id === id))
                .filter(Boolean);

            if (integrations.length > 0) {
                info.push({
                    label: 'Integrations',
                    value: integrations.map(i => i!.name).join(', ')
                });
            }
        }

        // App Builder
        if (state.components?.appBuilderApps && componentsData?.appBuilder) {
            const apps = state.components.appBuilderApps
                .map(id => componentsData.appBuilder?.find(a => a.id === id))
                .filter(Boolean);

            if (apps.length > 0) {
                info.push({
                    label: 'App Builder',
                    value: apps.map(a => a!.name).join(', ')
                });
            }
        }

        return info;
    }, [state.components, state.apiMesh?.meshStatus, componentsData]);

    // Adobe context breadcrumb
    const adobeContext = useMemo(() => buildAdobeContext(
        state.adobeOrg?.name,
        state.adobeProject?.title || state.adobeProject?.name,
        state.adobeWorkspace?.title || state.adobeWorkspace?.name
    ), [state.adobeOrg, state.adobeProject, state.adobeWorkspace]);

    // Config count
    const configCount = useMemo(
        () => countConfiguredVariables(state.componentConfigs),
        [state.componentConfigs]
    );

    // Mesh info
    const hasMeshEndpoint = state.apiMesh?.endpoint;

    return (
        <div className="container-wizard">
            {/* Project Name - Hero */}
            <Heading level={2} marginBottom="size-100">
                {state.projectName}
            </Heading>

            {/* Adobe Context Breadcrumb */}
            {adobeContext && (
                <Text UNSAFE_className={cn('text-sm', 'text-gray-600')}>
                    {adobeContext}
                </Text>
            )}

            <Divider size="S" marginTop="size-300" marginBottom="size-300" />

            {/* Components Section */}
            {componentInfo.length > 0 && (
                <Section title="COMPONENTS">
                    {componentInfo.map((item, index) => (
                        <LabelValue key={index} label={item.label} value={item.value} />
                    ))}
                </Section>
            )}

            {/* Configuration Section */}
            {(configCount > 0 || hasMeshEndpoint) && (
                <Section title="CONFIGURATION">
                    {configCount > 0 && (
                        <LabelValue
                            label="Variables"
                            value={`${configCount} configured`}
                            icon={<CheckmarkCircle size="XS" UNSAFE_className="text-green-600" />}
                        />
                    )}
                    {hasMeshEndpoint && (
                        <LabelValue
                            label="Mesh endpoint"
                            value={state.apiMesh!.endpoint!}
                        />
                    )}
                </Section>
            )}
        </div>
    );
}
