export * from './core/index.js';

export {
  createMathCore,
} from './math/index.js';
export type {
  BinaryNode,
  EquationNode,
  FunctionCallNode,
  InequalityNode,
  MathCore,
  MathEvaluateOptions,
  MathNode,
  MathParseResult,
  MathValue,
  MatrixNode,
  NumberNode,
  SymbolNode,
  UnaryNode,
  VectorNode,
} from './math/index.js';

export {
  buildGeometryDependencyGraph,
  buildGeometryObjectPanelRows,
  createEmptyGeometryScene,
  distance2D,
  geometryAngleBisectorPoint2D,
  geometryCircleTangentPoint2D,
  geometryConstraintDependencies,
  geometryConstructionSourceIds,
  geometryCircumcircle2D,
  geometryDependentsOf,
  geometryEntityPointIds,
  geometryIntersectionPoint2D,
  geometryIntersectionPoints2D,
  geometryLine3DForEntity,
  geometryLineLikeIntersection2D,
  geometryLinePlaneIntersection3D,
  geometryObjectDependencies,
  geometryPlaneEquation3D,
  geometryPlanePlaneIntersection3D,
  lineEquationFrom2DPoints,
  midpoint2D,
  normalizeGeometryLineEquation,
  normalizeGeometryPlaneEquation3D,
  planeEquationFrom3DPoints,
  recomputeGeometryDependents,
  recomputeGeometryScene,
  summarizeGeometryConstraints,
  summarizeGeometryObjects,
} from './geometry-core/index.js';
export type {
  AngleEntity,
  ArcEntity,
  CircleEntity,
  GeometryConstraint,
  GeometryConstraintSummary,
  GeometryConstruction,
  GeometryCoreSnapshot,
  GeometryDependencyGraph,
  GeometryDimension,
  GeometryEntity,
  GeometryEntityDisplay,
  GeometryLine3D,
  GeometryLineEquation,
  GeometryObjectPanelOptions,
  GeometryObjectPanelRow,
  GeometryObjectSummary,
  GeometryObjectSummaryOptions,
  GeometryPoint,
  GeometryPoint2D,
  GeometryPoint3D,
  GeometryPlaneEquation3D,
  GeometryScene,
  LineEntity,
  LocusEntity,
  PlaneEntity,
  PolygonEntity,
  RayEntity,
  SegmentEntity,
  VectorEntity,
} from './geometry-core/index.js';

export {
  angleMeasureDegrees,
  applyGeometryCalculatorDelta,
  clampGeometryZoom,
  createEmptyGeometryCalculatorSnapshot,
  createGeometryCalculator,
  geometryWorldToScreen,
  lineEquationFromPoints,
  parseGeometryLineEquation,
  screenToGeometryWorld,
} from './geometry/index.js';
export type {
  AngleCreationOptions,
  GeometryCalculator,
  GeometryCalculatorAppState,
  GeometryCalculatorDelta,
  GeometryCalculatorOptions,
  GeometryCalculatorScene,
  GeometryCalculatorSelection,
  GeometryCalculatorSnapshot,
  GeometryCalculatorTheme,
  GeometryCalculatorThemeInput,
  GeometryCalculatorThemeName,
  GeometryCalculatorTool,
  GeometryConstraintDraft,
  GeometryGridOptions,
  GeometryLocusOptions,
  GeometryShapeKind,
  GeometryStyleOptions,
  ShapeCreationOptions,
} from './geometry/index.js';

export {
  createEmptyWhiteboardSnapshot,
  createWhiteboard,
} from './whiteboard/index.js';
export type {
  LineElement,
  ShapeElement,
  StickyElement,
  StrokeElement,
  TextElement,
  WhiteboardAppState,
  WhiteboardDelta,
  WhiteboardElement,
  WhiteboardElementBase,
  WhiteboardOptions,
  WhiteboardScene,
  WhiteboardSnapshot,
  WhiteboardTool,
} from './whiteboard/index.js';

