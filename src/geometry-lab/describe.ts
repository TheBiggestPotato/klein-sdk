import { formatExact, type ExactValue } from '../math/index.js';
import { computeGeometryInvariants, type GeometryInvariantId } from './gradable-invariants.js';
import { geometryConstructionProtocol } from './protocol.js';
import type { GeometryLabSnapshot } from './types.js';

/**
 * The figure, in words.
 *
 * <p>What the text export used to be was a census - `points: 7, entities: 4` -
 * which tells a student who cannot see the screen how much they are missing and
 * nothing else. A description has to say what the objects *are*, how they were
 * made, and what is true of them, because that is the figure; the count is a
 * property of the file.
 *
 * <p>Almost none of this is computed here. The steps come from the construction
 * protocol, which is read out of the provenance the model already carries, and
 * the facts come from the invariant reporter. This turns them into English and
 * puts them in an order somebody can follow, which is the part that was
 * missing.
 */

/** Enough of a long figure to be useful, without an export nobody can read. */
const MAX_LISTED_STEPS = 60;
const MAX_LISTED_FACTS = 40;

/** One sentence naming what the figure holds, for a caption or an SVG title. */
export function geometryLabFigureSummary(snapshot: GeometryLabSnapshot): string {
  const plane = census(snapshot, '2d');
  const space = census(snapshot, '3d');
  if (plane.length === 0 && space.length === 0) return 'An empty figure.';
  const parts: string[] = [];
  if (plane.length > 0) parts.push(`${list(plane)} in the plane`);
  if (space.length > 0) parts.push(`${list(space)} in space`);
  return `A figure with ${list(parts)}.`;
}

/**
 * The whole figure as text: what is in it, how it was built, what it
 * establishes, and what has been measured.
 */
export function describeGeometryLabFigure(snapshot: GeometryLabSnapshot): string {
  const sections: string[] = ['Klein Geometry Lab figure.', '', geometryLabFigureSummary(snapshot)];

  const protocol = geometryConstructionProtocol(snapshot);
  if (protocol.steps.length > 0) {
    sections.push('', 'How it was built:');
    for (const step of protocol.steps.slice(0, MAX_LISTED_STEPS)) {
      sections.push(`${step.number}. ${step.summary}`);
    }
    if (protocol.steps.length > MAX_LISTED_STEPS) {
      sections.push(`... and ${protocol.steps.length - MAX_LISTED_STEPS} more steps.`);
    }
  }

  const report = computeGeometryInvariants(snapshot);
  if (report.invariants.length > 0) {
    sections.push('', 'What it establishes:');
    for (const fact of report.invariants.slice(0, MAX_LISTED_FACTS)) {
      sections.push(`- ${describeGeometryInvariant(fact)}`);
    }
    if (report.invariants.length > MAX_LISTED_FACTS) {
      sections.push(`- ... and ${report.invariants.length - MAX_LISTED_FACTS} more.`);
    }
  }
  if (report.truncated) {
    // Said rather than implied: a reader must not take a short list for a
    // complete one, which is the same reason the report carries the flag.
    sections.push(
      '',
      'This figure is larger than can be checked exhaustively, so the list of facts above is partial.',
    );
  }

  const measured = measurements(snapshot);
  if (measured.length > 0) {
    sections.push('', 'Measurements:');
    for (const line of measured) sections.push(`- ${line}`);
  }

  return sections.join('\n');
}

/* -------------------------------------------------------------------------- */
/* Facts in English                                                           */
/* -------------------------------------------------------------------------- */

/**
 * One fact, as a sentence.
 *
 * <p>The ids are already written to be read - `midpoint:M,AB` is close to
 * "M is the midpoint of AB" - so nothing here has to take a name apart. That is
 * deliberate: the one place names *are* taken apart, goal checking, has to
 * refuse an ambiguous one, and a description that had to do the same would have
 * to say "something is the midpoint of something".
 *
 * <p>An unknown kind is returned as it stands rather than mangled, so a fact
 * this file has not been taught still reaches the reader.
 */
export function describeGeometryInvariant(invariant: GeometryInvariantId): string {
  const colon = invariant.indexOf(':');
  if (colon < 0) return invariant;
  const kind = invariant.slice(0, colon);
  const args = invariant.slice(colon + 1).split(',').map(unwrap);
  const [first, second] = args;

  switch (kind) {
    case 'equal-segments':
      return `${first} and ${second} are the same length.`;
    case 'parallel':
      return `${first} is parallel to ${second}.`;
    case 'perpendicular':
      return `${first} is perpendicular to ${second}.`;
    case 'right-angle':
      return `Angle ${first} is a right angle.`;
    case 'collinear':
      return `${list(args)} lie on one line.`;
    case 'midpoint':
      return `${first} is the midpoint of ${second}.`;
    case 'point-on-circle':
      return `${first} lies on the circle centred on ${second}.`;
    case 'concyclic':
      return `${list(args)} lie on one circle.`;
    case 'point-on':
      return `${first} lies on ${second}.`;
    case 'tangent':
      return `${first} is a tangent to the circle centred on ${second}.`;
    case 'equal-angles':
      return `Angles ${first} and ${second} are equal.`;
    case 'congruent':
      return `Triangles ${first} and ${second} are congruent.`;
    case 'similar':
      return `Triangles ${first} and ${second} are similar.`;
    case 'equal-area':
      return `${first} and ${second} have the same area.`;
    case 'point-on-plane':
      return `${first} lies on plane ${second}.`;
    case 'coplanar':
      return `${list(args)} lie on one plane.`;
    case 'parallel-planes':
      return `Planes ${first} and ${second} are parallel.`;
    case 'perpendicular-planes':
      return `Planes ${first} and ${second} are perpendicular.`;
    case 'perpendicular-to-plane':
      return `${first} is perpendicular to plane ${second}.`;
    case 'parallel-to-plane':
      return `${first} is parallel to plane ${second}.`;
    case 'skew':
      return `${first} and ${second} are skew: they neither meet nor run alongside each other.`;
    default:
      return invariant;
  }
}

