/**
 * DaLiveSetupStep
 *
 * Authentication step for DA.live using a bookmarklet-based token extraction flow.
 * Since DA.live OAuth (darkalley) only redirects to da.live domain, we use a
 * bookmarklet approach where users:
 * 1. Click "Sign In" → Opens da.live in browser
 * 2. Log in to DA.live (if needed)
 * 3. Run bookmarklet → Copies token to clipboard
 * 4. Paste token in VS Code → Token validated and stored
 */

import React, { useState } from 'react';
import { Text, TextField, Flex, DialogContainer } from '@adobe/react-spectrum';
import Login from '@spectrum-icons/workflow/Login';
import Refresh from '@spectrum-icons/workflow/Refresh';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { Modal } from '@/core/ui/components/ui/Modal';
import { useCanProceed } from '@/core/ui/hooks';
import { vscode } from '@/core/ui/utils/vscode-api';
import { useDaLiveAuth } from '../hooks/useDaLiveAuth';
import type { BaseStepProps } from '@/types/wizard';

// Bookmarklet code for easy token extraction from DA.live
// Uses window.adobeIMS which DA.live exposes after login
// Styled to match Adobe Spectrum dark theme
const BOOKMARKLET_CODE = `javascript:(function(){var t=window.adobeIMS&&window.adobeIMS.getAccessToken();if(t&&t.token){var m=document.createElement("div");m.id="da-tkn";m.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:adobe-clean,Source Sans Pro,system-ui,sans-serif";m.innerHTML='<div style="background:%23252525;padding:40px;border-radius:8px;text-align:center;color:%23fff;border:1px solid %23383838;max-width:400px"><h2 style="color:%23fff;margin:0 0 8px;font-size:22px;font-weight:600">Token Ready</h2><p style="color:%23b3b3b3;margin:0 0 24px;font-size:14px">Click to copy, then paste in VS Code</p><button id="da-cp" style="background:%230d66d0;color:%23fff;border:none;padding:10px 24px;border-radius:4px;cursor:pointer;font-weight:600;font-size:14px;transition:background .15s">Copy Token</button></div>';document.body.appendChild(m);var btn=document.getElementById("da-cp");btn.onmouseover=function(){this.style.background="%23095aba"};btn.onmouseout=function(){this.style.background="%230d66d0"};btn.onclick=function(){navigator.clipboard.writeText(t.token).then(function(){btn.textContent="Copied!";btn.style.background="%232d9d78";setTimeout(function(){m.remove()},800)})};m.onclick=function(e){if(e.target===m)m.remove()}}else{var m=document.createElement("div");m.id="da-tkn";m.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:adobe-clean,Source Sans Pro,system-ui,sans-serif";m.innerHTML='<div style="background:%23252525;padding:40px;border-radius:8px;text-align:center;color:%23fff;border:1px solid %23383838;max-width:360px"><h2 style="color:%23e34850;margin:0 0 8px;font-size:22px;font-weight:600">Not Logged In</h2><p style="color:%23b3b3b3;margin:0 0 24px;font-size:14px">Please log in to DA.live first, then try again.</p><button id="da-cl" style="background:%23383838;color:%23fff;border:none;padding:10px 24px;border-radius:4px;cursor:pointer;font-weight:600;font-size:14px">Close</button></div>';document.body.appendChild(m);document.getElementById("da-cl").onclick=function(){m.remove()};m.onclick=function(e){if(e.target===m)m.remove()}}})();`;

