import { View, Text, Flex, Heading, Divider } from '@adobe/react-spectrum';
import React, { useMemo } from 'react';
import { getStackById } from '../hooks/useSelectedStack';
import { hasRequiredReviewData } from './reviewPredicates';
import { buildComponentInfoList, resolveServiceNames } from './reviewStepHelpers';
import { COMPONENT_IDS } from '@/core/constants';
import { useCanProceed } from '@/core/ui/hooks';
import { cn } from '@/core/ui/utils/classNames';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';
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
    mesh?: ComponentData[];
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
                    width: '120px',
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

/** Derive GitHub repo display info from EDS config */
function deriveGithubRepoInfo(edsConfig: WizardState['edsConfig']): { fullName: string; mode: string } | null {
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
}

/** Derive DA.live display info from EDS config */
function deriveDaLiveInfo(edsConfig: WizardState['edsConfig']): { org: string; site: string; mode: string } | null {
    if (!edsConfig) return null;

    const org = edsConfig.daLiveOrg || '';
    const site = edsConfig.selectedSite?.name || edsConfig.daLiveSite || '';
    if (!site) return null;

    const mode = edsConfig.siteMode === 'existing' ? 'Existing site' : 'New site';
    return { org, site, mode };
}

/** Resolve display name preferring title over name */
function resolveDisplayName(title?: string, name?: string): string | undefined {
    return (title && title.length > 0) ? title : name;
}

/** Project configuration section (package + architecture) */
function ProjectConfigSection({ packageName, stackName }: {
    packageName?: string;
    stackName?: string;
}) {
    if (!packageName && !stackName) return <View />;
    return (
        <Section title="PROJECT CONFIGURATION">
            {packageName && <LabelValue label="Package" value={packageName} />}
            {stackName && <LabelValue label="Architecture" value={stackName} />}
        </Section>
    );
}

/** Adobe I/O context section (org, project, workspace) */
function AdobeIOSection({ orgName, projectName, workspaceName }: {
    orgName?: string;
    projectName?: string;
    workspaceName?: string;
}) {
    if (!orgName && !projectName && !workspaceName) return <View />;
    return (
        <Section title="ADOBE I/O">
            {orgName && <LabelValue label="Organization" value={orgName} />}
            {projectName && <LabelValue label="Project" value={projectName} />}
            {workspaceName && <LabelValue label="Workspace" value={workspaceName} />}
        </Section>
    );
}

/** Components section (frontend, backend, dependencies, etc.) */
function ComponentsSection({ componentInfo }: {
    componentInfo: Array<{ label: string; value: React.ReactNode; subItems?: string[] }>;
}) {
    if (componentInfo.length === 0) return <View />;
    return (
        <Section title="COMPONENTS">
            {componentInfo.map((item, index) => (
                <LabelValue key={index} label={item.label} value={item.value} subItems={item.subItems} />
            ))}
        </Section>
    );
}

/** Edge Delivery Services section (GitHub repo, DA.live, AEM Assets) */
function EdsSection({ githubRepoInfo, daLiveInfo, aemAssetsEnabled }: {
    githubRepoInfo: { fullName: string; mode: string } | null;
    daLiveInfo: { org: string; site: string; mode: string } | null;
    aemAssetsEnabled: boolean;
}) {
    return (
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
            {aemAssetsEnabled && (
                <LabelValue
                    label="AEM Assets"
                    value="Enabled"
                />
            )}
        </Section>
    );
}

/** Check if EDS config has meaningful data */
function hasEdsConfiguration(edsConfig: WizardState['edsConfig']): boolean {
    if (!edsConfig) return false;
    return Boolean(edsConfig.repoName || edsConfig.selectedRepo || edsConfig.daLiveSite || edsConfig.selectedSite);
}

export function ReviewStep({ state, setCanProceed, componentsData, packages, stacks }: ReviewStepProps) {
    useCanProceed(state, setCanProceed, hasRequiredReviewData);

    const stack = useMemo(
        () => state.selectedStack ? getStackById(state.selectedStack) : undefined,
        [state.selectedStack],
    );

    const backendServiceNames = useMemo(
        () => resolveServiceNames(stack?.backend, componentsData?.backends, componentsData?.services),
        [stack?.backend, componentsData?.backends, componentsData?.services],
    );

    const componentSelection = useMemo(() => stack ? {
        frontend: stack.frontend,
        backend: stack.backend,
        dependencies: [...(stack.dependencies || []), ...(state.selectedOptionalDependencies || [])],
    } : undefined, [stack, state.selectedOptionalDependencies]);

    const componentInfo = useMemo(
        () => buildComponentInfoList(componentSelection, state.apiMesh?.meshStatus, componentsData, backendServiceNames),
        [componentSelection, state.apiMesh?.meshStatus, componentsData, backendServiceNames],
    );

    const adobeOrgName = state.adobeOrg?.name;
    const adobeProjectName = resolveDisplayName(state.adobeProject?.title, state.adobeProject?.name);
    const adobeWorkspaceName = resolveDisplayName(state.adobeWorkspace?.title, state.adobeWorkspace?.name);

    const edsConfig = state.edsConfig;
    const hasEdsConfig = hasEdsConfiguration(edsConfig);

    const githubRepoInfo = useMemo(() => deriveGithubRepoInfo(edsConfig), [edsConfig]);
    const daLiveInfo = useMemo(() => deriveDaLiveInfo(edsConfig), [edsConfig]);

    const aemAssetsEnabled = useMemo(() => {
        return state.componentConfigs?.[COMPONENT_IDS.EDS_STOREFRONT]?.AEM_ASSETS_ENABLED === 'true';
    }, [state.componentConfigs]);

    const packageName = state.selectedPackage
        ? packages?.find(p => p.id === state.selectedPackage)?.name
        : undefined;
    const stackName = state.selectedStack
        ? stacks?.find(s => s.id === state.selectedStack)?.name
        : undefined;

    return (
        <div className="container-wizard">
            <Heading level={2} marginBottom="size-300">
                {state.projectName}
            </Heading>

            <Divider size="M" marginBottom="size-400" />

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 'var(--spectrum-global-dimension-size-200)',
                }}
            >
                {/* Span both columns when no Adobe I/O section */}
                <div style={(!adobeOrgName && !adobeProjectName && !adobeWorkspaceName) ? { gridColumn: '1 / -1' } : undefined}>
                    <ProjectConfigSection packageName={packageName} stackName={stackName} />
                </div>
                {(adobeOrgName || adobeProjectName || adobeWorkspaceName) && (
                    <AdobeIOSection
                        orgName={adobeOrgName}
                        projectName={adobeProjectName}
                        workspaceName={adobeWorkspaceName}
                    />
                )}
                <ComponentsSection componentInfo={componentInfo} />
                {hasEdsConfig ? (
                    <EdsSection
                        githubRepoInfo={githubRepoInfo}
                        daLiveInfo={daLiveInfo}
                        aemAssetsEnabled={aemAssetsEnabled}
                    />
                ) : (
                    <View />
                )}
            </div>
        </div>
    );
}
