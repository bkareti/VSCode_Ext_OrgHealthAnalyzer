/**
 * Dependency Analyzer
 *
 * Builds a dependency graph of Apex classes, triggers, flows, and LWC
 * components to identify:
 * - Central/high-fan-in classes (fragile — changes break many things)
 * - Circular dependencies
 * - Deep dependency chains
 * - Unused / unreferenced components
 * - Tight coupling between unrelated modules
 *
 * Uses Salesforce MetadataComponentDependency Tooling API where available,
 * plus local static analysis as fallback.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  Issue,
  ApexClass,
  ApexTrigger,
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  DependencyNodeType,
} from '../types';
import { SalesforceService } from '../services/salesforceService';
import { logInfo, logWarning } from '../utils/logger';

// ─── Tooling API MetadataComponentDependency ────────────────────────────────

interface MetadataDependencyRecord {
  MetadataComponentId: string;
  MetadataComponentName: string;
  MetadataComponentType: string;
  RefMetadataComponentId: string;
  RefMetadataComponentName: string;
  RefMetadataComponentType: string;
}

// ─── Regex for local static analysis fallback ────────────────────────────────
const RE_CLASS_INSTANTIATION  = /new\s+([A-Z][A-Za-z0-9_]+)\s*\(/g;
const RE_STATIC_CALL           = /\b([A-Z][A-Za-z0-9_]+)\s*\.\s*[a-z]/g;
const RE_EXTENDS               = /extends\s+([A-Z][A-Za-z0-9_]+)/g;
const RE_IMPLEMENTS            = /implements\s+([\w,\s]+?)(?:\{|$)/g;
const RE_TYPE_DECL             = /(?:List|Set|Map|Optional)\s*<\s*([A-Z][A-Za-z0-9_]+)/g;
const RE_VARIABLE_DECL         = /^\s+(?:private|public|protected)?\s*(?:static\s+)?([A-Z][A-Za-z0-9_]+)\s+\w+/gm;

// ─── Helper: extract Apex class dependencies via static analysis ─────────────

function extractApexDependencies(
  className: string,
  body: string,
  knownClasses: Set<string>,
): { refs: string[]; edgeTypes: Map<string, 'calls' | 'extends' | 'implements'> } {
  const refs = new Set<string>();
  const edgeTypes = new Map<string, 'calls' | 'extends' | 'implements'>();

  const addRef = (name: string, type: 'calls' | 'extends' | 'implements' = 'calls') => {
    if (name !== className && knownClasses.has(name)) {
      refs.add(name);
      if (!edgeTypes.has(name)) {
        edgeTypes.set(name, type);
      }
    }
  };

  // extends
  const extendsMatches = body.matchAll(RE_EXTENDS);
  for (const m of extendsMatches) {
    addRef(m[1], 'extends');
  }
  RE_EXTENDS.lastIndex = 0;

  // implements (may be comma-separated)
  const implementsMatches = body.matchAll(RE_IMPLEMENTS);
  for (const m of implementsMatches) {
    const interfaces = m[1].split(',').map(s => s.trim());
    for (const iface of interfaces) {
      addRef(iface, 'implements');
    }
  }
  RE_IMPLEMENTS.lastIndex = 0;

  // new Instantiation
  const newMatches = body.matchAll(RE_CLASS_INSTANTIATION);
  for (const m of newMatches) {
    addRef(m[1]);
  }
  RE_CLASS_INSTANTIATION.lastIndex = 0;

  // static method calls
  const staticMatches = body.matchAll(RE_STATIC_CALL);
  for (const m of staticMatches) {
    addRef(m[1]);
  }
  RE_STATIC_CALL.lastIndex = 0;

  // type declarations in List<T>, Map<K,V> etc.
  const typeMatches = body.matchAll(RE_TYPE_DECL);
  for (const m of typeMatches) {
    addRef(m[1]);
  }
  RE_TYPE_DECL.lastIndex = 0;

  return { refs: [...refs], edgeTypes };
}

// ─── Detect circular dependencies (DFS) ─────────────────────────────────────

function detectCircularDependencies(
  nodes: DependencyNode[],
  edges: DependencyEdge[],
): string[][] {
  const adjList = new Map<string, string[]>();
  for (const node of nodes) {
    adjList.set(node.id, []);
  }
  for (const edge of edges) {
    adjList.get(edge.from)?.push(edge.to);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): void {
    visited.add(nodeId);
    stack.add(nodeId);
    path.push(nodeId);

    for (const neighbor of adjList.get(nodeId) || []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (stack.has(neighbor)) {
        // Found a cycle — capture the cycle path
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), neighbor]);
        }
      }
    }

    path.pop();
    stack.delete(nodeId);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return cycles;
}

// ─── Main Analyzer ────────────────────────────────────────────────────────────

export class DependencyAnalyzer {
  constructor(private readonly sfService: SalesforceService) {}

  async analyze(
    apexClasses: ApexClass[],
    apexTriggers: ApexTrigger[],
  ): Promise<{
    issues: Issue[];
    dependencyGraph: DependencyGraph;
  }> {
    logInfo('DependencyAnalyzer: building dependency graph...');
    const issues: Issue[] = [];

    // ── Build node set ─────────────────────────────────────────────────
    const nodes: DependencyNode[] = [];
    const edges: DependencyEdge[] = [];

    const knownClasses = new Set<string>(apexClasses.map(c => c.Name));
    const knownTriggers = new Set<string>(apexTriggers.map(t => t.Name));

    // Add all apex classes as nodes
    for (const cls of apexClasses) {
      nodes.push({
        id:      cls.Id,
        label:   cls.Name,
        type:    'apex-class',
        apiName: cls.Name,
        fanIn:   0,
        fanOut:  0,
      });
    }

    // Add all triggers as nodes
    for (const trigger of apexTriggers) {
      nodes.push({
        id:      trigger.Id,
        label:   trigger.Name,
        type:    'apex-trigger',
        apiName: trigger.Name,
        fanIn:   0,
        fanOut:  0,
      });
    }

    // ── Try MetadataComponentDependency API first (Tooling API) ────────
    const orgDepsAvailable = await this.tryOrgDependencyAPI(apexClasses, apexTriggers, nodes, edges);

    if (!orgDepsAvailable) {
      // ── Fallback: static analysis ────────────────────────────────────
      logInfo('DependencyAnalyzer: using static analysis fallback');
      this.buildStaticDependencies(apexClasses, knownClasses, apexTriggers, nodes, edges);
    }

    // ── Also scan local workspace for LWC components ─────────────────
    await this.addLwcNodes(nodes, edges);

    // ── Calculate fan-in / fan-out ────────────────────────────────────
    const idToNode = new Map<string, DependencyNode>(nodes.map(n => [n.id, n]));
    for (const edge of edges) {
      const fromNode = idToNode.get(edge.from);
      const toNode   = idToNode.get(edge.to);
      if (fromNode) { fromNode.fanOut = (fromNode.fanOut || 0) + 1; }
      if (toNode)   { toNode.fanIn    = (toNode.fanIn || 0) + 1; }
    }

    // Calculate centrality (normalized fan-in / total nodes)
    const totalNodes = Math.max(nodes.length, 1);
    for (const node of nodes) {
      node.centrality = (node.fanIn || 0) / totalNodes;
    }

    // ── Detect circular dependencies ─────────────────────────────────
    const circularDeps = detectCircularDependencies(nodes, edges);

    // ── Generate issues ───────────────────────────────────────────────
    this.generateIssues(issues, nodes, edges, circularDeps);

    const graph: DependencyGraph = {
      nodes,
      edges,
      maxDepth:               this.calculateMaxDepth(nodes, edges),
      circularDependencies:   circularDeps,
    };

    logInfo(`DependencyAnalyzer: ${nodes.length} nodes, ${edges.length} edges, ${circularDeps.length} cycles`);
    return { issues, dependencyGraph: graph };
  }

  // ── Private: Try org MetadataComponentDependency API ─────────────────────

  private async tryOrgDependencyAPI(
    apexClasses: ApexClass[],
    apexTriggers: ApexTrigger[],
    nodes: DependencyNode[],
    edges: DependencyEdge[],
  ): Promise<boolean> {
    try {
      // Chunk IDs to avoid SOQL limits
      const allIds = [
        ...apexClasses.map(c => c.Id),
        ...apexTriggers.map(t => t.Id),
      ].slice(0, 100); // limit initial batch

      if (allIds.length === 0) { return false; }

      const idList = allIds.map(id => `'${id}'`).join(',');
      const deps = await this.sfService.toolingQuery<MetadataDependencyRecord>(
        `SELECT MetadataComponentId, MetadataComponentName, MetadataComponentType,
                RefMetadataComponentId, RefMetadataComponentName, RefMetadataComponentType
         FROM MetadataComponentDependency
         WHERE MetadataComponentId IN (${idList})
         LIMIT 2000`,
      );

      if (deps.length === 0) { return false; }

      const nodeIdSet = new Set<string>(nodes.map(n => n.id));

      // Add any referenced nodes not already in our graph
      for (const dep of deps) {
        if (!nodeIdSet.has(dep.RefMetadataComponentId)) {
          nodes.push({
            id:      dep.RefMetadataComponentId,
            label:   dep.RefMetadataComponentName,
            type:    this.mapMetadataType(dep.RefMetadataComponentType),
            apiName: dep.RefMetadataComponentName,
            fanIn:   0,
            fanOut:  0,
          });
          nodeIdSet.add(dep.RefMetadataComponentId);
        }

        // Add edge
        edges.push({
          from: dep.MetadataComponentId,
          to:   dep.RefMetadataComponentId,
          type: 'references',
        });
      }

      logInfo(`DependencyAnalyzer: loaded ${deps.length} dependency edges from Tooling API`);
      return true;
    } catch (err) {
      logWarning(`DependencyAnalyzer: MetadataComponentDependency API failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // ── Private: Static analysis fallback ─────────────────────────────────────

  private buildStaticDependencies(
    apexClasses: ApexClass[],
    knownClasses: Set<string>,
    apexTriggers: ApexTrigger[],
    nodes: DependencyNode[],
    edges: DependencyEdge[],
  ): void {
    const nameToId = new Map<string, string>(apexClasses.map(c => [c.Name, c.Id]));
    for (const trigger of apexTriggers) { nameToId.set(trigger.Name, trigger.Id); }

    for (const cls of apexClasses) {
      if (!cls.Body) { continue; }
      const { refs, edgeTypes } = extractApexDependencies(cls.Name, cls.Body, knownClasses);
      for (const refName of refs) {
        const refId = nameToId.get(refName);
        if (refId) {
          edges.push({
            from: cls.Id,
            to:   refId,
            type: edgeTypes.get(refName) || 'calls',
          });
        }
      }
    }

    // Triggers → object they fire on (as nodes)
    for (const trigger of apexTriggers) {
      const objectName = trigger.TableEnumOrId;
      // Add object node if not already present
      const objId = `obj-${objectName}`;
      if (!nodes.find(n => n.id === objId)) {
        nodes.push({
          id:      objId,
          label:   objectName,
          type:    'object',
          apiName: objectName,
          fanIn:   0,
          fanOut:  0,
        });
      }
      edges.push({ from: trigger.Id, to: objId, type: 'triggers' });

      // Trigger → referenced Apex classes
      if (trigger.Body) {
        const { refs, edgeTypes } = extractApexDependencies(trigger.Name, trigger.Body, new Set(apexClasses.map(c => c.Name)));
        for (const refName of refs) {
          const refId = nameToId.get(refName);
          if (refId) {
            edges.push({ from: trigger.Id, to: refId, type: edgeTypes.get(refName) || 'calls' });
          }
        }
      }
    }
  }

  // ── Private: Add LWC nodes from workspace ─────────────────────────────────

  private async addLwcNodes(
    nodes: DependencyNode[],
    edges: DependencyEdge[],
  ): Promise<void> {
    try {
      const lwcDirs = await vscode.workspace.findFiles('**/lwc/**/*.js', '**/node_modules/**', 200);
      const lwcNames = new Set<string>();

      for (const uri of lwcDirs) {
        const baseName = path.basename(uri.fsPath, '.js');
        const dirName  = path.basename(path.dirname(uri.fsPath));
        if (baseName !== dirName) { continue; }
        lwcNames.add(dirName);
      }

      for (const name of lwcNames) {
        nodes.push({
          id:      `lwc-${name}`,
          label:   name,
          type:    'lwc',
          apiName: name,
          fanIn:   0,
          fanOut:  0,
        });
      }

      // Detect LWC → Apex wiring via @wire imports
      for (const uri of lwcDirs) {
        const baseName = path.basename(uri.fsPath, '.js');
        const dirName  = path.basename(path.dirname(uri.fsPath));
        if (baseName !== dirName) { continue; }

        try {
          const raw = await vscode.workspace.fs.readFile(uri);
          const js  = Buffer.from(raw).toString('utf8');
          const apexImports = js.match(/import\s+\w+\s+from\s+'@salesforce\/apex\/(\w+)\.\w+'/g);
          if (apexImports) {
            for (const imp of apexImports) {
              const classMatch = imp.match(/@salesforce\/apex\/(\w+)\./);
              if (classMatch) {
                edges.push({
                  from: `lwc-${dirName}`,
                  to:   classMatch[1], // Will be resolved if node exists
                  type: 'invokes',
                });
              }
            }
          }
        } catch {
          // ignore read errors
        }
      }
    } catch {
      // No workspace open or no LWC
    }
  }

  // ── Private: Calculate max depth ─────────────────────────────────────────

  private calculateMaxDepth(nodes: DependencyNode[], edges: DependencyEdge[]): number {
    const adjList = new Map<string, string[]>();
    for (const node of nodes) { adjList.set(node.id, []); }
    for (const edge of edges) { adjList.get(edge.from)?.push(edge.to); }

    let maxDepth = 0;
    function dfs(nodeId: string, depth: number, visited: Set<string>): void {
      if (visited.has(nodeId)) { return; }
      visited.add(nodeId);
      maxDepth = Math.max(maxDepth, depth);
      for (const neighbor of adjList.get(nodeId) || []) {
        dfs(neighbor, depth + 1, visited);
      }
    }

    // Only start from nodes with no incoming edges (roots)
    const hasIncoming = new Set(edges.map(e => e.to));
    for (const node of nodes) {
      if (!hasIncoming.has(node.id)) {
        dfs(node.id, 0, new Set());
      }
    }
    return maxDepth;
  }

  // ── Private: Map metadata type to DependencyNodeType ─────────────────────

  private mapMetadataType(mdType: string): DependencyNodeType {
    const map: Record<string, DependencyNodeType> = {
      'ApexClass':        'apex-class',
      'ApexTrigger':      'apex-trigger',
      'Flow':             'flow',
      'LightningComponentBundle': 'lwc',
      'AuraDefinitionBundle':     'aura',
      'ApexPage':                 'visualforce',
      'CustomObject':             'object',
      'ValidationRule':           'validation-rule',
    };
    return map[mdType] || 'apex-class';
  }

  // ── Private: Generate issues ──────────────────────────────────────────────

  private generateIssues(
    issues: Issue[],
    nodes: DependencyNode[],
    edges: DependencyEdge[],
    circularDeps: string[][],
  ): void {
    // High fan-in (central) classes
    for (const node of nodes) {
      if ((node.fanIn || 0) > 15) {
        issues.push({
          id:          `dep-central-${node.id}`,
          ruleId:      'dep.high-centrality',
          severity:    (node.fanIn || 0) > 25 ? 'error' : 'warning',
          category:    'dependencies',
          message:     `${node.label}: Referenced by ${node.fanIn} other components — extremely high coupling`,
          description: `This class has ${node.fanIn} incoming dependencies. Changes to it cascade to many components. This is a major fragility risk.`,
          object:      node.label,
          suggestion:  'Introduce an interface or Abstract class in front of this class. Consumers depend on the interface, not the implementation. This enables independent testing and changes.',
        });
      }

      // God nodes with both high fan-in and fan-out
      if ((node.fanIn || 0) > 8 && (node.fanOut || 0) > 8) {
        issues.push({
          id:          `dep-god-node-${node.id}`,
          ruleId:      'dep.god-node',
          severity:    'warning',
          category:    'dependencies',
          message:     `${node.label}: High fan-in (${node.fanIn}) AND fan-out (${node.fanOut}) — architectural hotspot`,
          description: 'This component is both heavily depended upon and depends on many other components. It is an architectural hotspot that makes refactoring very risky.',
          object:      node.label,
          suggestion:  'Apply the "Strangler Fig" pattern: gradually extract responsibilities into new, narrowly-scoped classes. Wrap the existing class with a facade.',
        });
      }
    }

    // Circular dependencies
    for (let i = 0; i < circularDeps.length; i++) {
      const cycle = circularDeps[i];
      issues.push({
        id:          `dep-cycle-${i}`,
        ruleId:      'dep.circular-dependency',
        severity:    'error',
        category:    'dependencies',
        message:     `Circular dependency detected: ${cycle.join(' → ')}`,
        description: 'Circular dependencies mean classes cannot be deployed or tested independently. They are a major architectural smell that prevents proper modularization.',
        suggestion:  'Break the cycle by introducing an interface or event. The class that should NOT depend on the other should depend on an interface instead. Or use Platform Events to decouple.',
      });
    }

    // Disconnected components (no edges at all) if large
    const connectedIds = new Set([...edges.map(e => e.from), ...edges.map(e => e.to)]);
    for (const node of nodes) {
      if (!connectedIds.has(node.id) && node.type === 'apex-class') {
        issues.push({
          id:          `dep-isolated-${node.id}`,
          ruleId:      'dep.isolated-class',
          severity:    'info',
          category:    'dependencies',
          message:     `${node.label}: No detected dependencies — possibly unreferenced or utility class`,
          description: 'This class has no detected inbound or outbound dependencies. It may be dead code, a standalone utility, or its dependencies were not detected by static analysis.',
          object:      node.label,
          suggestion:  'Verify this class is still used. If it was replaced, deprecate and remove it. Use the MetadataComponentDependency API for definitive reference checking.',
        });
      }
    }
  }
}

export function createDependencyAnalyzer(sfService: SalesforceService): DependencyAnalyzer {
  return new DependencyAnalyzer(sfService);
}
