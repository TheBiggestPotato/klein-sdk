import type { Vector2 } from '../core/index.js';
import { KleinSdkError } from '../core/index.js';
import type { GeometryEntity, GeometryEntityDisplay, GeometryPoint2D } from '../geometry-core/index.js';
import type { KleinToolThemeInput } from '../theme/index.js';
import { KLEIN_UI_FONT_STACK, resolveKleinToolTheme } from '../theme/index.js';
import { DARK_GEOMETRY_CALCULATOR_THEME, LIGHT_GEOMETRY_CALCULATOR_THEME } from './constants.js';
import { clamp } from './geometry-math.js';
import type { GeometryCalculatorTheme, GeometryCalculatorThemeInput, GeometryCalculatorTool, GeometryStyleOptions } from './types.js';

export function inputStyle(width: string): Partial<CSSStyleDeclaration> {
  return {
    width,
    minHeight: '30px',
    border: '1px solid var(--kgc-button-border)',
    borderRadius: '6px',
    padding: '0 8px',
    color: 'var(--kgc-text)',
    background: 'var(--kgc-input-bg)',
    font: `600 12px/1 ${KLEIN_UI_FONT_STACK}`,
  };
}


export function emptyStateStyle(): Partial<CSSStyleDeclaration> {
  return {
    padding: '10px',
    border: '1px dashed var(--kgc-border)',
    borderRadius: '6px',
    color: 'var(--kgc-muted-text)',
    fontSize: '12px',
    lineHeight: '1.35',
  };
}


export function geometryObjectFilters(): Array<{ id: string; label: string }> {
  return [
    { id: 'point', label: 'Points' },
    { id: 'segment', label: 'Segments' },
    { id: 'line', label: 'Lines' },
    { id: 'ray', label: 'Rays' },
    { id: 'vector', label: 'Vectors' },
    { id: 'polygon', label: 'Polygons' },
    { id: 'circle', label: 'Circles' },
    { id: 'arc', label: 'Arcs' },
    { id: 'angle', label: 'Angles' },
    { id: 'curve', label: 'Curves' },
    { id: 'relationMarker', label: 'Markers' },
  ];
}


export function toolPreviewText(tool: GeometryCalculatorTool): string {
  if (tool === 'point' || tool === 'midpoint' || tool === 'intersect') return 'A . B';
  if (tool === 'segment') return 'A --- B';
  if (tool === 'line' || tool === 'parallel' || tool === 'perpendicular' || tool === 'tangent') return '<--- line --->';
  if (tool === 'ray') return 'A --->';
  if (tool === 'vector') return 'A ==> B';
  if (tool === 'polygon' || tool === 'triangle' || tool === 'rectangle' || tool === 'square' || tool === 'regularPolygon') return '/\\ shape';
  if (tool === 'circle' || tool === 'circleThroughPoints' || tool === 'arc') return '( circle )';
  if (tool === 'angle' || tool === 'angleBisector') return '< angle';
  if (tool === 'conic' || tool === 'parametricCurve') return 'curve(t)';
  if (tool === 'remove') return 'delete x';
  if (tool === 'pan') return 'move view';
  return 'select';
}


export function resolveGeometryCalculatorTheme(
  input: GeometryCalculatorThemeInput | undefined,
): GeometryCalculatorTheme {
  if (input === 'dark') return { ...DARK_GEOMETRY_CALCULATOR_THEME };
  if (input === 'light' || input === undefined) return { ...LIGHT_GEOMETRY_CALCULATOR_THEME };
  const base = input.colorScheme === 'dark' || input.name === 'dark'
    ? DARK_GEOMETRY_CALCULATOR_THEME
    : LIGHT_GEOMETRY_CALCULATOR_THEME;
  return { ...base, ...input };
}


