// Mock VS Code API for tests
export const workspace = {
    fs: {
        stat: jest.fn(),
        readFile: jest.fn(),
        writeFile: jest.fn(),
    },
    createFileSystemWatcher: jest.fn(() => ({
        onDidChange: jest.fn(),
        onDidCreate: jest.fn(),
        onDidDelete: jest.fn(),
        dispose: jest.fn(),
    })),
};

export const Uri = {
    file: jest.fn((path: string) => ({
        fsPath: path,
        path,
        toString: () => path
    })),
    parse: jest.fn((uri: string) => ({
        fsPath: uri,
        path: uri,
        toString: () => uri
    })),
    joinPath: jest.fn((base: any, ...paths: string[]) => {
        const joinedPath = [base.fsPath || base.path, ...paths].join('/');
        return {
            fsPath: joinedPath,
            path: joinedPath,
            toString: () => joinedPath
        };
    }),
};

export const window = {
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({
        append: jest.fn(),
        appendLine: jest.fn(),
        clear: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn(),
    })),
    createWebviewPanel: jest.fn(),
    createStatusBarItem: jest.fn(() => ({
        text: '',
        tooltip: '',
        command: '',
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn(),
    })),
    showQuickPick: jest.fn(),
    terminals: [],
    activeColorTheme: {
        kind: 1, // ColorThemeKind.Dark
    },
};

export const FileType = {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
};

export const ExtensionMode = {
    Production: 1,
    Development: 2,
    Test: 3,
};

export const commands = {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(),
};

export const env = {
    openExternal: jest.fn(),
};

export const languages = {
    createDiagnosticCollection: jest.fn(() => ({
        set: jest.fn(),
        clear: jest.fn(),
        delete: jest.fn(),
        dispose: jest.fn(),
    })),
};

export const ColorThemeKind = {
    Light: 1,
    Dark: 2,
    HighContrast: 3,
};

export const ViewColumn = {
    Active: -1,
    Beside: -2,
    One: 1,
    Two: 2,
    Three: 3,
};

export const StatusBarAlignment = {
    Left: 1,
    Right: 2,
};

export class EventEmitter {
    private _listeners: Array<(data: any) => void> = [];
    private _fireMethod = jest.fn();
    private _disposeMethod = jest.fn();

    get event() {
        return (listener: (data: any) => void) => {
            this._listeners.push(listener);
            return {
                dispose: () => {
                    const index = this._listeners.indexOf(listener);
                    if (index > -1) {
                        this._listeners.splice(index, 1);
                    }
                }
            };
        };
    }

    fire(data?: any) {
        this._fireMethod(data);
        this._listeners.forEach(listener => listener(data));
    }

    dispose() {
        this._disposeMethod();
        this._listeners = [];
    }
}

export const Disposable = jest.fn().mockImplementation(() => ({
    dispose: jest.fn(),
}));
