import { Button, View, Heading, Text, ProgressCircle } from '@adobe/react-spectrum';
import React, { useState, useCallback } from 'react';
import { FormField } from '@/core/ui/components/forms/FormField';
import { PageHeader, PageFooter, SingleColumnLayout } from '@/core/ui/components/layout';
import type { JoinDescriptor, ResolveJoinResult } from '@/features/project-creation/services/resolveJoinLink';

export interface JoinStorefrontScreenProps {
    /** Resolve a pasted master link (host wires this to the resolveJoinLink service). */
    onResolve: (link: string) => Promise<ResolveJoinResult>;
    /** Called when the user confirms joining the previewed storefront. */
    onConfirm: (descriptor: JoinDescriptor) => void;
}

type Phase =
    | { status: 'idle' }
    | { status: 'resolving' }
    | { status: 'error'; error: string }
    | { status: 'resolved'; descriptor: JoinDescriptor };

/**
 * The content-SC "Join a shared storefront" screen.
 *
 * Backend-Call-on-Continue: pasting the link is UI-only; the resolve happens on
 * Continue with a loading indicator, then a confirmation preview before joining.
 * Uses the shared page chrome (PageHeader + SingleColumnLayout + PageFooter) so it
 * matches the other single-purpose webviews; the timeline lives in the seeded
 * Create wizard this screen launches, not here. Prop-driven so it is testable
 * without webview plumbing.
 */
export function JoinStorefrontScreen({ onResolve, onConfirm }: JoinStorefrontScreenProps): React.ReactElement {
    const [link, setLink] = useState('');
    const [phase, setPhase] = useState<Phase>({ status: 'idle' });

    // State-clearing: editing the link discards a prior resolve/error.
    const handleLinkChange = useCallback((value: string) => {
        setLink(value);
        setPhase(prev => (prev.status === 'idle' ? prev : { status: 'idle' }));
    }, []);

    const handleContinue = useCallback(async () => {
        setPhase({ status: 'resolving' });
        const result = await onResolve(link);
        setPhase(result.ok
            ? { status: 'resolved', descriptor: result.descriptor }
            : { status: 'error', error: result.error });
    }, [link, onResolve]);

    const canContinue = link.trim().length > 0 && phase.status !== 'resolving';

    const footerAction = phase.status === 'resolved'
        ? (
            <Button variant="accent" onPress={() => onConfirm(phase.descriptor)}>
                Join storefront
            </Button>
        )
        : (
            <Button variant="accent" onPress={handleContinue} isDisabled={!canContinue}>
                Continue
            </Button>
        );

    return (
        <View width="100%" height="100%">
            <div className="content-area">
                <PageHeader
                    title="Join a Shared Storefront"
                    subtitle="Set up your own storefront from a link a Commerce partner shared with you."
                />

                <div className="step-content-area">
                    <SingleColumnLayout maxWidth="640px" padding="size-400">
                        <FormField
                            fieldKey="joinLink"
                            label="Storefront link"
                            type="url"
                            value={link}
                            onChange={handleLinkChange}
                            placeholder="https://github.com/owner/repo"
                        />

                        {phase.status === 'resolving' && (
                            <ProgressCircle aria-label="Resolving storefront" isIndeterminate />
                        )}

                        {phase.status === 'error' && <Text>{phase.error}</Text>}

                        {phase.status === 'resolved' && (
                            <View marginTop="size-300">
                                <Heading level={3}>You&apos;re joining</Heading>
                                <Text>Brand: {phase.descriptor.packageId}</Text>
                                <Text>
                                    Shared by: {phase.descriptor.upstream.owner}/{phase.descriptor.upstream.repo}
                                </Text>
                                {phase.descriptor.commerce?.endpoint && (
                                    <Text>Backend: {phase.descriptor.commerce.endpoint}</Text>
                                )}
                                <Text>You&apos;ll author content in your own AEM / DA.live.</Text>
                            </View>
                        )}
                    </SingleColumnLayout>
                </div>

                <PageFooter rightContent={footerAction} />
            </div>
        </View>
    );
}
