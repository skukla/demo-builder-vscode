import { View, Text, Flex, Heading, Divider } from '@adobe/react-spectrum';
import React, { useMemo } from 'react';
import { hasRequiredReviewData } from './reviewPredicates';
import { buildComponentInfoList, resolveServiceNames } from './reviewStepHelpers';
import { useCanProceed } from '@/core/ui/hooks';
import { cn } from '@/core/ui/utils/classNames';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import { BaseStepProps } from '@/types/wizard';

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
    /** Available packages for name resolution */
    packages?: DemoPackage[];
    /** Available stacks for name resolution */
    stacks?: Stack[];
}

/**
 * LabelValue - Single row with label and value
 * Uses fixed-width labels for consistent alignment across all cards
 * Supports optional sub-items displayed as a secondary line
 */
function LabelValue({ label, value, icon, subItems }: {
    label: string;
    value: React.ReactNode;
    icon?: React.ReactNode;
    subItems?: string[];
}) {
    return (
        <Flex gap="size-200" alignItems="start">
            <Text 
                UNSAFE_className="review-label"
                UNSAFE_style={{ 
                    minWidth: '180px',
                    flexShrink: 0,
                }}
            >
                {label}
            </Text>
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
                    <Text UNSAFE_className="description-text">
                        {subItems.join(' · ')}
                    </Text>
                )}
            </Flex>
        </Flex>
    );
}

/**
 * Section - Group of label/value pairs with heading in a subtle card
 * Uses background instead of dividers for cleaner visual separation
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View
            padding="size-200"
            borderRadius="medium"
            UNSAFE_style={{
                backgroundColor: 'var(--spectrum-gray-75)',
            }}
        >
            <Text UNSAFE_className={cn('text-sm', 'font-semibold', 'text-gray-600', 'text-uppercase', 'letter-spacing-05')}>
                {title}
            </Text>
            <Flex direction="column" gap="size-150" marginTop="size-150">
                {children}
            </Flex>
        </View>
    );
}

export function ReviewStep({ state, setCanProceed, componentsData, packages, stacks }: ReviewStepProps) {
    // Use custom validator for review step requirements
    useCanProceed(state, setCanProceed, hasRequiredReviewData);

    // Check if Demo Inspector is enabled (can be in dependencies OR selectedAddons)
    const hasDemoInspector = 
        state.components?.dependencies?.includes('demo-inspector') ||
        state.selectedAddons?.includes('demo-inspector') ||
        false;

    // Derive component info using extracted helper
    const backendServiceNames = useMemo(
        () => resolveServiceNames(
            state.components?.backend,
            componentsData?.backends,
            componentsData?.services
        ),
        [state.components?.backend, componentsData?.backends, componentsData?.services]
    );

    const componentInfo = useMemo(
        () => buildComponentInfoList(
            state.components,
            state.apiMesh?.meshStatus,
            componentsData,
            hasDemoInspector,
            backendServiceNames
        ),
        [state.components, state.apiMesh?.meshStatus, componentsData, hasDemoInspector, backendServiceNames]
    );

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

    // EDS Configuration - GitHub and DA.live details
    const edsConfig = state.edsConfig;
    const hasEdsConfig = edsConfig && (edsConfig.repoName || edsConfig.selectedRepo || edsConfig.daLiveSite || edsConfig.selectedSite);

    // Derive GitHub repo display info
    const githubRepoInfo = useMemo(() => {
        if (!edsConfig) return null;

        const owner = edsConfig.selectedRepo?.fullName?.split('/')[0]
            || edsConfig.githubAuth?.user?.login
            || '';
        const repoName = edsConfig.selectedRepo?.name || edsConfig.repoName || '';

        if (!repoName) return null;

        const fullName = owner ? `${owner}/${repoName}` : repoName;
        const isExisting = edsConfig.repoMode === 'existing';
        const willReset = isExisting && edsConfig.resetToTemplate;

        let mode = 'New repository';
        if (isExisting && willReset) {
            mode = 'Reset to template';
        } else if (isExisting) {
            mode = 'Existing repository';
        }

        return { fullName, mode };
    }, [edsConfig]);

    // Derive DA.live display info
    const daLiveInfo = useMemo(() => {
        if (!edsConfig) return null;

        const org = edsConfig.daLiveOrg || '';
        const site = edsConfig.selectedSite?.name || edsConfig.daLiveSite || '';

        if (!site) return null;

        const isExisting = edsConfig.siteMode === 'existing';
        const mode = isExisting ? 'Existing site' : 'New site';

        return { org, site, mode };
    }, [edsConfig]);

    // Resolve package/stack names
    const packageName = state.selectedPackage
        ? packages?.find(p => p.id === state.selectedPackage)?.name
        : undefined;
    const stackName = state.selectedStack
        ? stacks?.find(s => s.id === state.selectedStack)?.name
        : undefined;
    const hasPackageStackContext = packageName || stackName;

    return (
        <div className="container-wizard">
            {/* Project Name - Hero */}
            <Heading level={2} marginBottom="size-300">
                {state.projectName}
            </Heading>

            <Divider size="M" marginBottom="size-400" />

            {/* Two-Column Grid Layout - cards provide visual separation */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 'var(--spectrum-global-dimension-size-200)',
                }}
            >
                {/* Row 1: Project Config | Adobe I/O */}
                {hasPackageStackContext ? (
                    <Section title="PROJECT CONFIGURATION">
                        {packageName && <LabelValue label="Package" value={packageName} />}
                        {stackName && <LabelValue label="Architecture" value={stackName} />}
                    </Section>
                ) : (
                    <View /> 
                )}
                {hasAdobeContext ? (
                    <Section title="ADOBE I/O">
                        {adobeOrgName && <LabelValue label="Organization" value={adobeOrgName} />}
                        {adobeProjectName && <LabelValue label="Project" value={adobeProjectName} />}
                        {adobeWorkspaceName && <LabelValue label="Workspace" value={adobeWorkspaceName} />}
                    </Section>
                ) : (
                    <View />
                )}

                {/* Row 2: Components | EDS (Repository/Content) */}
                {componentInfo.length > 0 ? (
                    <Section title="COMPONENTS">
                        {componentInfo.map((item, index) => (
                            <LabelValue key={index} label={item.label} value={item.value} subItems={item.subItems} />
                        ))}
                    </Section>
                ) : (
                    <View />
                )}
                {hasEdsConfig ? (
                    <Section title="EDGE DELIVERY SERVICES">
                        {githubRepoInfo && (
                            <LabelValue
                                label="GitHub Repository"
                                value={githubRepoInfo.fullName}
                                subItems={[githubRepoInfo.mode]}
                            />
                        )}
                        {daLiveInfo && (
                            <LabelValue
                                label="DA.live Project"
                                value={daLiveInfo.org ? `${daLiveInfo.org}/${daLiveInfo.site}` : daLiveInfo.site}
                                subItems={[daLiveInfo.mode]}
                            />
                        )}
                    </Section>
                ) : (
                    <View />
                )}
            </div>
        </div>
    );
}
