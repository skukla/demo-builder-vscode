# Graph-Based Dependency System Architecture

## Overview

This document outlines the planned evolution from the current two-level prerequisite/plugin hierarchy to a flexible graph-based dependency system where any entity can have relationships with any other entity.

## Current State

The system currently uses a rigid, two-level hierarchy:
- Prerequisites can have "plugins" (hardcoded child relationship)
- Components can depend on prerequisites
- The "plugin" concept is specifically tied to Adobe I/O CLI prerequisites

### Limitations
- Hardcoded relationships between entities
- No ability for components to adapt based on what else is installed
- Artificial distinction between "prerequisites" and "plugins"
- Cannot express peer dependencies or conditional enhancements

## Proposed Graph-Based System

### Core Concepts

1. **Unified Entities**: All prerequisites, components, and plugins become "entities" in a graph
2. **Flexible Relationships**: Any entity can relate to any other in multiple ways
3. **Context-Aware Features**: Components can discover and adapt to their environment
4. **Capability-Based**: Entities advertise what they provide and consume

### Entity Types

```typescript
type EntityType = 
  | 'runtime'    // Node.js, Python, etc.
  | 'tool'       // CLI tools like aio-cli
  | 'extension'  // Plugins/extensions to tools
  | 'component'  // Application components
  | 'frontend'   // Frontend frameworks
  | 'backend';   // Backend systems
```

### Relationship Types

```typescript
type RelationshipType = 
  | 'requires'    // Must be present before installation
  | 'extends'     // Adds functionality to parent
  | 'includes'    // Parent-child containment
  | 'enhanced-by' // Optional enhancement
  | 'conflicts'   // Cannot coexist
  | 'replaces';   // Can substitute for another
```

## Implementation Plan

### Phase 1: Data Structure

Create a unified `entities.json` file:

```json
{
  "version": "2.0.0",
  "entities": [
    {
      "id": "node",
      "type": "runtime",
      "name": "Node.js",
      "description": "JavaScript runtime",
      "check": {
        "command": "node --version",
        "parseVersion": "v([0-9.]+)"
      },
      "install": {
        "commands": ["fnm install {{version}}"]
      }
    },
    {
      "id": "aio-cli",
      "type": "tool",
      "name": "Adobe I/O CLI",
      "description": "Command-line interface for Adobe services",
      "check": {
        "command": "aio --version",
        "parseVersion": "@adobe/aio-cli/([0-9.]+)"
      },
      "install": {
        "commands": ["npm install -g @adobe/aio-cli"],
        "perNodeVersion": true
      }
    },
    {
      "id": "api-mesh",
      "type": "extension",
      "name": "API Mesh Plugin",
      "description": "Adobe API Mesh management plugin",
      "check": {
        "command": "aio plugins",
        "contains": "@adobe/aio-cli-plugin-api-mesh"
      },
      "install": {
        "commands": ["aio plugins:install @adobe/aio-cli-plugin-api-mesh"]
      }
    },
    {
      "id": "demo-inspector",
      "type": "component",
      "name": "Demo Inspector",
      "description": "Visual debugging overlay",
      "source": {
        "type": "npm",
        "package": "@adobe/demo-inspector",
        "version": "^1.0.0"
      },
      "configuration": {
        "defaultEnabled": true,
        "position": "right"
      }
    },
    {
      "id": "citisignal-nextjs",
      "type": "frontend",
      "name": "Headless CitiSignal",
      "description": "NextJS-based storefront",
      "source": {
        "type": "git",
        "url": "https://github.com/skukla/citisignal-nextjs",
        "branch": "master"
      },
      "configuration": {
        "port": 3000,
        "nodeVersion": "24"
      }
    },
    {
      "id": "aep-websdk",
      "type": "component",
      "name": "AEP Web SDK",
      "description": "Adobe Experience Platform Web SDK"
    }
  ],
  "relationships": [
    {
      "from": "aio-cli",
      "to": "node",
      "type": "requires",
      "context": "runtime"
    },
    {
      "from": "api-mesh",
      "to": "aio-cli",
      "type": "extends",
      "description": "Extends aio-cli with mesh capabilities"
    },
    {
      "from": "citisignal-nextjs",
      "to": "commerce-mesh",
      "type": "requires"
    },
    {
      "from": "citisignal-nextjs",
      "to": "demo-inspector",
      "type": "includes",
      "optional": true
    },
    {
      "from": "demo-inspector",
      "to": "aep-websdk",
      "type": "enhanced-by",
      "optional": true,
      "description": "Gains analytics features when AEP is present"
    }
  ],
  "capabilities": {
    "demo-inspector": {
      "provides": ["debugging-api", "performance-metrics", "api-tracking"],
      "consumes": ["dom-access", "network-interceptor"],
      "features": {
        "base": ["basic-inspection", "api-tracking"],
        "conditional": [
          {
            "when": ["aep-websdk"],
            "provides": ["aep-data-visualization", "segment-tracking", "experience-events"]
          },
          {
            "when": ["commerce-mesh"],
            "provides": ["graphql-debugging", "mesh-performance", "query-analysis"]
          },
          {
            "when": ["aep-websdk", "commerce-mesh"],
            "provides": ["unified-analytics-dashboard"]
          }
        ]
      }
    },
    "aep-websdk": {
      "provides": ["analytics-provider", "event-tracking", "audience-management"],
      "consumes": ["network-access", "storage-access"]
    }
  }
}
```

