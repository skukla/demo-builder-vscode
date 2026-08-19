/**
 * Unit Tests: DaLiveServiceCard — clipboard offer
 *
 * The bookmarklet copies the token, so when the extension can see one on the
 * clipboard the card offers a click instead of a paste. The token itself never
 * reaches this component — only a boolean does, and the namespace goes back.
 *
 * Coverage:
 * - Clipboard offer replaces the paste field
 * - The namespace, and only the namespace, is handed back
 * - "Paste manually" restores the field and stays restored
 * - No offer when the extension reports nothing on the clipboard
 */

import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TestWrapper } from './DaLiveServiceCard.testUtils';

describe('DaLiveServiceCard — clipboard offer', () => {
    let props: Record<string, unknown>;

    beforeEach(() => {
        jest.clearAllMocks();
        props = {
            isChecking: false,
            isAuthenticating: false,
            isAuthenticated: false,
            showInput: true,
            githubUser: 'skukla',
            onSetup: jest.fn(),
            onSubmit: jest.fn(),
            onReset: jest.fn(),
            onCancelInput: jest.fn(),
            onUseClipboardToken: jest.fn(),
        };
    });

    async function renderCard(overrides: Record<string, unknown> = {}) {
        const { DaLiveServiceCard } = await import(
            '@/features/eds/ui/components/DaLiveServiceCard'
        );
        return render(
            <TestWrapper>
                { }
                <DaLiveServiceCard {...({ ...props, ...overrides } as any)} />
            </TestWrapper>
        );
    }

    it('should offer the clipboard instead of a paste field', async () => {
        await renderCard({ clipboardHasToken: true });

        expect(screen.getByText(/ready on your clipboard/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /use token from clipboard/i })).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Token')).not.toBeInTheDocument();
    });

    it('should hand back the namespace and nothing else', async () => {
        await renderCard({ clipboardHasToken: true });

        fireEvent.click(screen.getByRole('button', { name: /use token from clipboard/i }));

        expect(props.onUseClipboardToken).toHaveBeenCalledTimes(1);
        expect(props.onUseClipboardToken).toHaveBeenCalledWith('skukla');
    });

    it('should never call onSubmit from the clipboard path', async () => {
        // onSubmit is the route that carries a token value; the clipboard path
        // must not touch it.
        await renderCard({ clipboardHasToken: true });

        fireEvent.click(screen.getByRole('button', { name: /use token from clipboard/i }));

        expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it('should show the paste field when the clipboard holds nothing', async () => {
        await renderCard({ clipboardHasToken: false });

        expect(screen.getByPlaceholderText('Token')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /use token from clipboard/i })
        ).not.toBeInTheDocument();
    });

    it('should fall back to the field when no clipboard handler is wired', async () => {
        // Defensive: a consumer that passes clipboardHasToken but no handler
        // must still get a usable form rather than a dead button.
        await renderCard({ clipboardHasToken: true, onUseClipboardToken: undefined });

        expect(screen.getByPlaceholderText('Token')).toBeInTheDocument();
    });

    it('should restore the paste field on "Paste manually"', async () => {
        await renderCard({ clipboardHasToken: true });

        fireEvent.click(screen.getByRole('button', { name: /paste manually/i }));

        expect(screen.getByPlaceholderText('Token')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /use token from clipboard/i })
        ).not.toBeInTheDocument();
    });

    it('should keep the field once chosen, so it cannot vanish mid-type', async () => {
        const { rerender } = await renderCard({ clipboardHasToken: true });
        fireEvent.click(screen.getByRole('button', { name: /paste manually/i }));

        const { DaLiveServiceCard } = await import(
            '@/features/eds/ui/components/DaLiveServiceCard'
        );
        rerender(
            <TestWrapper>
                { }
                <DaLiveServiceCard {...({ ...props, clipboardHasToken: true } as any)} />
            </TestWrapper>
        );

        expect(screen.getByPlaceholderText('Token')).toBeInTheDocument();
    });
});
