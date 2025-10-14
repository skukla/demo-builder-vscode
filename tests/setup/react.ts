import '@testing-library/jest-dom';

// Mock VS Code API for webviews
const mockVSCodeApi = {
    postMessage: jest.fn(),
    setState: jest.fn(),
    getState: jest.fn(() => null),
};

// Mock acquireVsCodeApi global function
(global as any).acquireVsCodeApi = jest.fn(() => mockVSCodeApi);

// Reset mocks before each test
beforeEach(() => {
    mockVSCodeApi.postMessage.mockClear();
    mockVSCodeApi.setState.mockClear();
    mockVSCodeApi.getState.mockClear();
});