### Phase 2: Core Classes

#### EntityGraph Class

```typescript
interface Entity {
  id: string;
  type: EntityType;
  name: string;
  description?: string;
  check?: CheckCommand;
  install?: InstallCommand;
  source?: SourceDefinition;
  configuration?: any;
}

interface Relationship {
  from: string;
  to: string;
  type: RelationshipType;
  optional?: boolean;
  context?: string;
  condition?: Condition;
  description?: string;
}

interface Capability {
  provides: string[];
  consumes: string[];
  features: {
    base: string[];
    conditional: ConditionalFeature[];
  };
}

class EntityGraph {
  private entities: Map<string, Entity>;
  private relationships: Relationship[];
  private capabilities: Map<string, Capability>;
  
  constructor(config: EntityGraphConfig) {
    this.loadEntities(config.entities);
    this.loadRelationships(config.relationships);
    this.loadCapabilities(config.capabilities);
  }
  
  // Core graph operations
  getDependencies(entityId: string, type?: RelationshipType): Entity[] {
    return this.relationships
      .filter(r => r.from === entityId && (!type || r.type === type))
      .map(r => this.entities.get(r.to))
      .filter(Boolean);
  }
  
  getDependents(entityId: string): Entity[] {
    return this.relationships
      .filter(r => r.to === entityId)
      .map(r => this.entities.get(r.from))
      .filter(Boolean);
  }
  
  getEnhancements(entityId: string): Entity[] {
    return this.relationships
      .filter(r => r.from === entityId && r.type === 'enhanced-by')
      .map(r => this.entities.get(r.to))
      .filter(Boolean);
  }
  
  // Installation order resolution using topological sort
  getInstallationOrder(selectedEntities: string[]): Entity[] {
    const visited = new Set<string>();
    const order: Entity[] = [];
    
    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      
      const deps = this.getDependencies(id, 'requires');
      deps.forEach(dep => visit(dep.id));
      
      const entity = this.entities.get(id);
      if (entity && selectedEntities.includes(id)) {
        order.push(entity);
      }
    };
    
    selectedEntities.forEach(visit);
    return order;
  }
  
  // Feature discovery
  getAvailableFeatures(entityId: string, context: string[]): string[] {
    const capability = this.capabilities.get(entityId);
    if (!capability) return [];
    
    const features = [...capability.features.base];
    
    capability.features.conditional.forEach(cond => {
      if (cond.when.every(req => context.includes(req))) {
        features.push(...cond.provides);
      }
    });
    
    return features;
  }
  
  // Conflict detection
  detectConflicts(selectedEntities: string[]): Conflict[] {
    const conflicts: Conflict[] = [];
    
    for (const entityId of selectedEntities) {
      const conflictRels = this.relationships.filter(
        r => r.from === entityId && r.type === 'conflicts'
      );
      
      for (const rel of conflictRels) {
        if (selectedEntities.includes(rel.to)) {
          conflicts.push({
            entity1: entityId,
            entity2: rel.to,
            description: rel.description
          });
        }
      }
    }
    
    return conflicts;
  }
  
  // Check if all required dependencies are satisfied
  validateSelection(selectedEntities: string[]): ValidationResult {
    const missing: string[] = [];
    const included = new Set(selectedEntities);
    
    for (const entityId of selectedEntities) {
      const required = this.getDependencies(entityId, 'requires');
      for (const dep of required) {
        if (!included.has(dep.id)) {
          missing.push(`${entityId} requires ${dep.id}`);
        }
      }
    }
    
    return {
      valid: missing.length === 0,
      missing,
      conflicts: this.detectConflicts(selectedEntities)
    };
  }
}
```

### Phase 3: Smart Components

Components become self-aware and can adapt to their environment:

