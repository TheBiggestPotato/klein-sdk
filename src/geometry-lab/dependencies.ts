import {
  geometryConstructionSourceIds,
  geometryConstraintDependencies,
  geometryEntityPointIds,
} from '../geometry-core/index.js';
import type { GeometryConstraint, GeometryEntity } from '../geometry-core/index.js';
import type {
  GeometryEntity3D,
  GeometryLabSnapshot,
  GeometrySelection,
  Measurement3D,
  MeasurementSource2D,
  WorkPlane3D,
} from './types.js';

/** Durable Geometry Lab collections whose members can participate in deletion. */
export type GeometryLabStoredCollection =
  | 'point2d'
  | 'entity2d'
  | 'constraint2d'
  | 'slider2d'
  | 'measurement2d'
  | 'point3d'
  | 'entity3d'
  | 'workPlane'
  | 'measurement'
  | 'net'
  | 'link';

/** Synthetic graph nodes used to model references held by application state. */
export type GeometryLabAppReferenceCollection = 'appSelection' | 'activeWorkPlane';

export type GeometryLabDependencyCollection = GeometryLabStoredCollection | GeometryLabAppReferenceCollection;

/** A collection-qualified reference. IDs remain unambiguous even for malformed snapshots. */
export interface GeometryLabDependencyRef {
  collection: GeometryLabDependencyCollection;
  id: string;
}

export type GeometryLabDependencyKey = `${GeometryLabDependencyCollection}:${string}`;

export type GeometryLabNodeDeletePolicy = 'delete' | 'reject' | 'prune' | 'reset';

export interface GeometryLabDependencyNode {
  key: GeometryLabDependencyKey;
  ref: GeometryLabDependencyRef;
  path: string;
  stored: boolean;
  deletePolicy: GeometryLabNodeDeletePolicy;
  selectionIndex?: number;
}

/** Why one Geometry Lab node needs another node to remain valid. */
export type GeometryLabDependencyRelation =
  | 'constructionSource'
  | 'entityPoint'
  | 'relationTarget'
  | 'constraintPoint'
  | 'constraintEntity'
  | 'solidPoint'
  | 'crossSectionPoint'
  | 'crossSectionSolid'
  | 'crossSectionPlane'
  | 'workPlanePoint'
  | 'workPlanePlane'
  | 'workPlaneEntity'
  | 'workPlaneThroughPoint'
  | 'measurementTarget'
  | 'measurementPoint'
  | 'measurementPlane'
  | 'measurementSolid'
  | 'netSolid'
  | 'linkSource'
  | 'linkTarget'
  | 'selectionTarget'
  | 'activeWorkPlane';

/** Action required for the dependent when its dependency is deleted. */
export type GeometryLabDependencyDeletePolicy = 'cascade' | 'prune' | 'reset' | 'reject';

export interface GeometryLabDependencyEdge {
  dependentKey: GeometryLabDependencyKey;
  dependencyKey: GeometryLabDependencyKey;
  relation: GeometryLabDependencyRelation;
  onDependencyDelete: GeometryLabDependencyDeletePolicy;
}

/** Ownership is intentionally separate from dependency: an entity can use a point without owning it. */
export type GeometryLabOwnershipRelation = 'solidMeshPoint' | 'crossSectionPoint';

export interface GeometryLabOwnershipEdge {
  ownerKey: GeometryLabDependencyKey;
  ownedKey: GeometryLabDependencyKey;
  relation: GeometryLabOwnershipRelation;
  onOwnerDelete: 'cascade';
}

export interface GeometryLabUnresolvedDependency {
  dependentKey: GeometryLabDependencyKey;
  missingId: string;
  relation: GeometryLabDependencyRelation;
  reason: 'missing' | 'ambiguous';
  expectedCollections: readonly GeometryLabStoredCollection[];
  candidateKeys: readonly GeometryLabDependencyKey[];
}

export interface GeometryLabOwnershipConflict {
  ownedKey: GeometryLabDependencyKey;
  ownerKeys: readonly GeometryLabDependencyKey[];
}

/** Complete, deterministic dependency and ownership index for a shape-valid snapshot. */
export interface GeometryLabDependencyGraph {
  nodesByKey: Readonly<Record<GeometryLabDependencyKey, GeometryLabDependencyNode>>;
  keysById: Readonly<Record<string, readonly GeometryLabDependencyKey[]>>;
  dependencyEdges: readonly GeometryLabDependencyEdge[];
  ownershipEdges: readonly GeometryLabOwnershipEdge[];
  /** Geometry-core-compatible view over durable nodes, relying on Phase 2's globally unique IDs. */
  dependenciesById: Readonly<Record<string, readonly string[]>>;
  /** Geometry-core-compatible reverse view over durable nodes only. */
  dependentsById: Readonly<Record<string, readonly string[]>>;
  dependenciesByKey: Readonly<Record<GeometryLabDependencyKey, readonly GeometryLabDependencyKey[]>>;
  dependentsByKey: Readonly<Record<GeometryLabDependencyKey, readonly GeometryLabDependencyKey[]>>;
  ownedByOwnerKey: Readonly<Record<GeometryLabDependencyKey, readonly GeometryLabDependencyKey[]>>;
  ownersByOwnedKey: Readonly<Record<GeometryLabDependencyKey, readonly GeometryLabDependencyKey[]>>;
  unresolvedDependencies: readonly GeometryLabUnresolvedDependency[];
  ownershipConflicts: readonly GeometryLabOwnershipConflict[];
}

