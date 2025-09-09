import * as vscode from 'vscode';
import { ComponentRegistryManager, DependencyResolver } from '../utils/componentRegistry';

export class ComponentHandler {
    private registryManager: ComponentRegistryManager;
    private dependencyResolver: DependencyResolver;

    constructor(private context: vscode.ExtensionContext) {
        this.registryManager = new ComponentRegistryManager(context.extensionPath);
        this.dependencyResolver = new DependencyResolver(this.registryManager);
    }

    async handleMessage(message: any, panel: vscode.WebviewPanel) {
        switch (message.type) {
            case 'loadComponents':
                await this.loadComponents(panel);
                break;
            case 'get-components-data':
                await this.getComponentsData(panel);
                break;
            case 'checkCompatibility':
                await this.checkCompatibility(message.payload, panel);
                break;
            case 'loadDependencies':
                await this.loadDependencies(message.payload, panel);
                break;
            case 'loadPreset':
                await this.loadPreset(message.payload, panel);
                break;
            case 'validateSelection':
                await this.validateSelection(message.payload, panel);
                break;
        }
    }

    private async loadComponents(panel: vscode.WebviewPanel) {
        try {
            const frontends = await this.registryManager.getFrontends();
            const backends = await this.registryManager.getBackends();
            const externalSystems = await this.registryManager.getExternalSystems();
            const appBuilder = await this.registryManager.getAppBuilder();
            const dependencies = await this.registryManager.getDependencies();
            const presets = await this.registryManager.getPresets();

            const componentsData = {
                frontends: frontends.map(f => ({
                    id: f.id,
                    name: f.name,
                    description: f.description,
                    features: f.features,
                    configuration: f.configuration,
                    recommended: f.id === 'citisignal-nextjs'
                })),
                backends: backends.map(b => ({
                    id: b.id,
                    name: b.name,
                    description: b.description,
                    configuration: b.configuration
                })),
                externalSystems: externalSystems.map(e => ({
                    id: e.id,
                    name: e.name,
                    description: e.description,
                    configuration: e.configuration
                })),
                appBuilder: appBuilder.map(a => ({
                    id: a.id,
                    name: a.name,
                    description: a.description,
                    configuration: a.configuration
                })),
                dependencies: dependencies.map(d => ({
                    id: d.id,
                    name: d.name,
                    description: d.description,
                    configuration: d.configuration
                })),
                presets
            };

            // Send components to webview
            panel.webview.postMessage({
                type: 'componentsLoaded',
                payload: componentsData
            });
            
            // Also send to backend for reference
            panel.webview.postMessage({
                type: 'update-components-data',
                payload: componentsData
            });
        } catch (error) {
            panel.webview.postMessage({
                type: 'error',
                payload: {
                    message: 'Failed to load components',
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            });
        }
    }

    private async getComponentsData(panel: vscode.WebviewPanel) {
        try {
            const frontends = await this.registryManager.getFrontends();
            const backends = await this.registryManager.getBackends();
            const externalSystems = await this.registryManager.getExternalSystems();
            const appBuilder = await this.registryManager.getAppBuilder();
            const dependencies = await this.registryManager.getDependencies();

            const componentsData = {
                frontends: frontends.map(f => ({
                    id: f.id,
                    name: f.name,
                    description: f.description,
                    configuration: f.configuration
                })),
                backends: backends.map(b => ({
                    id: b.id,
                    name: b.name,
                    description: b.description,
                    configuration: b.configuration
                })),
                externalSystems: externalSystems.map(e => ({
                    id: e.id,
                    name: e.name,
                    description: e.description,
                    configuration: e.configuration
                })),
                appBuilder: appBuilder.map(a => ({
                    id: a.id,
                    name: a.name,
                    description: a.description,
                    configuration: a.configuration
                })),
                dependencies: dependencies.map(d => ({
                    id: d.id,
                    name: d.name,
                    description: d.description,
                    configuration: d.configuration
                }))
            };

            // Send components data to webview
            panel.webview.postMessage({
                type: 'components-data',
                payload: componentsData
            });
        } catch (error) {
            panel.webview.postMessage({
                type: 'error',
                payload: {
                    message: 'Failed to load component configurations',
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            });
        }
    }

    private async checkCompatibility(
        payload: { frontend: string; backend: string },
        panel: vscode.WebviewPanel
    ) {
        try {
            const compatible = await this.registryManager.checkCompatibility(
                payload.frontend,
                payload.backend
            );
            const compatibilityInfo = await this.registryManager.getCompatibilityInfo(
                payload.frontend,
                payload.backend
            );

            panel.webview.postMessage({
                type: 'compatibilityResult',
                payload: {
                    compatible,
                    ...compatibilityInfo
                }
            });
        } catch (error) {
            panel.webview.postMessage({
                type: 'error',
                payload: {
                    message: 'Failed to check compatibility',
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            });
        }
    }

    private async loadDependencies(
        payload: { frontend: string; backend: string },
        panel: vscode.WebviewPanel
    ) {
        try {
            const resolved = await this.dependencyResolver.resolveDependencies(
                payload.frontend,
                payload.backend
            );

            const dependencies = [
                ...resolved.required.map(d => ({
                    id: d.id,
                    name: d.name,
                    description: d.description,
                    required: true,
                    impact: d.configuration?.impact
                })),
                ...resolved.optional.map(d => ({
                    id: d.id,
                    name: d.name,
                    description: d.description,
                    required: false,
                    impact: d.configuration?.impact
                }))
            ];

            panel.webview.postMessage({
                type: 'dependenciesLoaded',
                payload: { dependencies }
            });
        } catch (error) {
            panel.webview.postMessage({
                type: 'error',
                payload: {
                    message: 'Failed to load dependencies',
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            });
        }
    }

    private async loadPreset(
        payload: { presetId: string },
        panel: vscode.WebviewPanel
    ) {
        try {
            const presets = await this.registryManager.getPresets();
            const preset = presets.find(p => p.id === payload.presetId);

            if (preset) {
                panel.webview.postMessage({
                    type: 'presetLoaded',
                    payload: {
                        frontend: preset.selections.frontend,
                        backend: preset.selections.backend,
                        dependencies: preset.selections.dependencies
                    }
                });
            } else {
                throw new Error(`Preset ${payload.presetId} not found`);
            }
        } catch (error) {
            panel.webview.postMessage({
                type: 'error',
                payload: {
                    message: 'Failed to load preset',
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            });
        }
    }

    private async validateSelection(
        payload: { frontend: string; backend: string; dependencies: string[] },
        panel: vscode.WebviewPanel
    ) {
        try {
            const resolved = await this.dependencyResolver.resolveDependencies(
                payload.frontend,
                payload.backend,
                payload.dependencies
            );

            const validation = await this.dependencyResolver.validateDependencyChain(
                resolved.all
            );

            panel.webview.postMessage({
                type: 'validationResult',
                payload: validation
            });
        } catch (error) {
            panel.webview.postMessage({
                type: 'error',
                payload: {
                    message: 'Failed to validate selection',
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            });
        }
    }

    async generateProjectConfig(
        frontend: string,
        backend: string,
        dependencies: string[]
    ) {
        const frontendComponent = await this.registryManager.getComponentById(frontend);
        const backendComponent = await this.registryManager.getComponentById(backend);
        const resolved = await this.dependencyResolver.resolveDependencies(
            frontend,
            backend,
            dependencies
        );

        if (!frontendComponent || !backendComponent) {
            throw new Error('Invalid component selection');
        }

        return await this.dependencyResolver.generateConfiguration(
            frontendComponent,
            backendComponent,
            resolved.all
        );
    }
}