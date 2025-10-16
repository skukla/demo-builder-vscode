import { ComponentDefinition } from '../types';

export interface InfrastructureItem {
  id: string;
  name: string;
  nodeVersion: string;
}

export interface NodeVersions {
  infrastructure: Record<string, number>;
  components: Record<string, number>;
}

/**
 * Simple Node.js version collector
 * No strategy, no assumptions - just reads and stores configured versions
 */
export class NodeVersionResolver {
  /**
   * Collect Node versions from components and infrastructure
   * 
   * @param components Array of components in the project
   * @param infrastructure Array of infrastructure items (Adobe CLI, SDK, etc.)
   * @returns Node versions for all items
   */
  static collectVersions(
    components: ComponentDefinition[],
    infrastructure: InfrastructureItem[]
  ): NodeVersions {
    const componentVersions: Record<string, number> = {};
    const infrastructureVersions: Record<string, number> = {};
    
    // Collect component versions (only for components that explicitly specify nodeVersion)
    for (const component of components) {
      if (component.configuration?.nodeVersion) {
        const version = parseInt(component.configuration.nodeVersion);
        componentVersions[component.id] = version;
      }
    }
    
    // Collect infrastructure versions
    for (const item of infrastructure) {
      const version = parseInt(item.nodeVersion);
      infrastructureVersions[item.id] = version;
    }
    
    return {
      infrastructure: infrastructureVersions,
      components: componentVersions
    };
  }
  
  /**
   * Get unique Node versions needed for the project
   * Useful for prerequisite checks
   */
  static getUniqueVersions(nodeVersions: NodeVersions): number[] {
    const allVersions = [
      ...Object.values(nodeVersions.infrastructure),
      ...Object.values(nodeVersions.components)
    ];
    return Array.from(new Set(allVersions)).sort((a, b) => a - b);
  }
}
