import { render, screen } from '@testing-library/react';
import React from 'react';
import { WelcomeScreen } from '@/features/welcome/ui/WelcomeScreen';
import '@testing-library/jest-dom';

// Mock the webview-ui utilities and hooks
jest.mock('@/core/ui/hooks', () => ({
    useFocusTrap: jest.fn(() => ({ current: null })),
}));

// Mock the WebviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
    },
}));

jest.mock('@/core/ui/utils/classNames', () => ({
    cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
}));

describe('WelcomeScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render welcome heading', () => {
        render(<WelcomeScreen />);
        expect(screen.getByText('Adobe Demo Builder')).toBeInTheDocument();
    });

    it('should render subtitle text', () => {
        render(<WelcomeScreen />);
        expect(screen.getByText('Create and manage Adobe Commerce demo environments')).toBeInTheDocument();
    });

    it('should render Create New Project button', () => {
        render(<WelcomeScreen />);
        expect(screen.getByText('Create New Project')).toBeInTheDocument();
    });

    it('should render Open Existing Project button', () => {
        render(<WelcomeScreen />);
        expect(screen.getByText('Open Existing Project')).toBeInTheDocument();
    });

    it('should render Docs button', () => {
        render(<WelcomeScreen />);
        expect(screen.getByText('Docs')).toBeInTheDocument();
    });

    it('should render Settings button', () => {
        render(<WelcomeScreen />);
        expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should post ready message on mount', () => {
        const { webviewClient } = require('@/core/ui/utils/WebviewClient');
        render(<WelcomeScreen />);
        expect(webviewClient.postMessage).toHaveBeenCalledWith('ready');
    });

    it('should handle create new action', () => {
        const { webviewClient } = require('@/core/ui/utils/WebviewClient');
        render(<WelcomeScreen />);

        const createButton = screen.getByText('Create New Project');
        createButton.click();

        expect(webviewClient.postMessage).toHaveBeenCalledWith('create-new');
    });

    it('should handle open existing action', () => {
        const { webviewClient } = require('@/core/ui/utils/WebviewClient');
        render(<WelcomeScreen />);

        const openButton = screen.getByText('Open Existing Project');
        openButton.click();

        expect(webviewClient.postMessage).toHaveBeenCalledWith('open-project');
    });

    it('should handle open docs action', () => {
        const { webviewClient } = require('@/core/ui/utils/WebviewClient');
        render(<WelcomeScreen />);

        const docsButton = screen.getByText('Docs');
        docsButton.click();

        expect(webviewClient.postMessage).toHaveBeenCalledWith('open-docs');
    });

    it('should handle open settings action', () => {
        const { webviewClient } = require('@/core/ui/utils/WebviewClient');
        render(<WelcomeScreen />);

        const settingsButton = screen.getByText('Settings');
        settingsButton.click();

        expect(webviewClient.postMessage).toHaveBeenCalledWith('open-settings');
    });
});