```typescript
interface ComponentContext {
  graph: EntityGraph;
  discover: (capabilities: string[]) => Promise<Set<string>>;
  provide: (capability: string, api: any) => void;
  consume: (capability: string) => any;
  on: (event: string, handler: Function) => void;
}

abstract class SmartComponent {
  protected id: string;
  protected context: ComponentContext;
  protected extensions: Map<string, Extension> = new Map();
  
  async initialize(context: ComponentContext) {
    this.context = context;
    
    // Discover available enhancements
    const enhancements = context.graph.getEnhancements(this.id);
    
    // Load extensions based on what's available
    for (const enhancement of enhancements) {
      await this.loadExtension(enhancement);
    }
    
    // Register our capabilities
    this.registerCapabilities();
    
    // Subscribe to system events
    this.subscribeToEvents();
  }
  
  protected abstract registerCapabilities(): void;
  protected abstract subscribeToEvents(): void;
  
  private async loadExtension(entity: Entity) {
    try {
      const extension = await import(`./extensions/${entity.id}`);
      this.extensions.set(entity.id, extension);
      await extension.activate(this);
    } catch (error) {
      // Extension not available, continue without it
      console.log(`Optional extension ${entity.id} not available`);
    }
  }
}

// Example: Demo Inspector as a smart component
class DemoInspector extends SmartComponent {
  private inspectionTargets: Map<string, InspectionTarget> = new Map();
  
  protected registerCapabilities() {
    this.context.provide('debugging-api', {
      inspect: this.inspect.bind(this),
      trace: this.trace.bind(this),
      profile: this.profile.bind(this)
    });
  }
  
  protected subscribeToEvents() {
    this.context.on('component:loaded', this.onComponentLoaded.bind(this));
    this.context.on('api:called', this.onAPICall.bind(this));
  }
  
  private onComponentLoaded(component: Entity) {
    // Dynamically adapt to new components
    const capabilities = this.context.graph.capabilities.get(component.id);
    
    if (capabilities?.provides.includes('api-endpoint')) {
      this.addAPIMonitor(component);
    }
    
    if (capabilities?.provides.includes('analytics-provider')) {
      this.addAnalyticsIntegration(component);
    }
  }
  
  private async addAnalyticsIntegration(provider: Entity) {
    // Check if we have the extension for this provider
    const extension = this.extensions.get(provider.id);
    if (extension) {
      await extension.integrateAnalytics(this, provider);
    }
  }
}
```

### Phase 4: UI Updates

The Prerequisites step becomes a tree view showing the full dependency graph:

```tsx
interface DependencyTreeNode {
  entity: Entity;
  relationship?: Relationship;
  children: DependencyTreeNode[];
  status: 'pending' | 'checking' | 'success' | 'error';
  features?: string[];
}

function DependencyTree({ graph, selected }: Props) {
  const buildTree = (entityId: string): DependencyTreeNode => {
    const entity = graph.getEntity(entityId);
    const deps = graph.getDependencies(entityId);
    const enhancements = graph.getEnhancements(entityId);
    
    return {
      entity,
      children: [
        ...deps.map(d => buildTree(d.id)),
        ...enhancements.map(e => ({ 
          ...buildTree(e.id), 
          relationship: { type: 'enhanced-by', optional: true }
        }))
      ],
      status: 'pending',
      features: graph.getAvailableFeatures(entityId, selected)
    };
  };
  
  return (
    <TreeView>
      {selected.map(entityId => (
        <TreeNode key={entityId} node={buildTree(entityId)} />
      ))}
    </TreeView>
  );
}
```

## Migration Strategy

1. **Create new `entities.json`** with all prerequisites and component dependencies
2. **Implement `EntityGraph` class** with graph traversal algorithms
3. **Update UI components** to work with the graph structure
4. **Refactor checking logic** to handle arbitrary dependency depth
5. **Add feature discovery** to components
6. **Remove old system** once new system is stable

## Benefits

1. **Flexibility**: Any relationship between any entities
2. **Extensibility**: New entity types and relationships without code changes
3. **Intelligence**: Components that adapt to their environment
4. **Maintainability**: All relationships defined in JSON
5. **Scalability**: Graph algorithms handle complex dependency chains
6. **Feature Discovery**: Components can discover and use optional enhancements

## Example Use Cases

### Use Case 1: Demo Inspector with Conditional Features

```json
{
  "relationships": [
    {
      "from": "demo-inspector",
      "to": "aep-websdk",
      "type": "enhanced-by",
      "enables": ["aep-data-tracking", "segment-visualization"]
    },
    {
      "from": "demo-inspector",
      "to": "commerce-mesh",
      "type": "enhanced-by",
      "enables": ["graphql-debugging", "mesh-performance"]
    }
  ]
}
```

### Use Case 2: Alternative Implementations

```json
{
  "relationships": [
    {
      "from": "yarn",
      "to": "npm",
      "type": "replaces",
      "description": "Yarn can be used instead of npm"
    },
    {
      "from": "pnpm",
      "to": "npm",
      "type": "replaces",
      "description": "pnpm can be used instead of npm"
    }
  ]
}
```

### Use Case 3: Complex Multi-Component System

```json
{
  "relationships": [
    {
      "from": "app-builder-app",
      "to": "aio-cli",
      "type": "requires"
    },
    {
      "from": "app-builder-app",
      "to": "commerce-events",
      "type": "enhanced-by",
      "enables": ["event-driven-actions"]
    },
    {
      "from": "commerce-events",
      "to": "event-mesh",
      "type": "requires"
    }
  ]
}
```

## Future Enhancements

1. **Version Constraints**: Add version compatibility checking
2. **Conditional Requirements**: Requirements based on configuration
3. **Resource Requirements**: CPU, memory, disk space requirements
4. **Platform-Specific Graphs**: Different graphs for different OS/platforms
5. **Graph Visualization**: Visual dependency explorer tool
6. **Capability Negotiation Protocol**: Runtime feature negotiation between components

## Conclusion

This graph-based system transforms our static, hierarchical dependency management into a dynamic, intelligent system where components can discover, adapt, and enhance each other. The JSON configuration becomes a capability manifest rather than hardcoded logic, making the system infinitely more flexible and maintainable.