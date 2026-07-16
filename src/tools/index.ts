import type {
  DeltaMeta,
  InstrumentOptions,
  KleinToolKey,
  KleinToolRuntime,
  ToolCommand,
  ValidationResult,
} from '../core/index.js';
import { KleinSdkError } from '../core/index.js';
import {
  createGraphingRuntime,
  validateGraphingSnapshot,
} from '../graphing/index.js';
import type {
  GraphingDelta,
  GraphingOptions,
  GraphingSnapshot,
} from '../graphing/index.js';
import {
  createGeometryLabRuntime,
  validateGeometryLabSnapshot,
} from '../geometry-lab/index.js';
import type {
  GeometryLabCommand,
  GeometryLabDelta,
  GeometryLabOptions,
  GeometryLabSnapshot,
} from '../geometry-lab/index.js';
import {
  createScientificCalculatorRuntime,
  validateCalculatorSnapshot,
} from '../calculator/index.js';
import type {
  CalculatorDelta,
  CalculatorOptions,
  CalculatorSnapshot,
} from '../calculator/index.js';
import {
  createProbabilityRuntime,
  validateProbabilitySnapshot,
} from '../probability/index.js';
import type {
  ProbabilityDelta,
  ProbabilityOptions,
  ProbabilitySnapshot,
} from '../probability/index.js';
import {
  createWhiteboardRuntime,
  validateWhiteboardSnapshot,
} from '../whiteboard/index.js';
import type {
  WhiteboardDelta,
  WhiteboardOptions,
  WhiteboardSnapshot,
} from '../whiteboard/index.js';

export type AnyKleinToolSnapshot =
  | GraphingSnapshot
  | GeometryLabSnapshot
  | CalculatorSnapshot
  | ProbabilitySnapshot
  | WhiteboardSnapshot;

export type AnyKleinToolDelta =
  | GraphingDelta
  | GeometryLabDelta
  | CalculatorDelta
  | ProbabilityDelta
  | WhiteboardDelta;

export type AnyKleinToolRuntime = KleinToolRuntime<AnyKleinToolSnapshot, AnyKleinToolDelta, ToolCommand | GeometryLabCommand>;

export type KleinToolAlias =
  | KleinToolKey
  | 'geogebra-graphing'
  | 'geogebra-3d'
  | 'geogebra-scientific'
  | 'geogebra-probability'
  | 'calculator-grafic'
  | 'geometrie-3d'
  | 'calculator-stiintific'
  | 'probabilitati-calc'
  | 'geometry-lab'
  | 'tabla';

export interface KleinToolDefinition {
  key: KleinToolKey;
  label: string;
  aliases: readonly KleinToolAlias[];
  supportsClassroom: boolean;
  supportsExam: boolean;
  supportsCollaboration: boolean;
  notes?: string;
}

export type CreateKleinToolRuntimeOptions = Omit<InstrumentOptions<unknown, unknown>, 'initialSnapshot' | 'onDelta'> & {
  /** Collaboration actor identity used by tools with actor-scoped object IDs. */
  actorId?: string;
  initialSnapshot?: unknown;
  onDelta?: (delta: AnyKleinToolDelta, meta: DeltaMeta) => void;
};

export interface CreateKleinToolRuntimeInput extends CreateKleinToolRuntimeOptions {
  toolKey: KleinToolKey | KleinToolAlias | string;
}

export const KLEIN_V0_TOOLS: readonly KleinToolDefinition[] = [
  {
    key: 'graphing',
    label: 'Graphing Calculator',
    aliases: ['graphing', 'geogebra-graphing', 'calculator-grafic'],
    supportsClassroom: true,
    supportsExam: true,
    supportsCollaboration: true,
  },
  {
    key: 'geometry-lab',
    label: 'Geometry Lab',
    aliases: ['graphing-3d', 'geogebra-3d', 'geometrie-3d', 'geometry-lab'],
    supportsClassroom: true,
    supportsExam: true,
    supportsCollaboration: true,
    notes: 'Geometry Lab owns 2D/3D construction and equation surfaces; graphing-3d aliases remain for compatibility.',
  },
  {
    key: 'scientific',
    label: 'Scientific Calculator',
    aliases: ['scientific', 'geogebra-scientific', 'calculator-stiintific'],
    supportsClassroom: true,
    supportsExam: true,
    supportsCollaboration: false,
    notes: 'Collaboration is limited to shared history when a host explicitly enables it.',
  },
  {
    key: 'probability',
    label: 'Probability/Statistics Calculator',
    aliases: ['probability', 'geogebra-probability', 'probabilitati-calc'],
    supportsClassroom: true,
    supportsExam: true,
    supportsCollaboration: true,
  },
  {
    key: 'whiteboard',
    label: 'Whiteboard',
    aliases: ['whiteboard', 'tabla'],
    supportsClassroom: true,
    supportsExam: true,
    supportsCollaboration: true,
  },
];

const TOOL_BY_KEY = new Map<KleinToolKey, KleinToolDefinition>(
  KLEIN_V0_TOOLS.map(tool => [tool.key, tool]),
);

