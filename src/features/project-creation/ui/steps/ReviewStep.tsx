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
    configuration?: Record<string, unknown>;
}

export interface ComponentsData {
    frontends?: ComponentData[];
    backends?: ComponentData[];
    dependencies?: ComponentData[];
    integrations?: ComponentData[];
    appBuilder?: ComponentData[];
    /** Raw services from registry for name resolution */
    services?: Record<string, { name: string; description?: string }>;
}

interface ReviewStepProps extends BaseStepProps {
    componentsData?: ComponentsData;
}

/**
 * LabelValue - Single row with label and value
 * Uses 14px fonts for readability with fixed-width labels
 * Supports optional sub-items displayed as a secondary line
 */
function LabelValue({ label, value, icon, subItems }: {
    label: string;
    value: React.ReactNode;
    icon?: React.ReactNode;
    subItems?: string[];
}) {
    return (
        <Flex gap="size-200" alignItems="flex-start">
            <Text UNSAFE_className={cn('text-md', 'text-gray-500')} UNSAFE_style={{ minWidth: '100px' }}>{label}</Text>
            <Flex direction="column" gap="size-50" flex={1}>
                <Flex gap="size-100" alignItems="center">
                    {icon}
                    {typeof value === 'string' ? (
                        <Text UNSAFE_className="text-md">{value}</Text>
                    ) : (
                        value
                    )}
                </Flex>
                {subItems && subItems.length > 0 && (
                    <Text UNSAFE_className={cn('text-sm', 'text-gray-500')}>
                        {subItems.join(' · ')}
                    </Text>
                )}
            </Flex>
        </Flex>
    );
}

/**
 * Section - Group of label/value pairs with heading
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View marginBottom="size-300">
            <Text UNSAFE_className={cn('text-sm', 'font-semibold', 'text-gray-600', 'text-uppercase', 'letter-spacing-05')}>
                {title}
            </Text>
            <Flex direction="column" gap="size-150" marginTop="size-150">
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

export function ReviewStep({ state, setCanProceed, componentsData }: ReviewStepProps) {
    useEffect(() => {
        const canProceed = hasRequiredReviewData(state);
        setCanProceed(canProceed);
    }, [state, setCanProceed]);

    // Check if Demo Inspector is enabled as explicit dependency
    const hasDemoInspector = state.components?.dependencies?.includes('demo-inspector') ?? false;

    // Get backend services - resolve from raw registry services
    const backendServiceNames = useMemo(() => {
        if (!state.components?.backend || !componentsData?.backends || !componentsData?.services) return [];
        const backend = componentsData.backends.find(b => b.id === state.components?.backend);
        const serviceIds = (backend?.configuration?.requiredServices as string[] | undefined) || [];
        return serviceIds
            .map(id => componentsData.services?.[id]?.name)
            .filter((name): name is string => Boolean(name));
    }, [state.components?.backend, componentsData?.backends, componentsData?.services]);

    // Derive component info
    const componentInfo = useMemo(() => {
        const info: { label: string; value: React.ReactNode; subItems?: string[] }[] = [];

        // Frontend with Demo Inspector indicator
        if (state.components?.frontend && componentsData?.frontends) {
            const frontend = componentsData.frontends.find(f => f.id === state.components?.frontend);
            if (frontend) {
                info.push({
                    label: 'Frontend',
                    value: frontend.name,
                    subItems: hasDemoInspector ? ['Demo Inspector'] : undefined,
                });
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
                            <Text UNSAFE_className="text-md">{mesh.name}</Text>
                            {isDeployed && (
                                <>
                                    <Text UNSAFE_className={cn('text-md', 'text-gray-500')}>·</Text>
                                    <CheckmarkCircle size="XS" UNSAFE_className="text-green-600" />
                                    <Text UNSAFE_className="text-md">Deployed</Text>
                                </>
                            )}
                        </Flex>
                    )
                });
            }
        }

        // Backend with services
        if (state.components?.backend && componentsData?.backends) {
            const backend = componentsData.backends.find(b => b.id === state.components?.backend);
            if (backend) {
                info.push({
                    label: 'Backend',
                    value: backend.name,
                    subItems: backendServiceNames.length > 0 ? backendServiceNames : undefined,
                });
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
    }, [state.components, state.apiMesh?.meshStatus, componentsData, hasDemoInspector, backendServiceNames]);

    // Adobe context info - prefer title (human-readable) over name (often ID-like)
    // Use explicit empty check since empty string is falsy but should still fallback
    const adobeOrgName = state.adobeOrg?.name;
    const adobeProjectTitle = state.adobeProject?.title;
    const adobeProjectName = (adobeProjectTitle && adobeProjectTitle.length > 0)
        ? adobeProjectTitle
        : state.adobeProject?.name;
    const adobeWorkspaceTitle = state.adobeWorkspace?.title;
    const adobeWorkspaceName = (adobeWorkspaceTitle && adobeWorkspaceTitle.length > 0)
        ? adobeWorkspaceTitle
        : state.adobeWorkspace?.name;
    const hasAdobeContext = adobeOrgName || adobeProjectName || adobeWorkspaceName;

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
            <Heading level={2} marginBottom="size-300">
                {state.projectName}
            </Heading>

            <Divider size="S" marginBottom="size-300" />

            {/* Adobe I/O Section */}
            {hasAdobeContext && (
                <>
                    <Section title="ADOBE I/O">
                        {adobeOrgName && <LabelValue label="Organization" value={adobeOrgName} />}
                        {adobeProjectName && <LabelValue label="Project" value={adobeProjectName} />}
                        {adobeWorkspaceName && <LabelValue label="Workspace" value={adobeWorkspaceName} />}
                    </Section>
                    <Divider size="S" marginBottom="size-300" />
                </>
            )}

            {/* Components Section */}
            {componentInfo.length > 0 && (
                <>
                    <Section title="COMPONENTS">
                        {componentInfo.map((item, index) => (
                            <LabelValue key={index} label={item.label} value={item.value} subItems={item.subItems} />
                        ))}
                    </Section>
                    {(configCount > 0 || hasMeshEndpoint) && (
                        <Divider size="S" marginBottom="size-300" />
                    )}
                </>
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
                            label="Mesh URL"
                            value={state.apiMesh!.endpoint!}
                        />
                    )}
                </Section>
            )}
        </div>
    );
}
