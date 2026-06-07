/**
 * JoinStorefrontScreen — the content-SC "Join a shared storefront" UI.
 *
 * Paste a public master link → resolve on Continue (Backend-Call-on-Continue) →
 * confirmation preview → Join. Prop-driven (onResolve / onConfirm) so it is tested
 * without webview plumbing; the host wires onResolve to the resolveJoinLink service.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { JoinStorefrontScreen } from '@/features/project-creation/ui/join/JoinStorefrontScreen';
import type { ResolveJoinResult } from '@/features/project-creation/services/resolveJoinLink';

const okResult: ResolveJoinResult = {
    ok: true,
    descriptor: {
        upstream: { owner: 'commerce-sc', repo: 'citisignal-master' },
        packageId: 'citisignal',
        commerce: { endpoint: 'https://example.commerce/graphql', storeViewCode: 'citisignal_us' },
    },
};

const link = 'https://github.com/commerce-sc/citisignal-master';

function typeLink(value: string) {
    fireEvent.change(screen.getByRole('textbox'), { target: { value } });
}

describe('JoinStorefrontScreen', () => {
    it('renders the shared page-header chrome (title)', () => {
        render(<JoinStorefrontScreen onResolve={jest.fn()} onConfirm={jest.fn()} />);
        expect(screen.getByRole('heading', { name: /join a shared storefront/i })).toBeInTheDocument();
    });

    it('disables Continue until a link is entered', () => {
        render(<JoinStorefrontScreen onResolve={jest.fn()} onConfirm={jest.fn()} />);
        const continueBtn = screen.getByRole('button', { name: /continue/i });
        expect(continueBtn).toBeDisabled();
        typeLink(link);
        expect(continueBtn).not.toBeDisabled();
    });

    it('calls onResolve with the link on Continue', async () => {
        const onResolve = jest.fn().mockResolvedValue(okResult);
        render(<JoinStorefrontScreen onResolve={onResolve} onConfirm={jest.fn()} />);
        typeLink(link);
        fireEvent.click(screen.getByRole('button', { name: /continue/i }));
        await waitFor(() => expect(onResolve).toHaveBeenCalledWith(link));
    });

    it('shows a confirmation preview (brand + owner + endpoint) after a successful resolve', async () => {
        const onResolve = jest.fn().mockResolvedValue(okResult);
        render(<JoinStorefrontScreen onResolve={onResolve} onConfirm={jest.fn()} />);
        typeLink(link);
        fireEvent.click(screen.getByRole('button', { name: /continue/i }));

        // Facts render as label/value rows (SummaryCard + LabelValue)
        expect(await screen.findByText('citisignal')).toBeInTheDocument();        // Brand value
        expect(screen.getByText('commerce-sc/citisignal-master')).toBeInTheDocument(); // Shared by value
        expect(screen.getByText('https://example.commerce/graphql')).toBeInTheDocument(); // Backend value
        expect(screen.getByRole('button', { name: /^join/i })).toBeInTheDocument();
    });

    it('calls onConfirm with the descriptor when Join is clicked', async () => {
        const onConfirm = jest.fn();
        render(<JoinStorefrontScreen onResolve={jest.fn().mockResolvedValue(okResult)} onConfirm={onConfirm} />);
        typeLink(link);
        fireEvent.click(screen.getByRole('button', { name: /continue/i }));
        const joinBtn = await screen.findByRole('button', { name: /^join/i });
        fireEvent.click(joinBtn);
        expect(onConfirm).toHaveBeenCalledWith(okResult.descriptor);
    });

    it('shows the error and no Join button when resolve fails', async () => {
        const onResolve = jest.fn().mockResolvedValue({ ok: false, error: 'Not a shareable storefront.' });
        render(<JoinStorefrontScreen onResolve={onResolve} onConfirm={jest.fn()} />);
        typeLink(link);
        fireEvent.click(screen.getByRole('button', { name: /continue/i }));
        expect(await screen.findByText(/not a shareable storefront/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^join/i })).not.toBeInTheDocument();
    });
});
