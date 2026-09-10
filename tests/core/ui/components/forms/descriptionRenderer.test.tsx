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

/** getByText normalizes whitespace by default; these assertions need it verbatim. */
const exact = (text: string) => text;

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

        it('rejects a substituted value that smuggles in another placeholder', () => {
            // The leftover-placeholder check runs AFTER substitution, so this is
            // the only way to reach it: every token the template itself declares
            // has already been resolved or refused above.
            const result = resolveExternalUrl(
                'https://example.com/{orgCode}/instances',
                { orgCode: '{nested}' },
            );
            expect(result).toBeNull();
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

        it('returns the raw string, not a fragment, when there is nothing to interpolate', () => {
            // Callers hand this straight to Spectrum's `description` prop, which
            // treats a string and an element differently.
            expect(renderTextWithCopyable('Plain description text.')).toBe(
                'Plain description text.',
            );
        });

        it('a backtick-wrapped non-URL renders as copyable text, not a link', () => {
            const { container } = renderWithProviders(
                <>{renderTextWithCopyable('Set `MESH_ENDPOINT` before you start.')}</>,
            );

            const copyable = container.querySelector('code.copyable-text');
            expect(copyable).toBeInTheDocument();
            expect(copyable!.textContent).toContain('MESH_ENDPOINT');
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });

        it('an http:// URL is a link too, not only https://', () => {
            renderWithProviders(<>{renderTextWithCopyable('Try `http://localhost:3000`.')}</>);
            expect(screen.getByRole('link', { name: 'http://localhost:3000' }))
                .toBeInTheDocument();
        });

        it('the plain segments around a backticked one render as themselves', () => {
            renderWithProviders(
                <>{renderTextWithCopyable('Set `MESH_ENDPOINT` before you start.')}</>,
            );
            // `exact` keeps the leading/trailing spaces, which is the point:
            // a mangled segment loses a character off each end.
            expect(screen.getByText('Set ', { normalizer: exact })).toBeInTheDocument();
            expect(screen.getByText(' before you start.', { normalizer: exact }))
                .toBeInTheDocument();
        });

        it('a stray trailing backtick stays literal text', () => {
            // The segment ENDS with a backtick and does not open with one. It is
            // not a wrapped segment and must not be sliced as though it were.
            renderWithProviders(<>{renderTextWithCopyable('Use `code` and a stray `')}</>);
            expect(screen.getByText(' and a stray `', { normalizer: exact }))
                .toBeInTheDocument();
        });

        it('a segment that opens with a backtick and never closes stays literal text', () => {
            // Degenerate but reachable: a run of backticks splits into a trailing
            // segment that opens one and closes nothing.
            renderWithProviders(<>{renderTextWithCopyable('```a``a')}</>);
            expect(screen.getByText('`a')).toBeInTheDocument();
        });
    });

    describe('ClickableUrl — keyboard', () => {
        function renderLink() {
            renderWithProviders(<>{renderTextWithCopyable('Go to `https://example.com/page`.')}</>);
            return screen.getByRole('link', { name: 'https://example.com/page' });
        }

        it.each([['Enter'], [' ']])('%s opens the URL externally', (key) => {
            fireEvent.keyDown(renderLink(), { key });
            expect(mockPostMessage).toHaveBeenCalledWith('openExternal', {
                url: 'https://example.com/page',
            });
        });

        it('any other key does nothing', () => {
            fireEvent.keyDown(renderLink(), { key: 'a' });
            expect(mockPostMessage).not.toHaveBeenCalled();
        });
    });
});
