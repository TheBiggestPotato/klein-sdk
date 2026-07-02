/** Small injectable id source so tests and hosts can make snapshot ids deterministic. */
export interface IdFactory {
  next(prefix?: string): string;
}

/** Creates a counter-based id factory; real tools can swap this for stronger id generation later. */
export function createIdFactory(seed = 0): IdFactory {
  let counter = seed;

  return {
    next(prefix = 'id') {
      counter += 1;
      return `${prefix}_${counter.toString(36)}`;
    },
  };
}
