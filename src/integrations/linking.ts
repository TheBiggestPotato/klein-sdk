import { KleinSdkError } from '../core/index.js';
import type { DeltaMeta, KleinInstrument } from '../core/index.js';

/**
 * Making one instrument's number follow another's.
 *
 * <p>The spreadsheet, the graphing view and the Geometry Lab are separate
 * instruments with nothing between them: a cell cannot track segment AB as it
 * is dragged, and a graph cannot be a function of a length a student measured.
 * That is the whole of "multiple representations" as a teaching idea, and none
 * of it worked - `WorkspaceLink` declares `sourcePanelId`, `targetPanelId` and
 * a `kind` string with nothing reading any of them.
 *
 * <p><b>Push, never poll.</b> Every instrument already emits its deltas, so a
 * link is a subscription: the source changes, the link reads the new value and
 * writes it on. Nothing runs when nothing moves, which is the difference
 * between a link that costs nothing on an idle figure and a timer that costs
 * something forever.
 *
 * <p><b>What stops it looping.</b> Two links pointing at each other would push
 * a value round for ever. Three things prevent it, in order of how much they do:
 * a write that would not change the target is skipped, so a round trip settles
 * after one pass; a propagation carries a depth, and one that will not settle is
 * stopped and reported rather than run; and a link refuses to be created if it
 * would close a cycle that has no fixed point.
 */

/** A number somewhere in an instrument. */
export type LinkedValueRef =
  /** A Geometry Lab measurement, by id - a length, an area, an angle. */
  | { readonly kind: 'measurement'; readonly id: string }
  /** A slider, by id or by name; the Geometry Lab and the graphing view both have them. */
  | { readonly kind: 'slider'; readonly id: string }
  /** One coordinate of a 2D point in the Geometry Lab. */
  | { readonly kind: 'pointX'; readonly id: string }
  | { readonly kind: 'pointY'; readonly id: string }
  /** A spreadsheet cell, by address. */
  | { readonly kind: 'cell'; readonly address: string };

export interface LinkedEndpoint {
  readonly instrument: KleinInstrument<never, never, never>;
  readonly ref: LinkedValueRef;
}

export interface ValueLinkOptions {
  /**
   * Decimals to round the pushed value to.
   *
   * <p>Not cosmetic. A value pushed round a loop of links has to *settle*, and
   * two floats that differ in their last bit never compare equal - so an
   * unrounded round trip is the case where "skip a write that changes nothing"
   * stops working. Six places is finer than anything a lesson measures and
   * coarse enough to converge.
   */
  readonly decimals?: number;
  /** Told when a link cannot read, cannot write, or will not settle. */
  readonly onError?: (error: KleinSdkError) => void;
}

export interface ValueLink {
  readonly id: string;
  readonly from: LinkedEndpoint;
  readonly to: LinkedEndpoint;
}

/**
 * How far a change is allowed to propagate before it is treated as a loop that
 * will not settle. Deeper than any sensible chain of representations, shallow
 * enough that a runaway stops in the same frame it started.
 */
const MAX_PROPAGATION_DEPTH = 16;

const DEFAULT_DECIMALS = 6;

/** Links between instruments, and the propagation that keeps them true. */
export class ValueLinkGraph {
  readonly #links = new Map<string, ValueLink>();
  readonly #unsubscribes = new Map<KleinInstrument<never, never, never>, () => void>();
  readonly #sources = new Map<KleinInstrument<never, never, never>, Set<string>>();
  readonly #decimals: number;
  readonly #onError: ((error: KleinSdkError) => void) | undefined;
  #nextId = 1;
  #depth = 0;

  constructor(options: ValueLinkOptions = {}) {
    this.#decimals = options.decimals ?? DEFAULT_DECIMALS;
    this.#onError = options.onError;
  }