// Generate a data URL for the bookmarklet setup page (opens in browser)
// Styled to match Adobe Spectrum dark theme used in the extension
const getBookmarkletSetupPageUrl = () => {
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>DA.live Token Helper</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: adobe-clean, 'Source Sans Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1e1e1e;
            color: #fff;
            min-height: 100vh;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: #252525;
            border-radius: 8px;
            padding: 40px;
            max-width: 480px;
            text-align: center;
            border: 1px solid #383838;
        }
        h1 { margin: 0 0 8px; font-size: 22px; font-weight: 600; }
        .subtitle { color: #b3b3b3; margin-bottom: 28px; font-size: 14px; }
        .step {
            background: #1e1e1e;
            border-radius: 6px;
            padding: 20px;
            margin: 12px 0;
            text-align: left;
            border: 1px solid #383838;
        }
        .step-number {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            background: #0d66d0;
            border-radius: 50%;
            font-size: 13px;
            font-weight: 600;
            margin-right: 12px;
            flex-shrink: 0;
        }
        .step-header { display: flex; align-items: center; }
        .step-title { font-weight: 600; font-size: 14px; }
        .step-desc { color: #b3b3b3; margin-top: 8px; margin-left: 36px; font-size: 13px; line-height: 1.5; }
        .bookmarklet {
            display: inline-block;
            padding: 10px 20px;
            background: #0d66d0;
            color: white !important;
            border-radius: 4px;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            cursor: grab;
            margin: 12px 0 0;
            transition: background 0.15s;
        }
        .bookmarklet:hover { background: #095aba; }
        .bookmarklet:active { cursor: grabbing; background: #0850a0; }
        .arrow { font-size: 18px; margin: 8px 0; color: #5c5c5c; }
        .action-btn {
            display: inline-block;
            padding: 8px 16px;
            background: #2d9d78;
            color: white;
            border-radius: 4px;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            transition: background 0.15s;
        }
        .action-btn:hover { background: #268e6c; }
        .skip-link { margin-top: 24px; font-size: 16px; }
        .skip-link a { color: #b3b3b3; text-decoration: none; }
        .skip-link a:hover { color: #fff; text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <h1>DA.live Token Helper</h1>
        <p class="subtitle">One-time setup to get your authentication token</p>

        <div class="step">
            <div class="step-header">
                <span class="step-number">1</span>
                <span class="step-title">Drag this button to your bookmarks bar</span>
            </div>
            <div class="step-desc">
                <a class="bookmarklet" href="${BOOKMARKLET_CODE.replace(/"/g, '&quot;')}">Get DA.live Token</a>
            </div>
        </div>

        <div class="arrow">↓</div>

        <div class="step">
            <div class="step-header">
                <span class="step-number">2</span>
                <span class="step-title">Go to DA.live and click the bookmarklet</span>
            </div>
            <div class="step-desc">
                It will show a popup with a "Copy Token" button
                <div style="margin-top: 12px;">
                    <a href="https://da.live" class="action-btn">Go to DA.live →</a>
                </div>
            </div>
        </div>

        <div class="arrow">↓</div>

        <div class="step">
            <div class="step-header">
                <span class="step-number">3</span>
                <span class="step-title">Return to VS Code and paste the token</span>
            </div>
            <div class="step-desc">The token is now on your clipboard</div>
        </div>

        <p class="skip-link">
            <a href="https://da.live">Already have the bookmarklet? Go to DA.live →</a>
        </p>
    </div>
</body>
</html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
};

/**
 * DaLiveSetupStep Component
 *
 * Bookmarklet-based authentication for DA.live
 */
export function DaLiveSetupStep({
    state,
    updateState,
    setCanProceed,
}: BaseStepProps): React.ReactElement {
    const {
        isAuthenticated,
        isAuthenticating,
        error: authError,
        setupComplete,
        openDaLive,
        storeToken,
    } = useDaLiveAuth({ state, updateState });

    // Token input state (for paste flow)
    const [tokenInput, setTokenInput] = useState('');
    const [showTokenInput, setShowTokenInput] = useState(false);

    // Update canProceed based on authentication status
    useCanProceed(isAuthenticated, setCanProceed);

    // Handle sign in button - open setup page (first time) or da.live directly (returning user)
    const handleSignIn = () => {
        if (setupComplete) {
            // User has completed setup before, go directly to da.live
            vscode.postMessage('openExternal', { url: 'https://da.live' });
        } else {
            // First time - show the bookmarklet setup page
            vscode.postMessage('openExternal', { url: getBookmarkletSetupPageUrl() });
        }
        setShowTokenInput(true);
    };

    // Handle token submission
    const handleSubmitToken = () => {
        if (tokenInput.trim()) {
            storeToken(tokenInput.trim());
            setTokenInput('');
        }
    };

    // Close the modal
    const handleCloseModal = () => {
        setShowTokenInput(false);
        setTokenInput('');
    };

    // Step description (header removed - timeline shows step name)
    const stepDescription = (
        <Text marginBottom="size-300">
            Connect to DA.live to manage content for Edge Delivery Services.
        </Text>
    );

    // Loading state - checking auth
    if (isAuthenticating && !showTokenInput) {
        return (
            <SingleColumnLayout>
                {stepDescription}
                <CenteredFeedbackContainer>
                    <LoadingDisplay
                        size="L"
                        message="Checking DA.live authentication..."
                        subMessage="Verifying your access"
                    />
                </CenteredFeedbackContainer>
            </SingleColumnLayout>
        );
    }

    // Error state
    if (authError && !isAuthenticated && !showTokenInput) {
        return (
            <SingleColumnLayout>
                {stepDescription}
                <CenteredFeedbackContainer>
                    <StatusDisplay
                        variant="error"
                        title="Connection Failed"
                        message={authError}
                        actions={[
                            { label: 'Try Again', icon: <Refresh size="S" />, variant: 'accent', onPress: handleSignIn },
                        ]}
                    />
                </CenteredFeedbackContainer>
            </SingleColumnLayout>
        );
    }

    // Connected state
    if (isAuthenticated) {
        return (
            <SingleColumnLayout>
                {stepDescription}
                <CenteredFeedbackContainer>
                    <StatusDisplay
                        variant="success"
                        title="Connected to DA.live"
                        message="You can proceed to configure your content source."
                        actions={[
                            { label: 'Reconnect', variant: 'secondary', onPress: handleSignIn },
                        ]}
                    />
                </CenteredFeedbackContainer>
            </SingleColumnLayout>
        );
    }

    // Not authenticated - show sign in prompt with modal
    return (
        <SingleColumnLayout>
            {stepDescription}
            <CenteredFeedbackContainer>
                <StatusDisplay
                    variant="info"
                    title="Sign in to DA.live"
                    message="Connect your Adobe account to access DA.live content management."
                    centerMessage
                    maxWidth="450px"
                    actions={[
                        { label: 'Sign In to DA.live', icon: <Login size="S" />, variant: 'accent', onPress: handleSignIn },
                    ]}
                />
            </CenteredFeedbackContainer>

            {/* Token paste modal */}
            <DialogContainer onDismiss={handleCloseModal}>
                {showTokenInput && (
                    <Modal
                        title="Paste DA.live Token"
                        size="S"
                        onClose={handleCloseModal}
                        actionButtons={[
                            {
                                label: 'Verify Token',
                                variant: 'accent',
                                onPress: () => {
                                    handleSubmitToken();
                                    if (tokenInput.trim()) {
                                        handleCloseModal();
                                    }
                                },
                            },
                        ]}
                    >
                        <Flex direction="column" gap="size-200">
                            <Text>
                                Follow the steps in your browser, then paste your token here.
                            </Text>

                            <TextField
                                label="DA.live Token"
                                value={tokenInput}
                                onChange={setTokenInput}
                                type="password"
                                width="100%"
                                placeholder="Paste your token here..."
                                autoFocus
                            />

                            {authError && (
                                <Text UNSAFE_className="text-red-600 text-sm">
                                    {authError}
                                </Text>
                            )}
                        </Flex>
                    </Modal>
                )}
            </DialogContainer>
        </SingleColumnLayout>
    );
}