export function geometryThemeFromPalette(input: KleinToolThemeInput | undefined): Partial<GeometryCalculatorTheme> | undefined {
  if (input === undefined) return undefined;
  const palette = resolveKleinToolTheme(input);
  return {
    name: palette.name,
    colorScheme: palette.colorScheme,
    background: palette.background,
    surface: palette.background,
    surfaceRaised: palette.surfaceRaised,
    canvas: palette.canvas,
    border: palette.border,
    text: palette.text,
    mutedText: palette.mutedText,
    faintText: palette.faintText,
    inputBackground: palette.surface,
    buttonBackground: palette.surfaceRaised,
    buttonText: palette.text,
    buttonBorder: palette.border,
    buttonActiveBackground: palette.primary,
    buttonActiveText: palette.primaryForeground,
    accent: palette.primary,
    drawColor: palette.accent,
    pointColor: palette.text,
    fill: palette.accentSoft,
    selection: palette.primary,
    gridMinor: palette.gridMinor,
    gridMajor: palette.gridMajor,
    axis: palette.axis,
    gridLabel: palette.mutedText,
    draft: palette.accent,
    textHalo: palette.colorScheme === 'dark' ? 'rgba(37,43,49,0.92)' : 'rgba(255,255,255,0.92)',
    angle: palette.primary,
    angleText: palette.primary,
  };
}


export function applyGeometryCalculatorTheme(root: HTMLElement, theme: GeometryCalculatorTheme): void {
  const tokens: Record<string, string> = {
    '--kgc-background': theme.background,
    '--kgc-surface': theme.surface,
    '--kgc-surface-raised': theme.surfaceRaised,
    '--kgc-canvas': theme.canvas,
    '--kgc-border': theme.border,
    '--kgc-text': theme.text,
    '--kgc-muted-text': theme.mutedText,
    '--kgc-faint-text': theme.faintText,
    '--kgc-input-bg': theme.inputBackground,
    '--kgc-button-bg': theme.buttonBackground,
    '--kgc-button-text': theme.buttonText,
    '--kgc-button-border': theme.buttonBorder,
    '--kgc-button-active-bg': theme.buttonActiveBackground,
    '--kgc-button-active-text': theme.buttonActiveText,
    '--kgc-accent': theme.accent,
  };
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
}


export function readNumberInput(input: HTMLInputElement): number {
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    throw new KleinSdkError('invalid_number', `Invalid number: ${input.value}`);
  }
  return value;
}


export function withPointStyle(point: GeometryPoint2D, style: GeometryStyleOptions): GeometryPoint2D {
  const next: GeometryPoint2D = { ...point };
  if (style.label !== undefined) next.label = style.label;
  if (style.color !== undefined) next.color = style.color;
  if (style.hidden !== undefined) next.hidden = style.hidden;
  if (style.locked !== undefined) next.locked = style.locked;
  return next;
}


export function withEntityStyle<T extends GeometryEntity>(
  entity: T,
  style: GeometryStyleOptions,
  defaultColor: string,
): T {
  const next = { ...entity } as T & GeometryEntityDisplay;
  const color = style.color ?? style.strokeColor ?? defaultColor;
  if (style.label !== undefined) next.label = style.label;
  if (style.color !== undefined || !next.color) next.color = color;
  if (style.strokeColor !== undefined) next.strokeColor = style.strokeColor;
  if (style.fillColor !== undefined) next.fillColor = style.fillColor;
  if (style.width !== undefined && Number.isFinite(style.width) && style.width > 0) next.width = style.width;
  if (style.hidden !== undefined) next.hidden = style.hidden;
  if (style.locked !== undefined) next.locked = style.locked;
  return next as T;
}


export function colorWithAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#') || color.length !== 7) return color;
  const value = Math.round(clamp(alpha, 0, 1) * 255).toString(16).padStart(2, '0');
  return `${color}${value}`;
}


export function drawArrowHead(ctx: CanvasRenderingContext2D, from: Vector2, to: Vector2, color: string): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = 10;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(angle - Math.PI / 6) * length, to.y - Math.sin(angle - Math.PI / 6) * length);
  ctx.lineTo(to.x - Math.cos(angle + Math.PI / 6) * length, to.y - Math.sin(angle + Math.PI / 6) * length);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

