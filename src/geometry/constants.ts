import type { GeometryCalculatorTheme, GeometryCalculatorTool, GeometrySnapModes, GeometrySnapSettings } from './types.js';

export const DEFAULT_DRAW_COLOR = '#2563eb';

export const DEFAULT_POINT_COLOR = '#111827';

export const DEFAULT_FILL = 'rgba(37, 99, 235, 0.12)';

export const DEFAULT_WIDTH = 2;

export const DEFAULT_UNIT_SIZE = 40;

export const GEOMETRY_TOOL_CATALOG: Array<{
  tool: GeometryCalculatorTool;
  label: string;
  shortcut?: string;
  description: string;
}> = [
  { tool: 'select', label: 'Select', shortcut: 'V', description: 'Select, move, and edit existing objects.' },
  { tool: 'pan', label: 'Pan', shortcut: 'M', description: 'Move through the canvas without changing geometry.' },
  { tool: 'point', label: 'Point', shortcut: 'P', description: 'Place a free point by clicking or coordinates.' },
  { tool: 'midpoint', label: 'Midpoint', description: 'Create a linked midpoint between two points.' },
  { tool: 'intersect', label: 'Intersect', description: 'Create intersection points between supported objects.' },
  { tool: 'segment', label: 'Segment', shortcut: 'S', description: 'Draw a finite segment between two points.' },
  { tool: 'line', label: 'Line', shortcut: 'L', description: 'Draw an infinite line from points or equation.' },
  { tool: 'ray', label: 'Ray', shortcut: 'R', description: 'Draw a ray from an endpoint through a second point.' },
  { tool: 'vector', label: 'Vector', shortcut: 'U', description: 'Draw a directed vector between two points.' },
  { tool: 'parallel', label: 'Parallel', description: 'Construct a parallel line through a point.' },
  { tool: 'perpendicular', label: 'Perp', description: 'Construct a perpendicular line through a point.' },
  { tool: 'tangent', label: 'Tangent', description: 'Construct tangent lines from a point to a circle.' },
  { tool: 'angleBisector', label: 'Bisector', description: 'Construct an angle bisector from three points.' },
  { tool: 'polygon', label: 'Polygon', shortcut: 'G', description: 'Create a closed polygon from clicked vertices.' },
  { tool: 'circle', label: 'Circle', shortcut: 'C', description: 'Create a circle from center and radius.' },
  { tool: 'circleThroughPoints', label: 'Circle 3pt', description: 'Create a circle through three non-collinear points.' },
  { tool: 'arc', label: 'Arc', description: 'Create an arc from center, start, and end points.' },
  { tool: 'conic', label: 'Conic', shortcut: 'K', description: 'Create ellipses, parabolas, and hyperbolas.' },
  { tool: 'parametricCurve', label: 'Param', shortcut: 'Q', description: 'Create a sampled parametric curve.' },
  { tool: 'angle', label: 'Angle', shortcut: 'A', description: 'Mark or create an angle.' },
  { tool: 'triangle', label: 'Triangle', description: 'Create a triangle preset.' },
  { tool: 'rectangle', label: 'Rect', description: 'Create a rectangle preset.' },
  { tool: 'square', label: 'Square', description: 'Create a square preset.' },
  { tool: 'regularPolygon', label: 'Regular', description: 'Create a regular polygon preset.' },
  { tool: 'remove', label: 'Remove', shortcut: 'X', description: 'Delete objects by clicking them.' },
];

export const DEFAULT_SNAP_MODES: GeometrySnapModes = {
  grid: true,
  points: true,
  midpoints: true,
  intersections: true,
  axes: true,
  angles: false,
  shapeEdges: true,
};

export const DEFAULT_SNAP_SETTINGS: GeometrySnapSettings = {
  enabled: true,
  strength: 0.85,
  showMarkers: true,
  modes: DEFAULT_SNAP_MODES,
};

export const MIN_ZOOM = 0.2;

export const MAX_ZOOM = 8;

export const HIT_TOLERANCE_PX = 10;

export const POINT_RADIUS_PX = 5;

export const CONSTRAINT_SOLVER_ITERATIONS = 6;

export const SVG_NS = 'http://www.w3.org/2000/svg';


export const LIGHT_GEOMETRY_CALCULATOR_THEME: GeometryCalculatorTheme = {
  name: 'light',
  colorScheme: 'light',
  background: '#f5f5f5',
  surface: '#f5f5f5',
  surfaceRaised: '#ffffff',
  canvas: '#ffffff',
  border: '#dadfe0',
  text: '#303841',
  mutedText: '#5e6770',
  faintText: '#8a939b',
  inputBackground: '#ffffff',
  buttonBackground: '#ffffff',
  buttonText: '#303841',
  buttonBorder: '#dadfe0',
  buttonActiveBackground: '#ff5722',
  buttonActiveText: '#ffffff',
  accent: '#ff5722',
  drawColor: '#76abae',
  pointColor: '#303841',
  fill: 'rgba(118, 171, 174, 0.16)',
  selection: '#ff5722',
  gridMinor: '#e9eced',
  gridMajor: '#dadfe0',
  axis: '#5e6770',
  gridLabel: '#5e6770',
  draft: '#76abae',
  textHalo: 'rgba(255,255,255,0.9)',
  angle: '#f97316',
  angleText: '#92400e',
};


export const DARK_GEOMETRY_CALCULATOR_THEME: GeometryCalculatorTheme = {
  name: 'dark',
  colorScheme: 'dark',
  background: '#1e242a',
  surface: '#252b31',
  surfaceRaised: '#303841',
  canvas: '#111923',
  border: '#414b55',
  text: '#f5f5f5',
  mutedText: '#a9b2ba',
  faintText: '#7e878f',
  inputBackground: '#252b31',
  buttonBackground: '#303841',
  buttonText: '#f5f5f5',
  buttonBorder: '#4b5563',
  buttonActiveBackground: '#ff6a3d',
  buttonActiveText: '#ffffff',
  accent: '#ff6a3d',
  drawColor: '#76abae',
  pointColor: '#f5f5f5',
  fill: 'rgba(118, 171, 174, 0.16)',
  selection: '#ff8a65',
  gridMinor: '#1d2733',
  gridMajor: '#2a3543',
  axis: '#7e878f',
  gridLabel: '#98a2b0',
  draft: '#9cc4c6',
  textHalo: 'rgba(17, 25, 35, 0.92)',
  angle: '#ff8a65',
  angleText: '#ffbd9e',
};