export {
  createEmptyGeometryLabSnapshot,
  createGeometryLab,
  defaultGeometryCamera3D,
} from './geometry-lab/index.js';
export type {
  CrossSectionEntity,
  GeometryEntity3D,
  GeometryLabAppState,
  GeometryLabDelta,
  GeometryLabOptions,
  GeometryLabScene,
  GeometryLabSnapshot,
  GeometryLabTool,
  GeometryScene2D,
  GeometryScene3D,
  GeometrySceneLink,
  GeometrySelection,
  Measurement3D,
  SolidEntity,
  WorkPlane3D,
} from './geometry-lab/index.js';

export {
  createEmptyGraphingSnapshot,
  createGraphingCalculator,
} from './graphing/index.js';
export type {
  GraphExpression,
  GraphPoint,
  GraphViewport,
  GraphingAppState,
  GraphingDelta,
  GraphingOptions,
  GraphingScene,
  GraphingSnapshot,
  GraphingTool,
} from './graphing/index.js';

export {
  createAlgebraLab,
  createEmptyAlgebraSnapshot,
} from './algebra/index.js';
export type {
  AlgebraAppState,
  AlgebraDelta,
  AlgebraEntry,
  AlgebraOptions,
  AlgebraScene,
  AlgebraSnapshot,
  AlgebraStep,
  AlgebraTool,
} from './algebra/index.js';

export {
  createEmptyCalculatorSnapshot,
  createScientificCalculator,
} from './calculator/index.js';
export type {
  CalculatorAppState,
  CalculatorDelta,
  CalculatorEntry,
  CalculatorOptions,
  CalculatorScene,
  CalculatorSnapshot,
  CalculatorTool,
} from './calculator/index.js';

export {
  createEmptyProbabilitySnapshot,
  createProbabilityExplorer,
} from './probability/index.js';
export type {
  DistributionKind,
  DistributionModel,
  ProbabilityAppState,
  ProbabilityDelta,
  ProbabilityOptions,
  ProbabilityScene,
  ProbabilitySnapshot,
  ProbabilityTool,
} from './probability/index.js';

export {
  createEmptySpreadsheetSnapshot,
  createSpreadsheet,
} from './spreadsheet/index.js';
export type {
  SpreadsheetAppState,
  SpreadsheetCell,
  SpreadsheetDelta,
  SpreadsheetOptions,
  SpreadsheetScene,
  SpreadsheetSnapshot,
  SpreadsheetTool,
} from './spreadsheet/index.js';

export {
  createEmptyWorkspaceSnapshot,
  createMathWorkspace,
} from './workspace/index.js';
export type {
  WorkspaceAppState,
  WorkspaceDelta,
  WorkspaceLink,
  WorkspaceOptions,
  WorkspacePanel,
  WorkspaceScene,
  WorkspaceSnapshot,
  WorkspaceTool,
} from './workspace/index.js';

export {
  bindCollaboration,
} from './collab/index.js';
export type {
  CollaborationBinding,
  CollaborationOptions,
  CollaborationTransport,
  PresenceEvent,
} from './collab/index.js';

export {
  defineKleinElements,
  KLEIN_ELEMENT_TAGS,
} from './dom/index.js';

export {
  createEmbedUrl,
  createHostBridge,
  parseEmbedSearchParams,
} from './embed/index.js';
export type {
  EmbeddedLaunchContext,
  EmbeddedMode,
  EmbeddedPlatform,
  EmbeddedToolKind,
  EmbedUrlOptions,
  HostBridge,
  HostBridgeMessage,
  HostBridgeOptions,
} from './embed/index.js';

export {
  createClassroomAddonRouteConfig,
  createClassroomIframeUrl,
  createTeamsManifestTemplate,
  createTeamsTabUrl,
  modeForClassroomIframe,
  TEAMS_MANIFEST_VERSION,
} from './integrations/index.js';
export type {
  ClassroomAddonRouteConfig,
  ClassroomAttachment,
  ClassroomIframeKind,
  ClassroomLaunchContext,
  ClassroomRole,
  ClassroomUrlOptions,
  TeamsLaunchContext,
  TeamsManifestDeveloper,
  TeamsManifestOptions,
  TeamsManifestTemplate,
  TeamsSurface,
  TeamsTabUrlOptions,
} from './integrations/index.js';
