import {
    ActionButton,
    DialogTrigger,
    Dialog,
    Heading,
    Content,
    Divider,
    Text,
    Flex,
    Button,
    Footer,
} from '@adobe/react-spectrum';
import ChevronLeft from '@spectrum-icons/workflow/ChevronLeft';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CopyableText } from '@/core/ui/components/ui/CopyableText';
import { getBaseUri } from '@/core/ui/utils/baseUri';
import { FieldHelp, FieldHelpStep } from '@/types/webview';

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
    onClose,
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
 * Parses text with backtick-wrapped segments into copyable components
 * Example: "Go to `account.magento.com` and click" renders the URL as copyable
 */
function renderTextWithCopyable(text: string): React.ReactNode {
    // Split by backticks to find copyable segments
    const parts = text.split(/(`[^`]+`)/g);

    if (parts.length === 1) {
        // No backticks found, return plain text
        return text;
    }

    return (
        <>
            {parts.map((part, i) => {
                // If the part starts and ends with backticks, it's copyable
                if (part.startsWith('`') && part.endsWith('`')) {
                    const copyText = part.slice(1, -1);
                    return <CopyableText key={i}>{copyText}</CopyableText>;
                }
                return <span key={i}>{part}</span>;
            })}
        </>
    );
}

/**
 * StepContent - Renders a single step with optional screenshot
 */
function StepContent({
    step,
    index,
    total,
    onImageClick,
    resolveScreenshot,
}: {
    step: FieldHelpStep;
    index: number;
    total: number;
    onImageClick: (src: string, alt: string) => void;
    resolveScreenshot: (screenshot?: string) => string | undefined;
}) {
    const screenshotSrc = resolveScreenshot(step.screenshot);
    const showStepNumber = total > 1;

    return (
        <Flex
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
                {/* Fixed height for text prevents layout shift between steps */}
                <div style={{ minHeight: '48px' }}>
                    <Text UNSAFE_className="instruction-title">
                        {renderTextWithCopyable(step.text)}
                    </Text>
                </div>
                {screenshotSrc && (
                    <img
                        src={screenshotSrc}
                        alt={step.screenshotAlt || `Step ${index + 1}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onImageClick(screenshotSrc, step.screenshotAlt || `Step ${index + 1}`);
                        }}
                        style={{
                            width: '100%',
                            maxHeight: '380px',
                            objectFit: 'contain',
                            borderRadius: '4px',
                            border: '1px solid var(--spectrum-global-color-gray-300)',
                            cursor: 'zoom-in',
                        }}
                    />
                )}
            </Flex>
        </Flex>
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
 * - Multi-step content uses Previous/Next navigation
 * - Screenshots are clickable to zoom fullscreen
 */
export function FieldHelpButton({
    help,
    variant = 'modal',
    fieldLabel,
    baseUri,
}: FieldHelpButtonProps) {
    const [zoomedImage, setZoomedImage] = useState<{ src: string; alt: string } | null>(null);
    const [currentStep, setCurrentStep] = useState(0);

    const hasContent = help.text || (help.steps && help.steps.length > 0);
    const totalSteps = help.steps?.length || 0;
    const hasMultipleSteps = totalSteps > 1;

    if (!hasContent) {
        return null;
    }

    // Use provided baseUri or fall back to global webview base URI
    const effectiveBaseUri = baseUri || getBaseUri();

    const resolveScreenshot = (screenshot?: string) => {
        if (!screenshot) return undefined;
        return effectiveBaseUri ? `${effectiveBaseUri}/media/${screenshot}` : screenshot;
    };

    const handleImageClick = (src: string, alt: string) => {
        setZoomedImage({ src, alt });
    };

    const goToPrevious = () => {
        setCurrentStep((prev) => Math.max(0, prev - 1));
    };

    const goToNext = () => {
        setCurrentStep((prev) => Math.min(totalSteps - 1, prev + 1));
    };

    // Reset to first step when dialog opens
    const handleDialogOpen = () => {
        setCurrentStep(0);
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
                            {help.steps && help.steps.map((step, i) => (
                                <StepContent
                                    key={i}
                                    step={step}
                                    index={i}
                                    total={help.steps!.length}
                                    onImageClick={handleImageClick}
                                    resolveScreenshot={resolveScreenshot}
                                />
                            ))}
                        </Flex>
                    </Content>
                </Dialog>
            </DialogTrigger>
        );
    }

    // Modal variant - full dialog with step navigation
    return (
        <>
            {/* Portal renders zoom overlay at document root, outside modal hierarchy */}
            {zoomedImage && createPortal(
                <ImageZoom
                    src={zoomedImage.src}
                    alt={zoomedImage.alt}
                    onClose={() => setZoomedImage(null)}
                />,
                document.body,
            )}
            <DialogTrigger type="modal" onOpenChange={(isOpen) => isOpen && handleDialogOpen()}>
                <ActionButton
                    isQuiet
                    aria-label={`Help for ${fieldLabel}`}
                    UNSAFE_className="field-help-button"
                >
                    <InfoOutline size="S" />
                </ActionButton>
                {(close) => (
                    <Dialog size="L" UNSAFE_className="field-help-dialog">
                        <Heading>
                            <Flex justifyContent="space-between" alignItems="center" width="100%">
                                <Text>{help.title || `Help: ${fieldLabel}`}</Text>
                                {hasMultipleSteps && (
                                    <Text UNSAFE_style={{ fontSize: '13px', fontWeight: 'normal', color: 'var(--spectrum-global-color-gray-500)' }}>
                                        Step {currentStep + 1} of {totalSteps}
                                    </Text>
                                )}
                            </Flex>
                        </Heading>
                        <Divider />
                        <Content>
                            <Flex direction="column" gap="size-200">
                                {help.text && (
                                    <Text>{help.text}</Text>
                                )}
                                {help.steps && help.steps.length > 0 && (
                                    <StepContent
                                        step={help.steps[currentStep]}
                                        index={currentStep}
                                        total={totalSteps}
                                        onImageClick={handleImageClick}
                                        resolveScreenshot={resolveScreenshot}
                                    />
                                )}
                            </Flex>
                        </Content>
                        <Footer>
                            <Flex width="100%" justifyContent="space-between" alignItems="center">
                                {/* Left spacer for centering */}
                                <div style={{ flex: 1 }} />
                                {/* Navigation buttons - centered */}
                                {hasMultipleSteps ? (
                                    <Flex gap="size-100">
                                        <Button
                                            variant="secondary"
                                            onPress={goToPrevious}
                                            isDisabled={currentStep === 0}
                                        >
                                            <ChevronLeft />
                                            <Text>Previous</Text>
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            onPress={goToNext}
                                            isDisabled={currentStep === totalSteps - 1}
                                        >
                                            <Text>Next</Text>
                                            <ChevronRight />
                                        </Button>
                                    </Flex>
                                ) : (
                                    <div />
                                )}
                                {/* Accent button - right aligned */}
                                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button variant="accent" onPress={close}>
                                        {hasMultipleSteps && currentStep === totalSteps - 1 ? 'Done' : 'Got it'}
                                    </Button>
                                </div>
                            </Flex>
                        </Footer>
                    </Dialog>
                )}
            </DialogTrigger>
        </>
    );
}

FieldHelpButton.displayName = 'FieldHelpButton';
