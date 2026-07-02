import { createEmptyGeometryScene } from '../geometry-core/index.js';
import { createStubInstrument } from '../core/index.js';
import type {
  Camera3DState,
  InstrumentOptions,
  InstrumentSnapshot,
  KleinInstrument,
  View2D,
} from '../core/index.js';
import type { GeometryEntity, GeometryPoint2D, GeometryPoint3D, GeometryScene } from '../geometry-core/index.js';

/** Guided Geometry Lab tools. These are classroom-oriented, not full CAD commands. */
export type GeometryLabTool =
  | 'select'
  | 'pan'
  | 'orbit'
  | 'point'
  | 'segment'
  | 'polygon'
  | 'circle'
  | 'angle'
  | 'stamp'
  | 'midpoint'
  | 'perpendicular'
  | 'parallel'
  | 'bisector'
  | 'label'
  | 'color'
  | 'hide'
  | 'cut'
  | 'scale'
  | 'rotate'
  | 'solid'
  | 'workPlane'
  | 'crossSection'
  | 'net'
  | 'remove';

/** 2D Geometry Lab scene; currently extends the shared geometry graph with a scene discriminator. */
export interface GeometryScene2D extends GeometryScene {
  kind: 'geometry-lab-2d';
}

/** 3D Geometry Lab scene content. Camera state stays in app state, not here. */
export interface GeometryScene3D {
  kind: 'geometry-lab-3d';
  points: Record<string, GeometryPoint3D>;
  entities: Record<string, GeometryEntity3D>;
  workPlanes: Record<string, WorkPlane3D>;
  measurements: Record<string, Measurement3D>;
}

/** Geometry entities that can appear in the 3D scene graph. */
export type GeometryEntity3D = GeometryEntity | SolidEntity | CrossSectionEntity;

/** Plane used for placement, snapping, and drawing in the movable 3D space. */
export interface WorkPlane3D {
  id: string;
  origin: [number, number, number];
  normal: [number, number, number];
  xAxis: [number, number, number];
  label?: string;
}

/** Educational 3D solid. Detailed mesh/face records will be added as the 3D engine matures. */
export interface SolidEntity {
  id: string;
  kind: 'solid';
  solid:
    | 'cube'
    | 'cuboid'
    | 'tetrahedron'
    | 'prism'
    | 'pyramid'
    | 'cylinder'
    | 'cone'
    | 'sphere'
    | 'hemisphere'
    | 'polyhedron';
  pointIds: string[];
  faceIds: string[];
}

/** Persisted cross-section produced by slicing a solid with a plane. */
export interface CrossSectionEntity {
  id: string;
  kind: 'crossSection';
  solidId: string;
  pointIds: string[];
  area?: number;
}

/** Cached or persisted measurement attached to a 3D target. */
export interface Measurement3D {
  id: string;
  targetId: string;
  kind: 'length' | 'area' | 'surfaceArea' | 'volume' | 'angle' | 'dihedral';
  value: number;
}

/** Link between 2D and 3D content, such as a net folded into a solid. */
export interface GeometrySceneLink {
  id: string;
  kind: 'netToSolid' | 'extrusion' | 'projection';
  sourceId: string;
  targetId: string;
}

/** Full Geometry Lab lesson content, keeping 2D and 3D scenes side by side. */
export interface GeometryLabScene {
  scene2d: GeometryScene2D;
  scene3d: GeometryScene3D;
  links: GeometrySceneLink[];
}

/** UI state for Geometry Lab, including movable 3D camera and active work plane. */
export interface GeometryLabAppState {
  activeView: '2d' | '3d' | 'split';
  view2d: View2D;
  view3d: Camera3DState;
  activeTool?: GeometryLabTool;
  activeWorkPlaneId?: string;
  selected?: GeometrySelection[];
}

/** Selection model for points, entities, and 3D sub-selections. */
export type GeometrySelection =
  | { kind: 'point2d'; id: string }
  | { kind: 'point3d'; id: string }
  | { kind: 'entity2d'; id: string }
  | { kind: 'entity3d'; id: string }
  | { kind: 'face'; solidId: string; faceId: string }
  | { kind: 'edge'; solidId: string; edgeId: string };

/** Versioned Geometry Lab snapshot for persistence and collaboration. */
export type GeometryLabSnapshot = InstrumentSnapshot<GeometryLabScene, GeometryLabAppState> & {
  version: 1;
  instrument: 'geometry-lab';
};

/** Semantic Geometry Lab edit operations. Camera changes intentionally are not scene deltas. */
export type GeometryLabDelta =
  | { op: 'addPoint2D'; point: GeometryPoint2D }
  | { op: 'addPoint3D'; point: GeometryPoint3D }
  | { op: 'updatePoint'; id: string; changes: Partial<GeometryPoint2D | GeometryPoint3D> }
  | { op: 'addEntity2D'; entity: GeometryEntity }
  | { op: 'addEntity3D'; entity: GeometryEntity3D }
  | { op: 'updateEntity'; id: string; changes: Partial<GeometryEntity | GeometryEntity3D> }
  | { op: 'delete'; ids: string[] }
  | { op: 'setSceneLink'; link: GeometrySceneLink }
  | { op: 'clear2D' }
  | { op: 'clear3D' }
  | { op: 'clearAll' }
  | { op: 'batch'; deltas: GeometryLabDelta[] };

/** Geometry Lab factory options layered over the common instrument options. */
export type GeometryLabOptions = InstrumentOptions<GeometryLabSnapshot, GeometryLabDelta> & {
  initialView?: GeometryLabAppState['activeView'];
  renderer3d?: 'webgl' | 'svg' | 'auto';
  snapEnabled?: boolean;
};

/** Default z-up camera for the movable 3D scene. */
export function defaultGeometryCamera3D(): Camera3DState {
  return {
    position: [8, -8, 6],
    target: [0, 0, 0],
    up: [0, 0, 1],
    fov: 45,
    zoom: 1,
    projection: 'perspective',
  };
}

/** Creates a blank Geometry Lab document with an empty 2D scene and an XY work plane in 3D. */
export function createEmptyGeometryLabSnapshot(): GeometryLabSnapshot {
  return {
    version: 1,
    instrument: 'geometry-lab',
    scene: {
      scene2d: {
        kind: 'geometry-lab-2d',
        ...createEmptyGeometryScene(),
      },
      scene3d: {
        kind: 'geometry-lab-3d',
        points: {},
        entities: {},
        workPlanes: {
          xy: {
            id: 'xy',
            origin: [0, 0, 0],
            normal: [0, 0, 1],
            xAxis: [1, 0, 0],
            label: 'XY',
          },
        },
        measurements: {},
      },
      links: [],
    },
    appState: {
      activeView: '2d',
      view2d: { x: 0, y: 0, zoom: 1 },
      view3d: defaultGeometryCamera3D(),
      activeTool: 'select',
      activeWorkPlaneId: 'xy',
    },
  };
}

/** Creates the current Geometry Lab scaffold instrument. Rendering and geometry engines are pending. */
export function createGeometryLab(
  options: GeometryLabOptions = {},
): KleinInstrument<GeometryLabSnapshot, GeometryLabDelta, GeometryLabTool> {
  return createStubInstrument({
    kind: 'geometry-lab',
    initialSnapshot: createEmptyGeometryLabSnapshot(),
    defaultTool: 'select',
    options,
  });
}