/** `circle(O)` and `plane(base)` name one object; the wrapper is for the id. */
function unwrap(name: string): string {
  const open = name.indexOf('(');
  return open > 0 && name.endsWith(')') ? name.slice(open + 1, -1) : name;
}

/* -------------------------------------------------------------------------- */
/* Counting and measuring                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What the figure shows.
 *
 * <p>Counts what is drawn, which is not quite what is stored. An object the
 * instrument made on the caller's behalf - hidden and locked together - is its
 * working rather than content, and nobody wants to be told their figure
 * contains four helper points. An object the student hid is also not counted,
 * because this sentence is what a reader who cannot see the drawing is told
 * *instead of* seeing it, and telling them about something that is not there
 * would be worse than saying nothing. How the figure was built is a separate
 * section, and a hidden step still appears in it.
 */
function census(snapshot: GeometryLabSnapshot, view: '2d' | '3d'): string[] {
  const counts = new Map<string, number>();
  const bump = (kind: string): void => { counts.set(kind, (counts.get(kind) ?? 0) + 1); };

  if (view === '2d') {
    const scene = snapshot.scene.scene2d;
    for (const point of Object.values(scene.points)) {
      if (point.kind !== 'point2d' || point.hidden === true) continue;
      bump('point');
    }
    for (const entity of Object.values(scene.entities)) {
      if (entity.hidden === true) continue;
      bump(entity.kind);
    }
    const constraints = Object.keys(scene.constraints ?? {}).length;
    if (constraints > 0) counts.set('constraint', constraints);
  } else {
    const scene = snapshot.scene.scene3d;
    const owned = new Set<string>();
    for (const entity of Object.values(scene.entities ?? {})) {
      if (entity.kind === 'solid' || entity.kind === 'crossSection') {
        for (const id of entity.pointIds ?? []) owned.add(id);
      }
    }
    for (const point of Object.values(scene.points ?? {})) {
      if (point.hidden === true || owned.has(point.id)) continue;
      bump('point');
    }
    for (const entity of Object.values(scene.entities ?? {})) {
      if (entity.hidden === true) continue;
      bump(entity.kind === 'solid' ? (entity.solid ?? 'solid') : entity.kind);
    }
    // The plane every scene starts with is furniture, not content.
    const planes = Object.values(scene.workPlanes ?? {}).filter(plane => plane.id !== 'xy').length;
    if (planes > 0) counts.set('plane', planes);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${count} ${plural(readable(kind), count)}`);
}

function readable(kind: string): string {
  if (kind === 'crossSection') return 'cross-section';
  if (kind === 'surface3d') return 'surface';
  if (kind === 'curve3d') return 'curve';
  if (kind === 'parametricCurve') return 'curve';
  if (kind === 'relationMarker') return 'marker';
  return kind;
}

function plural(word: string, count: number): string {
  if (count === 1) return word;
  return word.endsWith('s') || word.endsWith('x') ? `${word}es` : `${word}s`;
}

function measurements(snapshot: GeometryLabSnapshot): string[] {
  const lines: string[] = [];
  const flat = snapshot.scene.scene2d.measurements ?? {};
  for (const measurement of Object.values(flat).sort((a, b) => a.id.localeCompare(b.id))) {
    if (measurement.hidden) continue;
    lines.push(format(measurement.label ?? measurement.kind, measurement.value, measurement.unit, measurement.exact));
  }
  const spatial = snapshot.scene.scene3d.measurements ?? {};
  for (const measurement of Object.values(spatial).sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(format(measurement.label ?? measurement.kind, measurement.value, measurement.unit, undefined));
  }
  return lines;
}

/**
 * A measurement as a line of text.
 *
 * <p>The exact value leads where there is one, because `2√5` is what the
 * student is being asked to notice and `4.472` is what stops them noticing it.
 * The decimal stays alongside: a reader still wants to know roughly how big the
 * thing is, and a length given only as a surd is a puzzle rather than a
 * measurement.
 */
function format(
  label: string,
  value: number,
  unit: string | undefined,
  exact: ExactValue | undefined,
): string {
  const rounded = Number.isFinite(value) ? Math.round(value * 1e3) / 1e3 : value;
  const written = exact ? formatExact(exact) : null;
  // The decimal is only worth adding when the exact form does not already read
  // as one: "8 (about 8)" tells a reader nothing and makes them look twice.
  const amount = written === null
    ? String(rounded)
    : (written === String(rounded) ? written : `${written} (about ${rounded})`);
  return unit ? `${label}: ${amount} ${unit}` : `${label}: ${amount}`;
}

/** `A`, `A and B`, `A, B and C` - an Oxford-comma-free list a person would say. */
function list(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] as string;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
