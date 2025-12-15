import { Heading, Flex, Divider } from '@adobe/react-spectrum';
import React from 'react';

export interface ConfigSectionProps {
    /** Section ID */
    id: string;
    /** Section label */
    label: string;
    /** Section content (form fields) */
    children: React.ReactNode;
    /** Whether to show divider before section */
    showDivider?: boolean;
}

/**
 * Molecular Component: ConfigSection
 *
 * Configuration section wrapper with heading and divider. Groups related
 * form fields together in ConfigureScreen.
 *
 * @example
 * ```tsx
 * <ConfigSection id="adobe-commerce" label="Adobe Commerce" showDivider>
 *   <FormField ... />
 *   <FormField ... />
 * </ConfigSection>
 * ```
 */
export const ConfigSection = React.memo<ConfigSectionProps>(({
    id,
    label,
    children,
    showDivider = false,
}) => {
    return (
        <>
            {showDivider && (
                <Divider
                    size="S"
                    marginTop="size-100"
                    marginBottom="size-100"
                />
            )}

            <div
                id={`section-${id}`}
                className={showDivider ? 'config-section-with-padding' : 'config-section'}
            >
                <div className="config-section-header">
                    <Heading level={3}>{label}</Heading>
                </div>

                <Flex direction="column" marginBottom="size-100">
                    {children}
                </Flex>
            </div>
        </>
    );
});

ConfigSection.displayName = 'ConfigSection';
