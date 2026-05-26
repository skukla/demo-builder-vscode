/**
 * descriptionRenderer Tests
 *
 * Covers the shared description-rendering util that powers both field
 * descriptions and FieldHelpButton step text:
 * - URL template substitution (e.g. {orgCode})
 * - Backtick-wrapped URLs render as clickable links that open externally
 * - Backtick-wrapped non-URL text renders as copyable
 * - Plain text passes through unchanged
 * - URLs whose templates cannot be resolved degrade to plain text
 */
import React from 'react';
import { renderWithProviders, screen, fireEvent } from '../../../../helpers/react-test-utils';
import {
    resolveExternalUrl,
    renderTextWithCopyable,
} from '@/core/ui/components/forms/descriptionRenderer';

const mockPostMessage = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        postMessage: (...args: unknown[]) => mockPostMessage(...args),
        request: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
    },
}));

describe('descriptionRenderer', () => {
    beforeEach(() => {
        mockPostMessage.mockClear();
    });

    describe('resolveExternalUrl', () => {
        it('substitutes {orgCode} placeholder when context provides it', () => {
            const result = resolveExternalUrl(
                'https://experience.adobe.com/#/@{orgCode}/commerce/cloud-service/instances',
                { orgCode: 'demosystem' },
            );
            expect(result).toBe(
                'https://experience.adobe.com/#/@demosystem/commerce/cloud-service/instances',
            );
        });

        it('returns null when {orgCode} is required but context is missing', () => {
            const result = resolveExternalUrl(
                'https://experience.adobe.com/#/@{orgCode}/commerce/cloud-service/instances',
                {},
            );
            expect(result).toBeNull();
        });

        it('returns null when {orgCode} context value is undefined', () => {
            const result = resolveExternalUrl(
                'https://experience.adobe.com/#/@{orgCode}/commerce/cloud-service/instances',
                { orgCode: undefined },
            );
            expect(result).toBeNull();
        });

        it('returns null when {orgCode} context value is empty string', () => {
            const result = resolveExternalUrl(
                'https://experience.adobe.com/#/@{orgCode}/commerce/cloud-service/instances',
                { orgCode: '' },
            );
            expect(result).toBeNull();
        });

        it('returns null when an unknown placeholder remains unresolved', () => {
            const result = resolveExternalUrl(
                'https://example.com/{unknownToken}/path',
                { orgCode: 'demosystem' },
            );
            expect(result).toBeNull();
        });

        it('returns the URL unchanged when template has no placeholders', () => {
            const result = resolveExternalUrl(
                'https://example.com/static/path',
                { orgCode: 'demosystem' },
            );
            expect(result).toBe('https://example.com/static/path');
        });
    });

    describe('renderTextWithCopyable', () => {
        it('renders plain text unchanged when there are no backticks', () => {
            renderWithProviders(<>{renderTextWithCopyable('Plain description text.')}</>);
            expect(screen.getByText('Plain description text.')).toBeInTheDocument();
        });

        it('renders a backtick-wrapped URL as a clickable link', () => {
            renderWithProviders(
                <>{renderTextWithCopyable('Find it at `https://example.com/page`.')}</>,
            );
            expect(screen.getByRole('link', { name: /https:\/\/example\.com\/page/ }))
                .toBeInTheDocument();
        });

        it('clicking the rendered URL posts openExternal with the resolved URL', () => {
            renderWithProviders(
                <>{renderTextWithCopyable('Find it at `https://example.com/page`.')}</>,
            );
            const link = screen.getByRole('link', { name: /https:\/\/example\.com\/page/ });
            fireEvent.click(link);
            expect(mockPostMessage).toHaveBeenCalledWith('openExternal', {
                url: 'https://example.com/page',
            });
        });

        it('substitutes {orgCode} inside a backtick-wrapped URL using provided context', () => {
            renderWithProviders(
                <>
                    {renderTextWithCopyable(
                        'Find it at `https://experience.adobe.com/#/@{orgCode}/commerce/cloud-service/instances`.',
                        { orgCode: 'demosystem' },
                    )}
                </>,
            );
            const link = screen.getByRole('link', {
                name: /experience\.adobe\.com\/#\/@demosystem\/commerce\/cloud-service\/instances/,
            });
            fireEvent.click(link);
            expect(mockPostMessage).toHaveBeenCalledWith('openExternal', {
                url: 'https://experience.adobe.com/#/@demosystem/commerce/cloud-service/instances',
            });
        });

        it('renders the unresolved URL template as plain text (not a broken link) when context is missing', () => {
            renderWithProviders(
                <>
                    {renderTextWithCopyable(
                        'Find it at `https://experience.adobe.com/#/@{orgCode}/commerce`.',
                    )}
                </>,
            );
            // No clickable link should appear when the placeholder cannot be resolved.
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });
    });
});