export interface GeometryLabDeleteBlocker {
  key: GeometryLabDependencyKey;
  ref: GeometryLabDependencyRef;
  reason: 'protectedObject' | 'dependentRejectsDeletion';
  dependentKey?: GeometryLabDependencyKey;
}

export interface GeometryLabCascadeDeletePlan {
  ok: boolean;
  deleteKeys: readonly GeometryLabDependencyKey[];
  deleteRefs: readonly GeometryLabDependencyRef[];
  deleteIds: readonly string[];
  pruneSelectionIndexes: readonly number[];
  resetActiveWorkPlane: boolean;
  blockers: readonly GeometryLabDeleteBlocker[];
  missingTargetIds: readonly string[];
}

const STORED_COLLECTIONS: readonly GeometryLabStoredCollection[] = [
  'point2d',
  'entity2d',
  'constraint2d',
  'slider2d',
  'measurement2d',
  'point3d',
  'entity3d',
  'workPlane',
  'measurement',
  'net',
  'link',
];

const GENERIC_REFERENCE_COLLECTIONS: readonly GeometryLabStoredCollection[] = [
  'point2d',
  'entity2d',
  'constraint2d',
  'slider2d',
  'measurement2d',
  'point3d',
  'entity3d',
  'workPlane',
  'measurement',
  'net',
];

const PLANE_COLLECTIONS: readonly GeometryLabStoredCollection[] = ['workPlane', 'entity3d'];

/**
 * Characters `encodeURIComponent` leaves exactly as they are. Generated ids are
 * made of these, so the common case can skip the encode entirely - and the
 * graph builder calls this once per node and twice per edge, on every edit.
 */