const TOOL_ALIAS_MAP = new Map<string, KleinToolKey>();
for (const tool of KLEIN_V0_TOOLS) {
  TOOL_ALIAS_MAP.set(tool.key, tool.key);
  for (const alias of tool.aliases) TOOL_ALIAS_MAP.set(alias, tool.key);
}

export function isKleinToolKey(value: unknown): value is KleinToolKey {
  return typeof value === 'string' && TOOL_BY_KEY.has(value as KleinToolKey);
}

export function normalizeKleinToolKey(value: unknown): KleinToolKey | null {
  return typeof value === 'string' ? TOOL_ALIAS_MAP.get(value) ?? null : null;
}

export function requireKleinToolKey(value: unknown): KleinToolKey {
  const toolKey = normalizeKleinToolKey(value);
  if (!toolKey) {
    throw new KleinSdkError('unsupported_tool', 'Unsupported Klein v0 tool key.', {
      toolKey: typeof value === 'string' ? value : String(value),
    });
  }
  return toolKey;
}

export function getKleinToolDefinition(value: KleinToolKey | KleinToolAlias | string): KleinToolDefinition | null {
  const toolKey = normalizeKleinToolKey(value);
  return toolKey ? TOOL_BY_KEY.get(toolKey) ?? null : null;
}

export function createKleinToolRuntime(input: CreateKleinToolRuntimeInput): AnyKleinToolRuntime {
  const toolKey = requireKleinToolKey(input.toolKey);
  const options = withoutToolKey(input);

  switch (toolKey) {
    case 'graphing':
      return createGraphingRuntime(
        typedOptions<GraphingSnapshot, GraphingDelta, GraphingOptions>(options, validateGraphingSnapshot),
      ) as unknown as AnyKleinToolRuntime;
    case 'geometry-lab': {
      const geometryOptions = typedOptions<GeometryLabSnapshot, GeometryLabDelta, GeometryLabOptions>(options, validateGeometryLabSnapshot);
      if (input.actorId !== undefined) geometryOptions.actorId = input.actorId;
      if (isLegacy3DAlias(input.toolKey) && geometryOptions.initialView === undefined) geometryOptions.initialView = '3d';
      return createGeometryLabRuntime(geometryOptions) as unknown as AnyKleinToolRuntime;
    }
    case 'scientific':
      return createScientificCalculatorRuntime(
        typedOptions<CalculatorSnapshot, CalculatorDelta, CalculatorOptions>(options, validateCalculatorSnapshot),
      ) as unknown as AnyKleinToolRuntime;
    case 'probability':
      return createProbabilityRuntime(
        typedOptions<ProbabilitySnapshot, ProbabilityDelta, ProbabilityOptions>(options, validateProbabilitySnapshot),
      ) as unknown as AnyKleinToolRuntime;
    case 'whiteboard':
      return createWhiteboardRuntime(
        typedOptions<WhiteboardSnapshot, WhiteboardDelta, WhiteboardOptions>(options, validateWhiteboardSnapshot),
      ) as unknown as AnyKleinToolRuntime;
  }

  // Alias normalization only returns registered canonical keys. Keep the boundary fail-closed
  // if KleinToolKey gains a non-canonical compatibility member without a registry definition.
  throw new KleinSdkError('unsupported_tool', 'Unsupported normalized Klein v0 tool key.', { toolKey });
}

function withoutToolKey(input: CreateKleinToolRuntimeInput): CreateKleinToolRuntimeOptions {
  const { toolKey: _toolKey, ...options } = input;
  return options;
}

function isLegacy3DAlias(value: unknown): boolean {
  return value === 'graphing-3d' || value === 'geogebra-3d' || value === 'geometrie-3d';
}

function typedOptions<TSnapshot, TDelta, TOptions extends InstrumentOptions<TSnapshot, TDelta>>(
  input: CreateKleinToolRuntimeOptions,
  validateSnapshot: (snapshot: unknown) => ValidationResult<TSnapshot>,
): TOptions {
  const options: InstrumentOptions<TSnapshot, TDelta> = {};
  if (input.container !== undefined) options.container = input.container;
  if (input.readOnly !== undefined) options.readOnly = input.readOnly;
  if (input.locale !== undefined) options.locale = input.locale;
  if (input.labels !== undefined) options.labels = input.labels;
  if (input.onError !== undefined) options.onError = input.onError;
  if (input.onDelta !== undefined) {
    options.onDelta = input.onDelta as (delta: TDelta, meta: DeltaMeta) => void;
  }
  if (input.initialSnapshot !== undefined) {
    const validation = validateSnapshot(input.initialSnapshot);
    if (!validation.ok) {
      throw new KleinSdkError('invalid_initial_snapshot', 'Initial tool snapshot is invalid.', {
        issues: validation.issues.map(issue => ({ path: issue.path, message: issue.message })),
      });
    }
    options.initialSnapshot = validation.value;
  }
  return options as TOptions;
}
