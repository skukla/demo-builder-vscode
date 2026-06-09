/**
 * Join Storefront Webview Entry Point
 *
 * Renders the JoinStorefrontScreen and wires it to the extension:
 * - onResolve → request 'resolve-join' (unauthenticated public read → JoinDescriptor)
 * - onConfirm → postMessage 'join-confirm' (seeded wizard launch wired in a follow-up)
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { JoinStorefrontScreen } from './JoinStorefrontScreen';
import { WebviewApp } from '@/core/ui/components/WebviewApp';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { ResolveJoinResult, JoinDescriptor } from '@/features/project-creation/services/resolveJoinLink';

// Global styles
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/custom-spectrum.css';

const JoinApp: React.FC = () => {
    const onResolve = async (link: string): Promise<ResolveJoinResult> => {
        const res = await webviewClient.request<{ success: boolean; data?: ResolveJoinResult }>('resolve-join', { link });
        return res?.data ?? { ok: false, error: 'Could not reach the extension. Please try again.' };
    };

    const onConfirm = (descriptor: JoinDescriptor): void => {
        webviewClient.postMessage('join-confirm', { descriptor });
    };

    return <JoinStorefrontScreen onResolve={onResolve} onConfirm={onConfirm} />;
};

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}
createRoot(container).render(
    <WebviewApp>
        <JoinApp />
    </WebviewApp>,
);