  /**
   * Makes `to` follow `from`, and pushes the current value straight away.
   *
   * <p>Immediately rather than on the next change, because a link that showed
   * nothing until the student happened to move something would look broken.
   */
  link(from: LinkedEndpoint, to: LinkedEndpoint): string {
    if (from.instrument === to.instrument && sameRef(from.ref, to.ref)) {
      throw new KleinSdkError('invalid_link', 'A value cannot follow itself.');
    }
    for (const existing of this.#links.values()) {
      if (existing.to.instrument === to.instrument && sameRef(existing.to.ref, to.ref)) {
        throw new KleinSdkError(
          'invalid_link',
          'That value already follows something else, and a value with two sources has no answer.',
        );
      }
    }
    if (this.#wouldCycle(from, to)) {
      throw new KleinSdkError(
        'invalid_link',
        'That link would close a loop, and a loop of links has nothing to settle on.',
      );
    }
    // Refused before anything is subscribed, so a link that could never work
    // does not sit in the graph looking as though it does.
    readLinkedValue(from);
    assertWritable(to);

    const id = `link_${this.#nextId}`;
    this.#nextId += 1;
    this.#links.set(id, { id, from, to });
    this.#watch(from.instrument);
    // The first push is allowed to throw. Failing to *establish* a link is a
    // different thing from failing to propagate one later: the first is a
    // mistake in what the host asked for and should be answered at the call,
    // and the second is something that happened while a student was working
    // and belongs in `onError`.
    try {
      this.#push(id, true);
    } catch (error) {
      this.unlink(id);
      throw error;
    }
    return id;
  }

  /** Stops one link, and stops listening if it was the last on its source. */
  unlink(id: string): void {
    const link = this.#links.get(id);
    if (!link) return;
    this.#links.delete(id);
    const ids = this.#sources.get(link.from.instrument);
    ids?.delete(id);
    if (ids && ids.size === 0) {
      this.#unsubscribes.get(link.from.instrument)?.();
      this.#unsubscribes.delete(link.from.instrument);
      this.#sources.delete(link.from.instrument);
    }
  }

