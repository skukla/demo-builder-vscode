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
import { vscode } from '@/core/ui/utils/vscode-api';
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
            className="image-zoom-overlay"
        >
            <img
                src={src}
                alt={alt}
                className="image-zoom-image"
            />
            <div className="image-zoom-hint">
                Press Escape or click to close
            </div>
        </div>
    );
}

/**
 * Check if a string looks like a URL
 */
function isUrl(text: string): boolean {
    return text.startsWith('http://') || text.startsWith('https://');
}

/**
 * ClickableUrl - Opens URL in browser when clicked
 */
function ClickableUrl({ url }: { url: string }) {
    const handleClick = () => {
        vscode.postMessage('openExternal', { url });
    };

    return (
        <span
            onClick={handleClick}
            className="clickable-url"
            role="link"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    handleClick();
                }
            }}
        >
            {url}
        </span>
    );
}

/**
 * Parses text with backtick-wrapped segments into copyable or clickable components
 * - URLs (http://, https://) open in browser when clicked
 * - Other text is copyable on click
 * Example: "Go to `https://account.magento.com` and click" renders the URL as clickable
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
                // If the part starts and ends with backticks, it's interactive
                if (part.startsWith('`') && part.endsWith('`')) {
                    const content = part.slice(1, -1);
                    // URLs open in browser, other text is copyable
                    if (isUrl(content)) {
                        return <ClickableUrl key={i} url={content} />;
                    }
                    return <CopyableText key={i}>{content}</CopyableText>;
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
                <div className="min-h-48">
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
                        className="screenshot-thumbnail"
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
                                    <Text UNSAFE_className="step-counter">
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
                                <div className="flex-1" />
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
                                <div className="flex-end-container">
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
