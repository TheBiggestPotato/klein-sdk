/**
 * Host-owned visual tokens for Klein tool renderers. Themes are deliberately
 * presentation-only: snapshots and collaboration deltas never contain them.
 */
export type KleinToolThemeName = 'light' | 'dark';

export interface KleinToolTheme {
  name: KleinToolThemeName | string;
  colorScheme: 'light' | 'dark';
  background: string;
  surface: string;
  surfaceRaised: string;
  canvas: string;
  border: string;
  text: string;
  mutedText: string;
  faintText: string;
  primary: string;
  primaryForeground: string;
  primarySoft: string;
  accent: string;
  accentForeground: string;
  accentSoft: string;
  danger: string;
  dangerForeground: string;
  dangerSoft: string;
  focusRing: string;
  gridMinor: string;
  gridMajor: string;
  axis: string;
  axisX: string;
  axisY: string;
  axisZ: string;
  shadow: string;
  fontFamily: string;
  mathFontFamily: string;
}

/**
 * The typefaces every Klein surface uses, declared once.
 *
 * <p>Before this existed there were six sans stacks and three maths stacks
 * across the client and the SDK — Proxima Nova in the application, Inter in
 * the tools, IBM Plex Sans in the geometry lab, bare `system-ui` in the
 * whiteboard — so a page and the instrument embedded in it were set in
 * different faces.
 *
 * <p>Proxima Nova leads because the application loads it. The fallbacks after
 * it are not decoration: a tool can be exported to SVG, printed to PDF, or
 * embedded in somebody else's page, and in all three the web font is absent.
 * The chain is ordered so what arrives next is as close as the machine has.
 */
export const KLEIN_UI_FONT_STACK =
  "'Proxima Nova', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/**
 * Mathematics, which is deliberately not the interface face.
 *
 * <p>KaTeX ships its own metrics and the whole point of them is that an
 * integral sign and a fraction bar line up. Setting formulae in the interface
 * font would look tidier in a screenshot and be wrong on the page.
 */
export const KLEIN_MATH_FONT_STACK =
  "'KaTeX_Main', 'KaTeX_Math', 'STIX Two Math', 'Cambria Math', 'Latin Modern Math', serif";

/** Where digits must line up: coordinates, matrices, code. */
export const KLEIN_MONO_FONT_STACK =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

export type KleinToolThemeInput = KleinToolThemeName | Partial<KleinToolTheme>;

/** Klein application's default light palette. */
export const KLEIN_LIGHT_TOOL_THEME: KleinToolTheme = {
  name: 'light',
  colorScheme: 'light',
  background: '#f5f5f5',
  surface: '#ffffff',
  surfaceRaised: '#ffffff',
  canvas: '#ffffff',
  border: '#dadfe0',
  text: '#303841',
  mutedText: '#5e6770',
  faintText: '#8a939b',
  primary: '#ff5722',
  primaryForeground: '#ffffff',
  primarySoft: 'rgba(255, 87, 34, 0.14)',
  accent: '#76abae',
  accentForeground: '#1e3133',
  accentSoft: 'rgba(118, 171, 174, 0.16)',
  danger: '#e5484d',
  dangerForeground: '#ffffff',
  dangerSoft: 'rgba(229, 72, 77, 0.12)',
  focusRing: 'rgba(255, 87, 34, 0.46)',
  gridMinor: '#e9eced',
  gridMajor: '#dadfe0',
  axis: '#5e6770',
  axisX: '#e5484d',
  axisY: '#76abae',
  axisZ: '#ff8a65',
  shadow: '0 1px 2px rgba(48, 56, 65, 0.06), 0 18px 48px rgba(48, 56, 65, 0.12)',
  fontFamily: KLEIN_UI_FONT_STACK,
  mathFontFamily: KLEIN_MATH_FONT_STACK,
};

