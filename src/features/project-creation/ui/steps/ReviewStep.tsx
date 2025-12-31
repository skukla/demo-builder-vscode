import { View, Text, Flex, Heading, Divider } from '@adobe/react-spectrum';
import React, { useMemo } from 'react';
import { hasRequiredReviewData } from './reviewPredicates';
import { resolveServiceNames, buildComponentInfoList } from './reviewStepHelpers';
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
        <Flex gap="size-200" alignItems="start">
            <Text UNSAFE_className="review-label">{label}</Text>
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
 * Section - Group of label/value pairs with heading
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View marginBottom="size-200">
            <Text UNSAFE_className={cn('text-sm', 'font-semibold', 'text-gray-600', 'text-uppercase', 'letter-spacing-05')}>
                {title}
            </Text>
            <Flex direction="column" gap="size-100" marginTop="size-100">
                {children}
            </Flex>
        </View>
    );
}

export function ReviewStep({ state, setCanProceed, componentsData, packages, stacks }: ReviewStepProps) {
    // Use custom validator for review step requirements
    useCanProceed(state, setCanProceed, hasRequiredReviewData);

    // Check if Demo Inspector is enabled as explicit dependency
    const hasDemoInspector = state.components?.dependencies?.includes('demo-inspector') ?? false;

    // Get backend services - resolve from raw registry services
    const backendServiceNames = useMemo(
        () => resolveServiceNames(
            state.components?.backend,
            componentsData?.backends,
            componentsData?.services
        ),
        [state.components?.backend, componentsData?.backends, componentsData?.services]
    );

    // Derive component info using extracted helper
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
            <Heading level={2} marginBottom="size-200">
                {state.projectName}
            </Heading>

            <Divider size="S" marginBottom="size-200" />

            {/* Package/Stack Configuration Section */}
            {hasPackageStackContext && (
                <>
                    <Section title="PROJECT CONFIGURATION">
                        {packageName && <LabelValue label="Package" value={packageName} />}
                        {stackName && <LabelValue label="Architecture" value={stackName} />}
                    </Section>
                    <Divider size="S" marginBottom="size-200" />
                </>
            )}

            {/* Adobe I/O Section */}
            {hasAdobeContext && (
                <>
                    <Section title="ADOBE I/O">
                        {adobeOrgName && <LabelValue label="Organization" value={adobeOrgName} />}
                        {adobeProjectName && <LabelValue label="Project" value={adobeProjectName} />}
                        {adobeWorkspaceName && <LabelValue label="Workspace" value={adobeWorkspaceName} />}
                    </Section>
                    <Divider size="S" marginBottom="size-200" />
                </>
            )}

            {/* Components Section */}
            {componentInfo.length > 0 && (
                <Section title="COMPONENTS">
                    {componentInfo.map((item, index) => (
                        <LabelValue key={index} label={item.label} value={item.value} subItems={item.subItems} />
                    ))}
                </Section>
            )}
        </div>
    );
}
