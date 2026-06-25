/**
 * IntegrationsStep Component (R1 — group-paced Step 5)
 *
 * The Integrations group step. R1 lands it as a MINIMAL placeholder: it exists in
 * the flow and never blocks Continue. It is gated `requiresAdobeAuth`, so it
 * appears only when the project has an App Builder component (mesh today; any
 * App Builder component once R2 adds manual selection).
 *
 * R2 replaces this body with the tiled surface — a managed collection with a
 * typed Add (Mesh / App Builder App / Custom URL), per-item config modals, the
 * Adobe project + workspace folded into the first integration's setup, a per-tile
 * status model, and the Create gate. Until then this step is informational and
 * non-blocking; template-required meshes still flow through the stack's
 * dependencies and are provisioned at creation.
 *
 * @module features/project-creation/ui/steps/IntegrationsStep
 */

import { Content, Heading, Text, View } from '@adobe/react-spectrum';
import React, { useEffect } from 'react';
import type { BaseStepProps } from '@/types/wizard';

/**
 * The Integrations group step (R1 placeholder).
 *
 * @param props - Standard wizard step props
 * @returns A non-blocking explanatory panel
 */
export function IntegrationsStep({ setCanProceed }: BaseStepProps) {
    // Placeholder: nothing to validate yet, so Continue is always enabled.
    useEffect(() => {
        setCanProceed(true);
    }, [setCanProceed]);

    return (
        <div className="build-area-pad">
            <View
                backgroundColor="gray-75"
                borderWidth="thin"
                borderColor="gray-300"
                borderRadius="medium"
                padding="size-300"
            >
                <Heading level={3} marginTop="size-0">
                    Integrations
                </Heading>
                <Content>
                    <Text>
                        Integrations deployed with your project are set up here. Any integration
                        required by your selected template is provisioned automatically at creation.
                    </Text>
                </Content>
            </View>
        </div>
    );
}