/** Klein application's default dark palette. */
export const KLEIN_DARK_TOOL_THEME: KleinToolTheme = {
  name: 'dark',
  colorScheme: 'dark',
  background: '#252b31',
  surface: '#303841',
  surfaceRaised: '#353d45',
  canvas: '#252b31',
  border: '#414b55',
  text: '#f5f5f5',
  mutedText: '#a9b2ba',
  faintText: '#7e878f',
  primary: '#ff6a3d',
  primaryForeground: '#ffffff',
  primarySoft: 'rgba(255, 106, 61, 0.18)',
  accent: '#76abae',
  accentForeground: '#16201f',
  accentSoft: 'rgba(118, 171, 174, 0.18)',
  danger: '#f0565b',
  dangerForeground: '#ffffff',
  dangerSoft: 'rgba(240, 86, 91, 0.18)',
  focusRing: 'rgba(255, 106, 61, 0.52)',
  gridMinor: '#353d45',
  gridMajor: '#414b55',
  axis: '#a9b2ba',
  axisX: '#ff8a65',
  axisY: '#76abae',
  axisZ: '#9cc4c6',
  shadow: '0 1px 2px rgba(0, 0, 0, 0.35), 0 18px 48px rgba(0, 0, 0, 0.36)',
  fontFamily: KLEIN_UI_FONT_STACK,
  mathFontFamily: KLEIN_MATH_FONT_STACK,
};

export function resolveKleinToolTheme(input: KleinToolThemeInput | undefined = 'light'): KleinToolTheme {
  if (input === 'dark') return { ...KLEIN_DARK_TOOL_THEME };
  if (input === 'light' || input === undefined) return { ...KLEIN_LIGHT_TOOL_THEME };
  const base = input.colorScheme === 'dark' || input.name === 'dark'
    ? KLEIN_DARK_TOOL_THEME
    : KLEIN_LIGHT_TOOL_THEME;
  return { ...base, ...input };
}

/** CSS custom properties consumed by Klein's DOM renderers and usable by host UIs. */
export function getKleinToolThemeCssVariables(input?: KleinToolThemeInput): Record<`--klein-tool-${string}`, string> {
  const theme = resolveKleinToolTheme(input);
  return {
    '--klein-tool-background': theme.background,
    '--klein-tool-surface': theme.surface,
    '--klein-tool-surface-raised': theme.surfaceRaised,
    '--klein-tool-canvas': theme.canvas,
    '--klein-tool-border': theme.border,
    '--klein-tool-text': theme.text,
    '--klein-tool-muted-text': theme.mutedText,
    '--klein-tool-faint-text': theme.faintText,
    '--klein-tool-primary': theme.primary,
    '--klein-tool-primary-foreground': theme.primaryForeground,
    '--klein-tool-primary-soft': theme.primarySoft,
    '--klein-tool-accent': theme.accent,
    '--klein-tool-accent-foreground': theme.accentForeground,
    '--klein-tool-accent-soft': theme.accentSoft,
    '--klein-tool-danger': theme.danger,
    '--klein-tool-danger-foreground': theme.dangerForeground,
    '--klein-tool-danger-soft': theme.dangerSoft,
    '--klein-tool-focus-ring': theme.focusRing,
    '--klein-tool-grid-minor': theme.gridMinor,
    '--klein-tool-grid-major': theme.gridMajor,
    '--klein-tool-axis': theme.axis,
    '--klein-tool-axis-x': theme.axisX,
    '--klein-tool-axis-y': theme.axisY,
    '--klein-tool-axis-z': theme.axisZ,
    '--klein-tool-shadow': theme.shadow,
    '--klein-tool-font': theme.fontFamily,
    '--klein-tool-math-font': theme.mathFontFamily,
  };
}

export type KleinToolThemeTarget = Pick<CSSStyleDeclaration, 'setProperty'> | { style: Pick<CSSStyleDeclaration, 'setProperty'> };

/** Applies a resolved palette to an element or a CSS style declaration. */
export function applyKleinToolTheme(target: KleinToolThemeTarget, input?: KleinToolThemeInput): KleinToolTheme {
  const style = 'style' in target ? target.style : target;
  const theme = resolveKleinToolTheme(input);
  for (const [name, value] of Object.entries(getKleinToolThemeCssVariables(theme))) {
    style.setProperty(name, value);
  }
  return theme;
}
