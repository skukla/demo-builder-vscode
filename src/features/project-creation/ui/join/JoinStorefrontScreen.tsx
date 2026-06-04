import { Button, View, Heading, Text, ProgressCircle } from '@adobe/react-spectrum';
import React, { useState, useCallback } from 'react';
import { FormField } from '@/core/ui/components/forms/FormField';
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
 * Prop-driven so it is testable without webview plumbing.
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

    return (
        <View>
            <Heading level={2}>Join a shared storefront</Heading>
            <Text>Paste the storefront link your Commerce partner shared with you.</Text>

            <FormField
                fieldKey="joinLink"
                label="Storefront link"
                type="url"
                value={link}
                onChange={handleLinkChange}
                placeholder="https://github.com/owner/repo"
            />

            <Button variant="cta" onPress={handleContinue} isDisabled={!canContinue}>
                Continue
            </Button>

            {phase.status === 'resolving' && (
                <ProgressCircle aria-label="Resolving storefront" isIndeterminate />
            )}

            {phase.status === 'error' && <Text>{phase.error}</Text>}

            {phase.status === 'resolved' && (
                <View>
                    <Heading level={3}>You&apos;re joining</Heading>
                    <Text>Brand: {phase.descriptor.packageId}</Text>
                    <Text>
                        Shared by: {phase.descriptor.upstream.owner}/{phase.descriptor.upstream.repo}
                    </Text>
                    {phase.descriptor.commerce?.endpoint && (
                        <Text>Backend: {phase.descriptor.commerce.endpoint}</Text>
                    )}
                    <Text>You&apos;ll author content in your own AEM / DA.live.</Text>
                    <Button variant="cta" onPress={() => onConfirm(phase.descriptor)}>
                        Join storefront
                    </Button>
                </View>
            )}
        </View>
    );
}