const UNRESERVED_ID = /^[A-Za-z0-9\-_.!~*'()]*$/;

/** Produces the stable key used by every graph index. */
export function geometryLabDependencyKey(ref: GeometryLabDependencyRef): GeometryLabDependencyKey {
  // Identical output either way: the test admits an id only when encoding it
  // would return it unchanged.
  const id = UNRESERVED_ID.test(ref.id) ? ref.id : encodeURIComponent(ref.id);
  return `${ref.collection}:${id}`;
}

/** Returns all collection-qualified durable objects with the supplied globally scoped id. */
export function geometryLabDependencyRefsForId(
  graph: GeometryLabDependencyGraph,
  id: string,
): GeometryLabDependencyRef[] {
  return (graph.keysById[id] ?? [])
    .map(key => graph.nodesByKey[key]?.ref)
    .filter((ref): ref is GeometryLabDependencyRef => ref !== undefined);
}

/**
 * Builds the reverse graph used by delete, clear, invalidation, and diagnostic code.
 * The input is read only; missing or ambiguous references are reported instead of thrown.
 */
export function buildGeometryLabDependencyGraph(snapshot: GeometryLabSnapshot): GeometryLabDependencyGraph {
  const builder = new DependencyGraphBuilder();
  populateGeometryLabDependencyGraph(builder, snapshot);
  return builder.finish();
}

/**
 * The subset of the graph the integrity check actually reads.
 *
 * <p>`checkDependencyGraph` needs three things: somewhere to look up a node's
 * path for an issue message, the forward adjacency for cycle detection, and the
 * ownership conflicts. The full graph materialises twelve indexes - six
 * adjacency records, each an array per node, plus sorted edge lists and two
 * id-keyed views - and the integrity check reads none of the other nine. On
 * every edit.
 *
 * <p>Populated by the same code as the full graph, so the two cannot drift into
 * seeing different nodes or edges.
 */
export interface GeometryLabIntegrityView {
  nodesByKey: Readonly<Record<GeometryLabDependencyKey, GeometryLabDependencyNode>>;
  /** Node keys in sorted order, so the consumer need not sort them again. */
  sortedKeys: readonly GeometryLabDependencyKey[];
  /** Forward adjacency. Nodes with no dependencies are simply absent. */
  dependenciesByKey: Readonly<Record<GeometryLabDependencyKey, readonly GeometryLabDependencyKey[]>>;
  ownershipConflicts: readonly GeometryLabOwnershipConflict[];
}

/** Builds only what the integrity check reads. See {@link GeometryLabIntegrityView}. */
export function buildGeometryLabIntegrityView(snapshot: GeometryLabSnapshot): GeometryLabIntegrityView {
  const builder = new DependencyGraphBuilder();
  populateGeometryLabDependencyGraph(builder, snapshot);
  return builder.finishIntegrityView();
}

function populateGeometryLabDependencyGraph(
  builder: DependencyGraphBuilder,
  snapshot: GeometryLabSnapshot,
): void {
  const scene2d = snapshot.scene.scene2d;
  const scene3d = snapshot.scene.scene3d;

  addRecordNodes(builder, 'point2d', scene2d.points, 'scene.scene2d.points');
  addRecordNodes(builder, 'entity2d', scene2d.entities, 'scene.scene2d.entities');
  addRecordNodes(builder, 'constraint2d', scene2d.constraints ?? {}, 'scene.scene2d.constraints');
  addRecordNodes(builder, 'slider2d', scene2d.sliders ?? {}, 'scene.scene2d.sliders');
  addRecordNodes(builder, 'measurement2d', scene2d.measurements ?? {}, 'scene.scene2d.measurements');
  addRecordNodes(builder, 'point3d', scene3d.points, 'scene.scene3d.points');
  addRecordNodes(builder, 'entity3d', scene3d.entities, 'scene.scene3d.entities');
  addRecordNodes(builder, 'workPlane', scene3d.workPlanes, 'scene.scene3d.workPlanes');
  addRecordNodes(builder, 'measurement', scene3d.measurements, 'scene.scene3d.measurements');
  addRecordNodes(builder, 'net', scene3d.nets, 'scene.scene3d.nets');
  snapshot.scene.links.forEach((link, index) => {
    builder.addStoredNode('link', link.id, `scene.links[${index}]`);
  });

  for (const point of Object.values(scene2d.points)) {
    addConstructionDependencies(builder, storedRef('point2d', point.id), point.construction);
  }
  for (const entity of Object.values(scene2d.entities)) {
    addGeometryEntityDependencies(builder, storedRef('entity2d', entity.id), entity, 'point2d');
  }
  for (const constraint of Object.values(scene2d.constraints ?? {})) {
    addConstraintDependencies(builder, constraint);
  }
  for (const measurement of Object.values(scene2d.measurements ?? {})) {
    // A 2D measurement depends on whatever it measures, so deleting a source
    // takes the measurement with it rather than leaving a dangling number.
    const dependent = storedRef('measurement2d', measurement.id);
    for (const sourceId of geometryLabMeasurement2DSourceIds(measurement.source)) {
      builder.addIdDependency(dependent, sourceId, 'measurementTarget', 'cascade', GENERIC_REFERENCE_COLLECTIONS);
    }
  }
  for (const point of Object.values(scene3d.points)) {
    addConstructionDependencies(builder, storedRef('point3d', point.id), point.construction);
  }
  for (const entity of Object.values(scene3d.entities)) {
    addEntity3DDependencies(builder, entity);
  }
  for (const plane of Object.values(scene3d.workPlanes)) {
    addWorkPlaneDependencies(builder, plane);
  }
  for (const measurement of Object.values(scene3d.measurements)) {
    addMeasurementDependencies(builder, measurement);
  }
  for (const net of Object.values(scene3d.nets)) {
    builder.addTypedDependency(
      storedRef('net', net.id),
      storedRef('entity3d', net.solidId),
      'netSolid',
      'cascade',
    );
  }
  for (const link of snapshot.scene.links) {
    const dependent = storedRef('link', link.id);
    builder.addIdDependency(dependent, link.sourceId, 'linkSource', 'cascade', GENERIC_REFERENCE_COLLECTIONS);
    builder.addIdDependency(dependent, link.targetId, 'linkTarget', 'cascade', GENERIC_REFERENCE_COLLECTIONS);
  }

  snapshot.appState.selected?.forEach((selection, index) => {
    const dependent = builder.addAppNode('appSelection', String(index), `appState.selected[${index}]`, 'prune', index);
    addSelectionDependency(builder, dependent, selection);
  });
  if (snapshot.appState.activeWorkPlaneId !== undefined) {
    const dependent = builder.addAppNode(
      'activeWorkPlane',
      'activeWorkPlaneId',
      'appState.activeWorkPlaneId',
      'reset',
    );
    builder.addTypedDependency(
      dependent,
      storedRef('workPlane', snapshot.appState.activeWorkPlaneId),
      'activeWorkPlane',
      'reset',
    );
  }
}

/**
 * Computes the transitive delete closure without changing a snapshot.
 * String targets use Phase 2's globally scoped IDs; typed refs also work for diagnostics.
 */
export function planGeometryLabCascadeDeletion(
  graph: GeometryLabDependencyGraph,
  targets: readonly (string | GeometryLabDependencyRef)[],
): GeometryLabCascadeDeletePlan {
  const scheduled = new Set<GeometryLabDependencyKey>();
  const queue: GeometryLabDependencyKey[] = [];
  const selectionIndexes = new Set<number>();
  const blockers = new Map<string, GeometryLabDeleteBlocker>();
  const missingTargetIds = new Set<string>();
  let resetActiveWorkPlane = false;

  const schedule = (key: GeometryLabDependencyKey, dependentKey?: GeometryLabDependencyKey): void => {
    const node = graph.nodesByKey[key];
    if (!node) return;
    if (node.deletePolicy === 'reject') {
      const blocker: GeometryLabDeleteBlocker = {
        key,
        ref: node.ref,
        reason: 'protectedObject',
      };
      if (dependentKey !== undefined) blocker.dependentKey = dependentKey;
      blockers.set(`protected:${key}:${dependentKey ?? ''}`, blocker);
      return;
    }
    if (node.deletePolicy === 'prune') {
      if (node.selectionIndex !== undefined) selectionIndexes.add(node.selectionIndex);
      return;
    }
    if (node.deletePolicy === 'reset') {
      resetActiveWorkPlane = true;
      return;
    }
    if (scheduled.has(key)) return;
    scheduled.add(key);
    queue.push(key);
    queue.sort(compareStrings);
  };

  for (const target of targets) {
    if (typeof target === 'string') {
      const keys = graph.keysById[target] ?? [];
      if (!keys.length) missingTargetIds.add(target);
      for (const key of keys) schedule(key);
      continue;
    }
    const key = geometryLabDependencyKey(target);
    if (!graph.nodesByKey[key]) {
      missingTargetIds.add(target.id);
      continue;
    }
    schedule(key);
  }

  const dependencyEdgesByDependency = groupDependencyEdges(graph.dependencyEdges);
  const ownershipEdgesByOwner = groupOwnershipEdges(graph.ownershipEdges);

  while (queue.length) {
    const key = queue.shift();
    if (key === undefined) break;
    for (const edge of ownershipEdgesByOwner.get(key) ?? []) {
      schedule(edge.ownedKey, key);
    }
    for (const edge of dependencyEdgesByDependency.get(key) ?? []) {
      if (edge.onDependencyDelete === 'cascade') {
        schedule(edge.dependentKey, key);
      } else if (edge.onDependencyDelete === 'prune') {
        const node = graph.nodesByKey[edge.dependentKey];
        if (node?.selectionIndex !== undefined) selectionIndexes.add(node.selectionIndex);
      } else if (edge.onDependencyDelete === 'reset') {
        resetActiveWorkPlane = true;
      } else {
        const node = graph.nodesByKey[edge.dependentKey];
        if (!node) continue;
        blockers.set(`dependent:${edge.dependentKey}:${key}`, {
          key,
          ref: graph.nodesByKey[key]?.ref ?? node.ref,
          reason: 'dependentRejectsDeletion',
          dependentKey: edge.dependentKey,
        });
      }
    }
  }

  const deleteKeys = [...scheduled].sort(compareStrings);
  const deleteRefs = deleteKeys
    .map(key => graph.nodesByKey[key]?.ref)
    .filter((ref): ref is GeometryLabDependencyRef => ref !== undefined);
  return {
    ok: blockers.size === 0,
    deleteKeys,
    deleteRefs,
    deleteIds: deleteRefs.map(ref => ref.id),
    pruneSelectionIndexes: [...selectionIndexes].sort((a, b) => a - b),
    resetActiveWorkPlane,
    blockers: [...blockers.values()].sort((a, b) => compareStrings(a.key, b.key)),
    missingTargetIds: [...missingTargetIds].sort(compareStrings),
  };
}

class DependencyGraphBuilder {
  readonly #nodes = new Map<GeometryLabDependencyKey, GeometryLabDependencyNode>();
  readonly #keysById = new Map<string, GeometryLabDependencyKey[]>();
  readonly #dependencyEdges = new Map<string, GeometryLabDependencyEdge>();
  readonly #ownershipEdges = new Map<string, GeometryLabOwnershipEdge>();
  readonly #unresolved: GeometryLabUnresolvedDependency[] = [];

  addStoredNode(collection: GeometryLabStoredCollection, id: string, path: string): GeometryLabDependencyRef {
    const ref = storedRef(collection, id);
    const key = geometryLabDependencyKey(ref);
    this.#nodes.set(key, {
      key,
      ref,
      path,
      stored: true,
      deletePolicy: collection === 'workPlane' && id === 'xy' ? 'reject' : 'delete',
    });
    const keys = this.#keysById.get(id) ?? [];
    if (!keys.includes(key)) keys.push(key);
    this.#keysById.set(id, keys);
    return ref;
  }

  addAppNode(
    collection: GeometryLabAppReferenceCollection,
    id: string,
    path: string,
    deletePolicy: Extract<GeometryLabNodeDeletePolicy, 'prune' | 'reset'>,
    selectionIndex?: number,
  ): GeometryLabDependencyRef {
    const ref: GeometryLabDependencyRef = { collection, id };
    const key = geometryLabDependencyKey(ref);
    const node: GeometryLabDependencyNode = {
      key,
      ref,
      path,
      stored: false,
      deletePolicy,
    };
    if (selectionIndex !== undefined) node.selectionIndex = selectionIndex;
    this.#nodes.set(key, node);
    return ref;
  }

  addTypedDependency(
    dependent: GeometryLabDependencyRef,
    dependency: GeometryLabDependencyRef,
    relation: GeometryLabDependencyRelation,
    policy: GeometryLabDependencyDeletePolicy,
  ): void {
    const dependentKey = geometryLabDependencyKey(dependent);
    const dependencyKey = geometryLabDependencyKey(dependency);
    if (!this.#nodes.has(dependencyKey)) {
      this.#recordUnresolved(dependentKey, dependency.id, relation, [dependency.collection as GeometryLabStoredCollection], []);
      return;
    }
    this.#addDependencyEdge({ dependentKey, dependencyKey, relation, onDependencyDelete: policy });
  }

  addIdDependency(
    dependent: GeometryLabDependencyRef,
    dependencyId: string,
    relation: GeometryLabDependencyRelation,
    policy: GeometryLabDependencyDeletePolicy,
    expectedCollections: readonly GeometryLabStoredCollection[],
  ): void {
    const dependentKey = geometryLabDependencyKey(dependent);
    const candidates = (this.#keysById.get(dependencyId) ?? [])
      .filter(key => {
        const collection = this.#nodes.get(key)?.ref.collection;
        return collection !== undefined && expectedCollections.includes(collection as GeometryLabStoredCollection);
      })
      .sort(compareStrings);
    if (candidates.length !== 1) {
      this.#recordUnresolved(dependentKey, dependencyId, relation, expectedCollections, candidates);
      return;
    }
    const dependencyKey = candidates[0];
    if (dependencyKey === undefined) return;
    this.#addDependencyEdge({ dependentKey, dependencyKey, relation, onDependencyDelete: policy });
  }

  addOwnership(
    owner: GeometryLabDependencyRef,
    owned: GeometryLabDependencyRef,
    relation: GeometryLabOwnershipRelation,
  ): void {
    const ownerKey = geometryLabDependencyKey(owner);
    const ownedKey = geometryLabDependencyKey(owned);
    if (!this.#nodes.has(ownedKey)) return;
    const edge: GeometryLabOwnershipEdge = { ownerKey, ownedKey, relation, onOwnerDelete: 'cascade' };
    this.#ownershipEdges.set(`${ownerKey}\u0000${ownedKey}\u0000${relation}`, edge);
  }

  /**
   * The integrity check's three indexes, and nothing else.
   *
   * <p>Two shortcuts are taken relative to `finish()`, and both are
   * observationally identical rather than approximations. The edge lists are
   * not sorted first, because every adjacency list is sorted after it is
   * collected, so the order edges arrive in cannot survive into the output. And
   * nodes with no dependencies are left out of `dependenciesByKey` entirely,
   * because the only consumer reads it as `dependenciesByKey[key] ?? []`, for
   * which a missing entry and an empty array are the same thing - while
   * materialising them costs an array per node.
   */
  finishIntegrityView(): GeometryLabIntegrityView {
    const sortedKeys = [...this.#nodes.keys()].sort(compareStrings);

    const dependencies = new Map<GeometryLabDependencyKey, Set<GeometryLabDependencyKey>>();
    for (const edge of this.#dependencyEdges.values()) {
      if (!this.#nodes.has(edge.dependentKey) || !this.#nodes.has(edge.dependencyKey)) continue;
      let bucket = dependencies.get(edge.dependentKey);
      if (!bucket) {
        bucket = new Set<GeometryLabDependencyKey>();
        dependencies.set(edge.dependentKey, bucket);
      }
      bucket.add(edge.dependencyKey);
    }

    const dependenciesByKey = Object.create(null) as
      Record<GeometryLabDependencyKey, readonly GeometryLabDependencyKey[]>;
    for (const key of sortedKeys) {
      const bucket = dependencies.get(key);
      if (bucket) dependenciesByKey[key] = [...bucket].sort(compareStrings);
    }

    const owners = new Map<GeometryLabDependencyKey, Set<GeometryLabDependencyKey>>();
    for (const edge of this.#ownershipEdges.values()) {
      if (!this.#nodes.has(edge.ownedKey)) continue;
      let bucket = owners.get(edge.ownedKey);
      if (!bucket) {
        bucket = new Set<GeometryLabDependencyKey>();
        owners.set(edge.ownedKey, bucket);
      }
      bucket.add(edge.ownerKey);
    }

    const ownershipConflicts: GeometryLabOwnershipConflict[] = [];
    for (const [ownedKey, ownerKeys] of owners) {
      if (ownerKeys.size <= 1) continue;
      ownershipConflicts.push({ ownedKey, ownerKeys: [...ownerKeys].sort(compareStrings) });
    }
    ownershipConflicts.sort((first, second) => compareStrings(first.ownedKey, second.ownedKey));

    return {
      nodesByKey: nodesToRecord(this.#nodes, sortedKeys),
      sortedKeys,
      dependenciesByKey,
      ownershipConflicts,
    };
  }

  finish(): GeometryLabDependencyGraph {
    const dependencyEdges = [...this.#dependencyEdges.values()].sort(compareDependencyEdges);
    const ownershipEdges = [...this.#ownershipEdges.values()].sort(compareOwnershipEdges);

    // Sorted once and reused. Every map below is keyed by node key and has to
    // come out in sorted order; building each one from its own sort meant
    // sorting the same key list six times per graph, which is most of what
    // this function used to cost.
    const sortedNodeKeys = [...this.#nodes.keys()].sort(compareStrings);

    const dependenciesByKey = initializeKeySets(sortedNodeKeys);
    const dependentsByKey = initializeKeySets(sortedNodeKeys);
    const ownedByOwnerKey = initializeKeySets(sortedNodeKeys);
    const ownersByOwnedKey = initializeKeySets(sortedNodeKeys);

    for (const edge of dependencyEdges) {
      dependenciesByKey.get(edge.dependentKey)?.add(edge.dependencyKey);
      dependentsByKey.get(edge.dependencyKey)?.add(edge.dependentKey);
    }
    for (const edge of ownershipEdges) {
      ownedByOwnerKey.get(edge.ownerKey)?.add(edge.ownedKey);
      ownersByOwnedKey.get(edge.ownedKey)?.add(edge.ownerKey);
    }

    const ownersRecord = keySetsToRecord(ownersByOwnedKey);
    const idViews = buildIdViews(this.#nodes, dependencyEdges);
    const ownershipConflicts = Object.entries(ownersRecord)
      .filter((entry): entry is [GeometryLabDependencyKey, readonly GeometryLabDependencyKey[]] => entry[1].length > 1)
      .map(([ownedKey, ownerKeys]) => ({ ownedKey, ownerKeys }))
      .sort((a, b) => compareStrings(a.ownedKey, b.ownedKey));

    return {
      nodesByKey: nodesToRecord(this.#nodes, sortedNodeKeys),
      keysById: stringArraysToRecord(this.#keysById),
      dependencyEdges,
      ownershipEdges,
      dependenciesById: idViews.dependenciesById,
      dependentsById: idViews.dependentsById,
      dependenciesByKey: keySetsToRecord(dependenciesByKey),
      dependentsByKey: keySetsToRecord(dependentsByKey),
      ownedByOwnerKey: keySetsToRecord(ownedByOwnerKey),
      ownersByOwnedKey: ownersRecord,
      unresolvedDependencies: [...this.#unresolved].sort(compareUnresolvedDependencies),
      ownershipConflicts,
    };
  }

  #addDependencyEdge(edge: GeometryLabDependencyEdge): void {
    const edgeKey = `${edge.dependentKey}\u0000${edge.dependencyKey}\u0000${edge.relation}\u0000${edge.onDependencyDelete}`;
    this.#dependencyEdges.set(edgeKey, edge);
  }

  #recordUnresolved(
    dependentKey: GeometryLabDependencyKey,
    missingId: string,
    relation: GeometryLabDependencyRelation,
    expectedCollections: readonly GeometryLabStoredCollection[],
    candidateKeys: readonly GeometryLabDependencyKey[],
  ): void {
    this.#unresolved.push({
      dependentKey,
      missingId,
      relation,
      reason: candidateKeys.length ? 'ambiguous' : 'missing',
      expectedCollections: [...expectedCollections],
      candidateKeys: [...candidateKeys],
    });
  }
}

function buildIdViews(
  nodes: ReadonlyMap<GeometryLabDependencyKey, GeometryLabDependencyNode>,
  edges: readonly GeometryLabDependencyEdge[],
): {
  dependenciesById: Record<string, readonly string[]>;
  dependentsById: Record<string, readonly string[]>;
} {
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  for (const node of nodes.values()) {
    if (!node.stored) continue;
    dependencies.set(node.ref.id, dependencies.get(node.ref.id) ?? new Set());
    dependents.set(node.ref.id, dependents.get(node.ref.id) ?? new Set());
  }
  for (const edge of edges) {
    const dependent = nodes.get(edge.dependentKey);
    const dependency = nodes.get(edge.dependencyKey);
    if (!dependent?.stored || !dependency?.stored) continue;
    dependencies.get(dependent.ref.id)?.add(dependency.ref.id);
    dependents.get(dependency.ref.id)?.add(dependent.ref.id);
  }
  return {
    dependenciesById: stringSetsToRecord(dependencies),
    dependentsById: stringSetsToRecord(dependents),
  };
}

function addRecordNodes<T extends { id: string }>(
  builder: DependencyGraphBuilder,
  collection: GeometryLabStoredCollection,
  record: Record<string, T>,
  path: string,
): void {
  for (const [key, value] of Object.entries(record)) {
    builder.addStoredNode(collection, value.id, `${path}.${key}`);
  }
}

function addGeometryEntityDependencies(
  builder: DependencyGraphBuilder,
  dependent: GeometryLabDependencyRef,
  entity: GeometryEntity,
  pointCollection: Extract<GeometryLabStoredCollection, 'point2d' | 'point3d'>,
): void {
  for (const pointId of geometryEntityPointIds(entity)) {
    builder.addTypedDependency(dependent, storedRef(pointCollection, pointId), 'entityPoint', 'cascade');
  }
  if (entity.kind === 'relationMarker') {
    for (const targetId of entity.targetIds) {
      builder.addIdDependency(dependent, targetId, 'relationTarget', 'cascade', GENERIC_REFERENCE_COLLECTIONS);
    }
  }
  addConstructionDependencies(builder, dependent, entity.construction);
}

function addConstructionDependencies(
  builder: DependencyGraphBuilder,
  dependent: GeometryLabDependencyRef,
  construction: GeometryEntity['construction'],
): void {
  for (const sourceId of geometryConstructionSourceIds(construction)) {
    builder.addIdDependency(dependent, sourceId, 'constructionSource', 'cascade', GENERIC_REFERENCE_COLLECTIONS);
  }
}

/** Every object a 2D measurement is computed from. */
export function geometryLabMeasurement2DSourceIds(source: MeasurementSource2D): string[] {
  switch (source.kind) {
    case 'pointDistance':
      return [source.firstPointId, source.secondPointId];
    case 'segmentLength':
    case 'polygonArea':
    case 'polygonPerimeter':
      return [source.entityId];
    case 'pointLineDistance':
      return [source.pointId, source.entityId];
    case 'angle':
      return [...source.pointIds];
  }
}

function addConstraintDependencies(builder: DependencyGraphBuilder, constraint: GeometryConstraint): void {
  const dependent = storedRef('constraint2d', constraint.id);
  const collection: GeometryLabStoredCollection = constraint.kind === 'parallel'
    || constraint.kind === 'perpendicular'
    || constraint.kind === 'equalRadius'
    ? 'entity2d'
    : 'point2d';
  const relation: GeometryLabDependencyRelation = collection === 'entity2d' ? 'constraintEntity' : 'constraintPoint';
  for (const id of geometryConstraintDependencies(constraint)) {
    builder.addTypedDependency(dependent, storedRef(collection, id), relation, 'cascade');
  }
}

function addEntity3DDependencies(builder: DependencyGraphBuilder, entity: GeometryEntity3D): void {
  const dependent = storedRef('entity3d', entity.id);
  if (entity.kind === 'surface3d' || entity.kind === 'curve3d') return;
  if (entity.kind === 'solid') {
    for (const pointId of entity.pointIds) {
      const point = storedRef('point3d', pointId);
      builder.addTypedDependency(dependent, point, 'solidPoint', 'cascade');
      builder.addOwnership(dependent, point, 'solidMeshPoint');
    }
    return;
  }
  if (entity.kind === 'crossSection') {
    builder.addTypedDependency(dependent, storedRef('entity3d', entity.solidId), 'crossSectionSolid', 'cascade');
    if (entity.planeId !== undefined) {
      builder.addIdDependency(dependent, entity.planeId, 'crossSectionPlane', 'cascade', PLANE_COLLECTIONS);
    }
    for (const pointId of entity.pointIds) {
      const point = storedRef('point3d', pointId);
      builder.addTypedDependency(dependent, point, 'crossSectionPoint', 'cascade');
      builder.addOwnership(dependent, point, 'crossSectionPoint');
    }
    return;
  }
  addGeometryEntityDependencies(builder, dependent, entity, 'point3d');
}

function addWorkPlaneDependencies(builder: DependencyGraphBuilder, plane: WorkPlane3D): void {
  const dependent = storedRef('workPlane', plane.id);
  const source = plane.source;
  if (!source) return;
  if (source.kind === 'threePoints') {
    for (const pointId of source.pointIds) {
      builder.addTypedDependency(dependent, storedRef('point3d', pointId), 'workPlanePoint', 'cascade');
    }
  } else if (source.kind === 'perpendicularLine') {
    builder.addTypedDependency(
      dependent,
      storedRef('entity3d', source.sourceEntityId),
      'workPlaneEntity',
      'cascade',
    );
  } else if (source.kind === 'parallelPlane' || source.kind === 'perpendicularPlane') {
    builder.addIdDependency(dependent, source.sourcePlaneId, 'workPlanePlane', 'cascade', PLANE_COLLECTIONS);
  }

  const throughPointId = stringProperty(source, 'throughPointId');
  if (throughPointId !== undefined) {
    builder.addTypedDependency(
      dependent,
      storedRef('point3d', throughPointId),
      'workPlaneThroughPoint',
      'cascade',
    );
  }
}

function addMeasurementDependencies(builder: DependencyGraphBuilder, measurement: Measurement3D): void {
  const dependent = storedRef('measurement', measurement.id);
  builder.addIdDependency(
    dependent,
    measurement.targetId,
    'measurementTarget',
    'cascade',
    GENERIC_REFERENCE_COLLECTIONS,
  );
  if (measurement.kind !== 'dihedral') {
    for (const targetId of measurement.targetIds ?? []) {
      builder.addIdDependency(
        dependent,
        targetId,
        'measurementTarget',
        'cascade',
        GENERIC_REFERENCE_COLLECTIONS,
      );
    }
  }

  const source = recordProperty(measurement, 'source');
  if (!source) return;
  const pointId = stringProperty(source, 'pointId');
  const planeId = stringProperty(source, 'planeId');
  const solidId = stringProperty(source, 'solidId');
  if (pointId !== undefined) {
    builder.addTypedDependency(dependent, storedRef('point3d', pointId), 'measurementPoint', 'cascade');
  }
  if (planeId !== undefined) {
    builder.addIdDependency(dependent, planeId, 'measurementPlane', 'cascade', PLANE_COLLECTIONS);
  }
  if (solidId !== undefined) {
    builder.addTypedDependency(dependent, storedRef('entity3d', solidId), 'measurementSolid', 'cascade');
  }
}

function addSelectionDependency(
  builder: DependencyGraphBuilder,
  dependent: GeometryLabDependencyRef,
  selection: GeometrySelection,
): void {
  if (selection.kind === 'face' || selection.kind === 'edge') {
    builder.addTypedDependency(dependent, storedRef('entity3d', selection.solidId), 'selectionTarget', 'prune');
    return;
  }
  builder.addTypedDependency(dependent, storedRef(selection.kind, selection.id), 'selectionTarget', 'prune');
}

function storedRef(collection: GeometryLabStoredCollection, id: string): GeometryLabDependencyRef {
  return { collection, id };
}

function recordProperty(value: object, key: string): Record<string, unknown> | undefined {
  if (!(key in value)) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : undefined;
}

function stringProperty(value: object, key: string): string | undefined {
  if (!(key in value)) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

/**
 * Builds the empty adjacency map in sorted key order.
 *
 * <p>Takes keys that are **already sorted**. Map preserves insertion order, so
 * every record derived from one of these maps is emitted in sorted order
 * without sorting again - which is what lets `keySetsToRecord` below skip its
 * own key sort.
 */
function initializeKeySets(
  sortedKeys: readonly GeometryLabDependencyKey[],
): Map<GeometryLabDependencyKey, Set<GeometryLabDependencyKey>> {
  const map = new Map<GeometryLabDependencyKey, Set<GeometryLabDependencyKey>>();
  for (const key of sortedKeys) map.set(key, new Set<GeometryLabDependencyKey>());
  return map;
}

/** Emits nodes in the supplied sorted key order rather than sorting again. */
function nodesToRecord<T>(
  map: ReadonlyMap<GeometryLabDependencyKey, T>,
  sortedKeys: readonly GeometryLabDependencyKey[],
): Record<GeometryLabDependencyKey, T> {
  const record = Object.create(null) as Record<GeometryLabDependencyKey, T>;
  for (const key of sortedKeys) {
    const value = map.get(key);
    if (value !== undefined) record[key] = value;
  }
  return record;
}

function stringArraysToRecord(
  map: ReadonlyMap<string, readonly GeometryLabDependencyKey[]>,
): Record<string, readonly GeometryLabDependencyKey[]> {
  const record = Object.create(null) as Record<string, readonly GeometryLabDependencyKey[]>;
  for (const [key, values] of [...map.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    record[key] = [...values].sort(compareStrings);
  }
  return record;
}

/**
 * Emits an adjacency record from a map already in sorted key order - which is
 * what `initializeKeySets` guarantees. Values are still sorted; only the
 * redundant key sort is gone.
 */
function keySetsToRecord(
  map: ReadonlyMap<GeometryLabDependencyKey, ReadonlySet<GeometryLabDependencyKey>>,
): Record<GeometryLabDependencyKey, readonly GeometryLabDependencyKey[]> {
  const record = Object.create(null) as Record<GeometryLabDependencyKey, readonly GeometryLabDependencyKey[]>;
  for (const [key, values] of map) {
    record[key] = [...values].sort(compareStrings);
  }
  return record;
}

function stringSetsToRecord(map: ReadonlyMap<string, ReadonlySet<string>>): Record<string, readonly string[]> {
  const record = Object.create(null) as Record<string, readonly string[]>;
  for (const [key, values] of [...map.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    record[key] = [...values].sort(compareStrings);
  }
  return record;
}

function groupDependencyEdges(
  edges: readonly GeometryLabDependencyEdge[],
): Map<GeometryLabDependencyKey, GeometryLabDependencyEdge[]> {
  const result = new Map<GeometryLabDependencyKey, GeometryLabDependencyEdge[]>();
  for (const edge of edges) {
    const values = result.get(edge.dependencyKey) ?? [];
    values.push(edge);
    result.set(edge.dependencyKey, values);
  }
  return result;
}

function groupOwnershipEdges(
  edges: readonly GeometryLabOwnershipEdge[],
): Map<GeometryLabDependencyKey, GeometryLabOwnershipEdge[]> {
  const result = new Map<GeometryLabDependencyKey, GeometryLabOwnershipEdge[]>();
  for (const edge of edges) {
    const values = result.get(edge.ownerKey) ?? [];
    values.push(edge);
    result.set(edge.ownerKey, values);
  }
  return result;
}

/**
 * Compared field by field rather than by joining each edge into one string.
 *
 * <p>Exactly the same ordering. The NUL separator sorts below every other
 * character and appears in none of these fields, so a joined comparison and a
 * field-wise one agree on every pair. What changes is that sorting E edges no
 * longer allocates two strings per comparison - O(E log E) throwaway strings on
 * every graph build, and the graph is rebuilt on every edit.
 */
function compareDependencyEdges(a: GeometryLabDependencyEdge, b: GeometryLabDependencyEdge): number {
  return compareStrings(a.dependencyKey, b.dependencyKey)
    || compareStrings(a.dependentKey, b.dependentKey)
    || compareStrings(a.relation, b.relation)
    || compareStrings(a.onDependencyDelete, b.onDependencyDelete);
}

/** Field-wise for the same reason as `compareDependencyEdges` above. */
function compareOwnershipEdges(a: GeometryLabOwnershipEdge, b: GeometryLabOwnershipEdge): number {
  return compareStrings(a.ownerKey, b.ownerKey)
    || compareStrings(a.ownedKey, b.ownedKey)
    || compareStrings(a.relation, b.relation);
}

function compareUnresolvedDependencies(a: GeometryLabUnresolvedDependency, b: GeometryLabUnresolvedDependency): number {
  return compareStrings(
    `${a.dependentKey}\u0000${a.missingId}\u0000${a.relation}`,
    `${b.dependentKey}\u0000${b.missingId}\u0000${b.relation}`,
  );
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compile-time aid for code that needs to enumerate all durable collections. */
export function geometryLabStoredCollections(): readonly GeometryLabStoredCollection[] {
  return STORED_COLLECTIONS;
}