  links(): ValueLink[] {
    return [...this.#links.values()];
  }

  /** Stops every link and every subscription. */
  dispose(): void {
    for (const unsubscribe of this.#unsubscribes.values()) unsubscribe();
    this.#unsubscribes.clear();
    this.#sources.clear();
    this.#links.clear();
  }

  /* ---------------------------------------------------------------------- */

  #watch(instrument: KleinInstrument<never, never, never>): void {
    if (this.#unsubscribes.has(instrument)) return;
    this.#unsubscribes.set(
      instrument,
      instrument.subscribeDelta((_delta: never, meta: DeltaMeta) => {
        // A history delta is an undo replaying an old state; pushing from it
        // would write the undone value forward again.
        if (meta.source === 'history') return;
        this.#propagate(instrument);
      }),
    );
  }

  #propagate(instrument: KleinInstrument<never, never, never>): void {
    if (this.#depth >= MAX_PROPAGATION_DEPTH) {
      this.#report(new KleinSdkError(
        'link_did_not_settle',
        'A chain of links kept changing its own inputs and was stopped.',
      ));
      return;
    }
    this.#depth += 1;
    try {
      // Writes are gathered per target and applied in one delta each.
      // Applying them one at a time makes every commit pay for the whole of the
      // target's snapshot, so forty links into one graph cost forty commits of
      // a snapshot that has grown forty times - quadratic in a number a host
      // has every reason to make large.
      // One snapshot per instrument for the whole pass. Every read happens
      // before any write - that is what batching bought - so the reads are
      // consistent with each other, and an instrument whose `getSnapshot`
      // copies is asked once instead of twice per link. Without this a drag
      // stayed quadratic in the number of links even after batching, because
      // the *target* was being copied to be read.
      const cache = new Map<KleinInstrument<never, never, never>, SnapshotShape>();
      const batched = new Map<WritableInstrument, { endpoint: LinkedEndpoint; deltas: unknown[] }>();
      for (const id of this.#sources.get(instrument) ?? []) {
        const write = this.#prepare(id, cache);
        if (!write) continue;
        const target = write.endpoint.instrument as unknown as WritableInstrument;
        const existing = batched.get(target);
        if (existing) existing.deltas.push(write.delta);
        else batched.set(target, { endpoint: write.endpoint, deltas: [write.delta] });
      }
      for (const { endpoint, deltas } of batched.values()) {
        this.#apply(endpoint, deltas, false);
      }
    } finally {
      this.#depth -= 1;
    }
  }

  /** The delta one link wants written, or nothing when it wants nothing. */
  #prepare(
    id: string,
    cache: Map<KleinInstrument<never, never, never>, SnapshotShape>,
  ): { endpoint: LinkedEndpoint; delta: unknown } | null {
    const link = this.#links.get(id);
    if (!link) return null;
    try {
      const value = readFrom(snapshotFor(link.from.instrument, cache), link.from.ref);
      if (value === null) return null;
      const rounded = round(value, this.#decimals);
      const target = snapshotFor(link.to.instrument, cache);
      const current = readFrom(target, link.to.ref);
      // The first and most important of the loop guards: a write that changes
      // nothing is not made, so a round trip settles after one pass.
      if (current !== null && round(current, this.#decimals) === rounded) return null;
      return { endpoint: link.to, delta: writeDeltaFrom(target, link.to.ref, rounded) };
    } catch (error) {
      this.#report(asLinkError(error));
      return null;
    }
  }

  #apply(endpoint: LinkedEndpoint, deltas: unknown[], rethrow: boolean): void {
    const target = endpoint.instrument as unknown as WritableInstrument;
    try {
      target.applyDelta(deltas.length === 1 ? deltas[0] : { op: 'batch', deltas }, LINK_WRITE);
    } catch (error) {
      const failure = asLinkError(error);
      if (rethrow) throw failure;
      this.#report(failure);
    }
  }

  #push(id: string, rethrow: boolean): void {
    const link = this.#links.get(id);
    if (!link) return;
    const ids = this.#sources.get(link.from.instrument) ?? new Set<string>();
    ids.add(id);
    this.#sources.set(link.from.instrument, ids);

    let write: { endpoint: LinkedEndpoint; delta: unknown } | null;
    if (rethrow) {
      const value = readLinkedValue(link.from);
      if (value === null) return;
      const rounded = round(value, this.#decimals);
      const current = readLinkedValue(link.to);
      if (current !== null && round(current, this.#decimals) === rounded) return;
      write = { endpoint: link.to, delta: linkedWriteDelta(link.to, rounded) };
    } else {
      write = this.#prepare(id, new Map());
    }
    if (write) this.#apply(write.endpoint, [write.delta], rethrow);
  }

  /** Whether following `to` back to its own sources reaches `from`. */
  #wouldCycle(from: LinkedEndpoint, to: LinkedEndpoint): boolean {
    const seen = new Set<string>();
    const queue: LinkedEndpoint[] = [to];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor] as LinkedEndpoint;
      if (current.instrument === from.instrument && sameRef(current.ref, from.ref)) return true;
      for (const link of this.#links.values()) {
        if (link.from.instrument !== current.instrument || !sameRef(link.from.ref, current.ref)) continue;
        const key = `${link.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push(link.to);
      }
    }
    return false;
  }

  #report(error: KleinSdkError): void {
    if (this.#onError) this.#onError(error);
    else throw error;
  }
}

/** Opens a set of links that know about each other, which is what stops loops. */
export function createValueLinks(options: ValueLinkOptions = {}): ValueLinkGraph {
  return new ValueLinkGraph(options);
}

/* -------------------------------------------------------------------------- */
/* The ports                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The value at an endpoint, or null when there is nothing there yet.
 *
 * <p>Null rather than an error for a missing object, because a link to a cell
 * nobody has filled in is a reasonable thing to set up before filling it in.
 */
export function readLinkedValue(endpoint: LinkedEndpoint): number | null {
  return readFrom(peekSnapshot(endpoint.instrument), endpoint.ref);
}

/**
 * The snapshot to read, without copying it.
 *
 * <p>`getSnapshot` is contracted to hand back something the caller may write
 * into, so the Geometry Lab deep-clones on every call. Reading two endpoints
 * per link then cloned the whole figure twice per link, which made a drag
 * quadratic in the number of links - forty of them cost 4.3 ms where ten cost
 * 0.27, and none of it was the writing. `peekSnapshot` is the read-only view
 * added for exactly this, and an instrument without one is simply not big
 * enough for it to matter.
 */
function snapshotFor(
  instrument: KleinInstrument<never, never, never>,
  cache: Map<KleinInstrument<never, never, never>, SnapshotShape>,
): SnapshotShape {
  const cached = cache.get(instrument);
  if (cached) return cached;
  const snapshot = peekSnapshot(instrument);
  cache.set(instrument, snapshot);
  return snapshot;
}

function peekSnapshot(instrument: KleinInstrument<never, never, never>): SnapshotShape {
  const peekable = instrument as unknown as { peekSnapshot?: () => unknown };
  const snapshot = typeof peekable.peekSnapshot === 'function'
    ? peekable.peekSnapshot()
    : instrument.getSnapshot();
  return snapshot as SnapshotShape;
}

function readFrom(snapshot: SnapshotShape, ref: LinkedValueRef): number | null {

  if (ref.kind === 'measurement') {
    const flat = snapshot.scene?.scene2d?.measurements?.[ref.id];
    const spatial = snapshot.scene?.scene3d?.measurements?.[ref.id];
    const value = flat?.value ?? spatial?.value;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  if (ref.kind === 'pointX' || ref.kind === 'pointY') {
    const point = snapshot.scene?.scene2d?.points?.[ref.id];
    const value = ref.kind === 'pointX' ? point?.x : point?.y;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  if (ref.kind === 'slider') {
    const slider = findSlider(snapshot, ref.id);
    return slider && Number.isFinite(slider.value) ? slider.value : null;
  }

  const cell = findCell(snapshot, ref.address);
  if (!cell) return null;
  // A cell holds whatever was typed into it, so a number has to be recognised
  // rather than assumed - `value` when the sheet has evaluated one, and the
  // input text when it has not.
  const evaluated = typeof cell.value === 'number' ? cell.value : Number(cell.input);
  return Number.isFinite(evaluated) ? evaluated : null;
}

/** Writes a value at an endpoint, or explains why it cannot be written. */
export function writeLinkedValue(endpoint: LinkedEndpoint, value: number): void {
  const instrument = endpoint.instrument as unknown as WritableInstrument;
  instrument.applyDelta(linkedWriteDelta(endpoint, value), LINK_WRITE);
}

/** The edit that would put `value` at an endpoint, in that instrument's own words. */
function linkedWriteDelta(endpoint: LinkedEndpoint, value: number): unknown {
  return writeDeltaFrom(peekSnapshot(endpoint.instrument), endpoint.ref, value);
}

function writeDeltaFrom(snapshot: SnapshotShape, ref: LinkedValueRef, value: number): unknown {
  if (ref.kind === 'measurement') {
    throw new KleinSdkError(
      'read_only_link_target',
      'A measurement is what the figure measures, so it cannot be written to; link to a slider or a point instead.',
    );
  }

  if (ref.kind === 'pointX' || ref.kind === 'pointY') {
    const changes = ref.kind === 'pointX' ? { x: value } : { y: value };
    return { op: 'updatePoint', id: ref.id, changes };
  }

  if (ref.kind === 'slider') {
    const slider = findSlider(snapshot, ref.id);
    if (!slider) throw new KleinSdkError('missing_link_target', `No slider "${ref.id}".`);
    // The two instruments spell the same edit differently, which is the whole
    // reason this file exists: one place knows both spellings.
    return snapshot.scene?.scene2d
      ? { op: 'updateSlider2D', id: slider.id, changes: { value } }
      : { op: 'updateSlider', id: slider.id, changes: { value } };
  }

  const existing = findCell(snapshot, ref.address);
  return {
    op: 'setCell',
    cell: {
      id: existing?.id ?? ref.address,
      address: ref.address,
      input: String(value),
      value,
    },
  };
}

function asLinkError(error: unknown): KleinSdkError {
  return error instanceof KleinSdkError
    ? error
    : new KleinSdkError('link_failed', 'A linked value could not be pushed.');
}

/**
 * Refuses a target that cannot be written before anything subscribes to it.
 *
 * <p>The spreadsheet is a scaffold - `createStubInstrument` throws on
 * `applyDelta` - so a cell cannot yet be the *target* of a link, though it can
 * be the source of one. That is a fact about the spreadsheet rather than about
 * linking, and it is said here rather than discovered when a student drags
 * something.
 */
function assertWritable(endpoint: LinkedEndpoint): void {
  if (endpoint.ref.kind === 'measurement') {
    throw new KleinSdkError(
      'read_only_link_target',
      'A measurement is what the figure measures, so it cannot be written to; link to a slider or a point instead.',
    );
  }
  const instrument = endpoint.instrument as unknown as WritableInstrument;
  if (typeof instrument.applyDelta !== 'function') {
    throw new KleinSdkError('read_only_link_target', `${endpoint.instrument.kind} cannot be written to.`);
  }
}

/* -------------------------------------------------------------------------- */

interface SnapshotShape {
  scene?: {
    scene2d?: {
      points?: Record<string, { x?: number; y?: number } | undefined>;
      measurements?: Record<string, { value?: number } | undefined>;
      sliders?: Record<string, { id: string; name: string; value: number } | undefined>;
    };
    scene3d?: { measurements?: Record<string, { value?: number } | undefined> };
    sliders?: Record<string, { id: string; name: string; value: number } | undefined>;
    cells?: Record<string, { id: string; address: string; input: string; value?: unknown } | undefined>;
  };
}

interface WritableInstrument {
  applyDelta(delta: unknown, options?: unknown): unknown;
}

/**
 * How a linked write is applied.
 *
 * <p><b>Emitted</b>, because a change nobody is told about is one the next link
 * in a chain cannot see - the instruments default to *not* emitting an applied
 * delta, so that a delta arriving from a collaborator does not echo back, and a
 * link write is the opposite case: it starts here and everything downstream has
 * to hear it.
 *
 * <p><b>Not local</b>, which keeps it out of the target's undo stack. Undoing a
 * drag should take back the drag and everything that followed from it in one
 * step; a linked write that recorded its own entry would make the student press
 * undo twice to get back to where they were, and the second press would put the
 * figure and the graph out of step. `remote` is the least wrong of the four
 * sources the contract offers - none of them means "a link did this" - and it
 * is the one whose meaning, "not something this user typed", is true.
 */
const LINK_WRITE = { emit: true, meta: { source: 'remote' as const } };

/** By id first and then by name, because a slider is known by both. */
function findSlider(
  snapshot: SnapshotShape,
  idOrName: string,
): { id: string; name: string; value: number } | undefined {
  const records = { ...(snapshot.scene?.sliders ?? {}), ...(snapshot.scene?.scene2d?.sliders ?? {}) };
  const direct = records[idOrName];
  if (direct) return direct;
  return Object.values(records).find((slider) => slider?.name === idOrName);
}

/** Cells are keyed by their own ids, so an address is a search rather than a lookup. */
function findCell(
  snapshot: SnapshotShape,
  address: string,
): { id: string; address: string; input: string; value?: unknown } | undefined {
  const cells = snapshot.scene?.cells;
  if (!cells) return undefined;
  return Object.values(cells).find((cell) => cell?.address === address);
}

function sameRef(left: LinkedValueRef, right: LinkedValueRef): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'cell' && right.kind === 'cell') return left.address === right.address;
  return (left as { id?: string }).id === (right as { id?: string }).id;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}
