import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    ActionButton,
    DialogTrigger,
    Dialog,
    Heading,
    Content,
    Divider,
    Text,
    Flex,
    ButtonGroup,
    Button,
} from '@adobe/react-spectrum';
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';
import { FieldHelp, FieldHelpStep } from '@/types/webview';
import { getBaseUri } from '@/core/ui/utils/baseUri';

// Re-export types for convenience
export type { FieldHelp as FieldHelpContent, FieldHelpStep };

export interface FieldHelpButtonProps {
    /** Help content to display */
    help: FieldHelp;
    /** Display mode - modal (default) for screenshots/detailed help, popover for short text hints */
    variant?: 'modal' | 'popover';
    /** Field label for accessibility */
    fieldLabel: string;
    /** Base URI for resolving image paths */
    baseUri?: string;
}

/**
 * ImageZoom - Fullscreen image overlay
 *
 * Renders as a portal at document.body to escape modal stacking context.
 * Uses native DOM event listeners in capture phase to intercept events
 * before Spectrum's modal can handle them.
 */
function ImageZoom({
    src,
    alt,
    onClose
}: {
    src: string;
    alt: string;
    onClose: () => void;
}) {
    const overlayRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Handle Escape key - close zoom without closing modal
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                onClose();
            }
        };

        // Handle clicks - use capture phase to get event before Spectrum
        const handleClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            onClose();
        };

        // Handle pointer/mouse down - stop Spectrum from seeing it
        const handlePointerDown = (e: PointerEvent) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        };

        const handleMouseDown = (e: MouseEvent) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        };

        // Capture phase listeners intercept before bubbling
        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('click', handleClick, true);
        document.addEventListener('pointerdown', handlePointerDown, true);
        document.addEventListener('mousedown', handleMouseDown, true);

        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            document.removeEventListener('click', handleClick, true);
            document.removeEventListener('pointerdown', handlePointerDown, true);
            document.removeEventListener('mousedown', handleMouseDown, true);
        };
    }, [onClose]);

    return (
        <div
            ref={overlayRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                cursor: 'zoom-out',
                padding: '20px',
            }}
        >
            <img
                src={src}
                alt={alt}
                style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    borderRadius: '4px',
                    cursor: 'zoom-out',
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    color: 'white',
                    fontSize: '14px',
                    opacity: 0.7,
                }}
            >
                Press Escape or click to close
            </div>
        </div>
    );
}

/**
 * FieldHelpButton - Contextual help for form fields
 *
 * Displays an info icon that shows help content on click.
 * Supports two variants:
 * - **popover**: Lightweight floating card anchored to the icon
 * - **modal**: Full dialog for more prominent content
 *
 * Content can be:
 * - Simple text explanation
 * - Step-by-step instructions with optional screenshots per step
 * - Screenshots are clickable to zoom fullscreen
 */
export function FieldHelpButton({
    help,
    variant = 'modal',
    fieldLabel,
    baseUri,
}: FieldHelpButtonProps) {
    const [zoomedImage, setZoomedImage] = useState<{ src: string; alt: string } | null>(null);

    const hasContent = help.text || (help.steps && help.steps.length > 0);

    if (!hasContent) {
        return null;
    }

    // Use provided baseUri or fall back to global webview base URI
    const effectiveBaseUri = baseUri || getBaseUri();

    const resolveScreenshot = (screenshot?: string) => {
        if (!screenshot) return undefined;
        return effectiveBaseUri ? `${effectiveBaseUri}/media/${screenshot}` : screenshot;
    };

    // Render a single step with optional screenshot
    // Uses instruction-card styling consistent with NumberedInstructions component
    const renderStep = (step: FieldHelpStep, index: number, total: number) => {
        const screenshotSrc = resolveScreenshot(step.screenshot);
        const showStepNumber = total > 1;

        return (
            <Flex
                key={index}
                direction="row"
                gap="size-150"
                UNSAFE_className="instruction-card"
            >
                {/* Circular number badge */}
                {showStepNumber && (
                    <div className="number-badge">
                        {index + 1}
                    </div>
                )}

                {/* Content */}
                <Flex direction="column" gap="size-150" flex={1}>
                    <Text UNSAFE_className="instruction-title">
                        {step.text}
                    </Text>
                    {screenshotSrc && (
                        <img
                            src={screenshotSrc}
                            alt={step.screenshotAlt || `Step ${index + 1}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setZoomedImage({
                                    src: screenshotSrc,
                                    alt: step.screenshotAlt || `Step ${index + 1}`
                                });
                            }}
                            style={{
                                width: '100%',
                                borderRadius: '4px',
                                border: '1px solid var(--spectrum-global-color-gray-300)',
                                cursor: 'zoom-in',
                            }}
                        />
                    )}
                </Flex>
            </Flex>
        );
    };

    // Popover variant - lightweight floating card (text only, no steps)
    if (variant === 'popover') {
        return (
            <DialogTrigger type="popover">
                <ActionButton
                    isQuiet
                    aria-label={`Help for ${fieldLabel}`}
                    UNSAFE_className="field-help-button"
                >
                    <InfoOutline size="S" />
                </ActionButton>
                <Dialog>
                    <Content>
                        <Flex direction="column" gap="size-150" maxWidth="size-3600">
                            {help.text && (
                                <Text>{help.text}</Text>
                            )}
                            {help.steps && help.steps.map((step, i) =>
                                renderStep(step, i, help.steps!.length)
                            )}
                        </Flex>
                    </Content>
                </Dialog>
            </DialogTrigger>
        );
    }

    // Modal variant - full dialog
    return (
        <>
            {/* Portal renders zoom overlay at document root, outside modal hierarchy */}
            {zoomedImage && createPortal(
                <ImageZoom
                    src={zoomedImage.src}
                    alt={zoomedImage.alt}
                    onClose={() => setZoomedImage(null)}
                />,
                document.body
            )}
            <DialogTrigger type="modal">
                <ActionButton
                    isQuiet
                    aria-label={`Help for ${fieldLabel}`}
                    UNSAFE_className="field-help-button"
                >
                    <InfoOutline size="S" />
                </ActionButton>
                {(close) => (
                    <Dialog size="L">
                        <Heading>{help.title || `Help: ${fieldLabel}`}</Heading>
                        <Divider />
                        <Content>
                            <Flex direction="column" gap="size-200">
                                {help.text && (
                                    <Text>{help.text}</Text>
                                )}
                                {help.steps && help.steps.map((step, i) =>
                                    renderStep(step, i, help.steps!.length)
                                )}
                            </Flex>
                        </Content>
                        <ButtonGroup>
                            <Button variant="primary" onPress={close}>
                                Got it
                            </Button>
                        </ButtonGroup>
                    </Dialog>
                )}
            </DialogTrigger>
        </>
    );
}

FieldHelpButton.displayName = 'FieldHelpButton';
