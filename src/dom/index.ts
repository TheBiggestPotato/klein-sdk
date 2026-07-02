import type { KleinInstrument } from '../core/index.js';
import { createScientificCalculator } from '../calculator/index.js';
import { createGeometryCalculator } from '../geometry/index.js';
import { createGeometryLab } from '../geometry-lab/index.js';
import { createGraphingCalculator } from '../graphing/index.js';
import { createWhiteboard } from '../whiteboard/index.js';

/** Custom element tag names reserved by the SDK's DOM adapter. */
export const KLEIN_ELEMENT_TAGS = {
  whiteboard: 'klein-whiteboard',
  geometry: 'klein-geometry-calculator',
  geometryLab: 'klein-geometry-lab',
  graphing: 'klein-graphing-calculator',
  calculator: 'klein-scientific-calculator',
} as const;

type AnyInstrument = KleinInstrument<unknown, unknown, string>;

/** Factory shape used internally when defining one custom element. */
type InstrumentFactory = (options: { container?: HTMLElement }) => AnyInstrument;

/** Defines one custom element wrapper around an instrument factory. */
function defineInstrumentElement(
  registry: CustomElementRegistry,
  tagName: string,
  createInstrument: InstrumentFactory,
): void {
  if (registry.get(tagName)) {
    return;
  }

  registry.define(
    tagName,
    class KleinInstrumentElement extends HTMLElement {
      #instrument: AnyInstrument | undefined;

      connectedCallback() {
        if (!this.#instrument) {
          this.#instrument = createInstrument({});
          this.#instrument.mount(this);
        }
      }

      disconnectedCallback() {
        this.#instrument?.destroy();
        this.#instrument = undefined;
      }

      get instrument(): AnyInstrument | undefined {
        return this.#instrument;
      }
    },
  );
}

/** Registers the SDK's initial custom elements against the provided registry. */
export function defineKleinElements(registry = globalThis.customElements): void {
  if (!registry) {
    throw new Error('Custom elements are not available in this environment.');
  }

  defineInstrumentElement(registry, KLEIN_ELEMENT_TAGS.whiteboard, createWhiteboard);
  defineInstrumentElement(registry, KLEIN_ELEMENT_TAGS.geometry, createGeometryCalculator);
  defineInstrumentElement(registry, KLEIN_ELEMENT_TAGS.geometryLab, createGeometryLab);
  defineInstrumentElement(registry, KLEIN_ELEMENT_TAGS.graphing, createGraphingCalculator);
  defineInstrumentElement(registry, KLEIN_ELEMENT_TAGS.calculator, createScientificCalculator);
}
