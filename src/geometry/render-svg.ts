import type { ExportOptions, Vector2, View2D } from '../core/index.js';
import type { GeometryEntityDisplay } from '../geometry-core/index.js';
import { distance2D } from '../geometry-core/index.js';
import { KLEIN_UI_FONT_STACK } from '../theme/index.js';
import { DEFAULT_DRAW_COLOR, DEFAULT_FILL, DEFAULT_WIDTH, SVG_NS } from './constants.js';
import { clipLineToBounds, clipRayToBounds, lineEquationFromEntityPoints } from './equations.js';
import { normalizeAngleDelta } from './geometry-math.js';
import { isPoint2D, orderedEntities, point2D } from './scene.js';
import { relationMarkerAnchor, relationMarkerLabel, sampledCurveSegments } from './snap.js';
import { chooseGridStep, geometryWorldToScreen, isMajorGridLine, screenToGeometryWorld } from './snapshot.js';
import { colorWithAlpha } from './theme.js';
import type { GeometryCalculatorSnapshot, GeometryGridOptions, WorldBounds } from './types.js';

export function exportBackground(background: ExportOptions['background']): string {
  if (background === undefined || background === 'white') return '#ffffff';
  if (background === 'transparent') return 'transparent';
  return background;
}


export function appendSvgGrid(
  bounds: WorldBounds,
  view: View2D,
  unitSize: number,
  grid: GeometryGridOptions,
  size: { width: number; height: number },
): string {
  const step = chooseGridStep(unitSize * view.zoom);
  const lines: string[] = ['<g data-klein-grid="true">'];
  const startX = Math.floor(bounds.minX / step) * step;
  const endX = Math.ceil(bounds.maxX / step) * step;
  for (let x = startX; x <= endX + 1e-9; x += step) {
    const screen = geometryWorldToScreen({ x, y: 0 }, view, unitSize);
    lines.push(svgElement('line', {
      x1: screen.x,
      y1: 0,
      x2: screen.x,
      y2: size.height,
      stroke: Math.abs(x) < 1e-9 ? '#94a3b8' : isMajorGridLine(x, grid.majorEvery) ? '#cbd5e1' : '#e7edf4',
      'stroke-width': Math.abs(x) < 1e-9 ? 1.5 : 0.75,
    }));
  }
  const startY = Math.floor(bounds.minY / step) * step;
  const endY = Math.ceil(bounds.maxY / step) * step;
  for (let y = startY; y <= endY + 1e-9; y += step) {
    const screen = geometryWorldToScreen({ x: 0, y }, view, unitSize);
    lines.push(svgElement('line', {
      x1: 0,
      y1: screen.y,
      x2: size.width,
      y2: screen.y,
      stroke: Math.abs(y) < 1e-9 ? '#94a3b8' : isMajorGridLine(y, grid.majorEvery) ? '#cbd5e1' : '#e7edf4',
      'stroke-width': Math.abs(y) < 1e-9 ? 1.5 : 0.75,
    }));
  }
  lines.push('</g>');
  return lines.join('');
}



export function geometrySceneToSvg(
  snapshot: GeometryCalculatorSnapshot,
  size: { width: number; height: number },
  options: ExportOptions = { format: 'svg' },
): string {
  const parts = [
    `<svg xmlns="${SVG_NS}" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">`,
    '<defs>',
    svgElement('marker', {
      id: 'kgc-arrow',
      markerWidth: 10,
      markerHeight: 10,
      refX: 9,
      refY: 3,
      orient: 'auto',
      markerUnits: 'strokeWidth',
    }, svgElement('path', {
      d: 'M 0 0 L 9 3 L 0 6 z',
      fill: DEFAULT_DRAW_COLOR,
    })),
    '</defs>',
  ];
  const backgroundFill = exportBackground(options.background);
  if (backgroundFill !== 'transparent') {
    parts.push(svgElement('rect', {
      width: '100%',
      height: '100%',
      fill: backgroundFill,
    }));
  }

  const view = snapshot.appState.view;
  const unitSize = snapshot.appState.grid.unitSize;
  const topLeft = screenToGeometryWorld({ x: 0, y: 0 }, view, unitSize);
  const bottomRight = screenToGeometryWorld({ x: size.width, y: size.height }, view, unitSize);
  const bounds: WorldBounds = {
    minX: Math.min(topLeft.x, bottomRight.x),
    maxX: Math.max(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxY: Math.max(topLeft.y, bottomRight.y),
  };

  if (options.includeGrid) parts.push(appendSvgGrid(bounds, view, unitSize, snapshot.appState.grid, size));

  for (const entity of orderedEntities(snapshot.scene)) {
    if (entity.hidden) continue;
    if (options.includeMeasurements === false && entity.kind === 'relationMarker') continue;

    if (entity.kind === 'polygon') {
      const points = entity.pointIds.map(id => point2D(snapshot.scene, id)).filter(isPoint2D);
      if (points.length < 3) continue;
      parts.push(svgElement('polygon', {
        points: points.map(point => {
          const screen = geometryWorldToScreen(point, view, unitSize);
          return `${screen.x},${screen.y}`;
        }).join(' '),
        fill: entity.fillColor ?? DEFAULT_FILL,
        stroke: entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
        'stroke-width': entity.width ?? DEFAULT_WIDTH,
      }));
      continue;
    }

    if (entity.kind === 'locus') {
      if (entity.points.length < 2) continue;
      parts.push(svgElement('path', {
        d: svgPathForWorldPoints(entity.points, view, unitSize, Boolean(entity.closed)),
        fill: entity.closed && entity.fillColor ? entity.fillColor : 'none',
        stroke: entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
        'stroke-width': entity.width ?? DEFAULT_WIDTH,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }));
      continue;
    }

    if (entity.kind === 'conic' || entity.kind === 'parametricCurve') {
      for (const segment of sampledCurveSegments(entity)) {
        if (segment.length < 2) continue;
        parts.push(svgElement('path', {
          d: svgPathForWorldPoints(segment, view, unitSize, Boolean(entity.closed)),
          fill: entity.closed && entity.fillColor ? entity.fillColor : 'none',
          stroke: entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
          'stroke-width': entity.width ?? DEFAULT_WIDTH,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }));
      }
      continue;
    }

    if (entity.kind === 'relationMarker') {
      const anchor = relationMarkerAnchor(snapshot.scene, entity);
      if (!anchor) continue;
      const screen = geometryWorldToScreen(anchor, view, unitSize);
      parts.push(svgElement('text', {
        x: screen.x + 6,
        y: screen.y - 6,
        fill: entity.color ?? DEFAULT_DRAW_COLOR,
        'font-size': 12,
        'font-family': KLEIN_UI_FONT_STACK,
      }, escapeXml(entity.text ?? entity.label ?? relationMarkerLabel(entity.relationKind))));
      continue;
    }

    if (entity.kind === 'circle') {
      const center = point2D(snapshot.scene, entity.centerId);
      if (!center || entity.radius <= 0) continue;
      const screen = geometryWorldToScreen(center, view, unitSize);
      parts.push(svgElement('circle', {
        cx: screen.x,
        cy: screen.y,
        r: entity.radius * unitSize * view.zoom,
        fill: entity.fillColor ?? colorWithAlpha(entity.color ?? DEFAULT_DRAW_COLOR, 0.1),
        stroke: entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
        'stroke-width': entity.width ?? DEFAULT_WIDTH,
      }));
      continue;
    }

    if (entity.kind === 'line') {
      const equation = entity.equation ?? lineEquationFromEntityPoints(snapshot.scene, entity);
      const clipped = equation ? clipLineToBounds(equation, bounds) : null;
      if (!clipped) continue;
      parts.push(svgLine(clipped[0], clipped[1], entity, view, unitSize));
      continue;
    }

    if (entity.kind === 'ray') {
      const a = point2D(snapshot.scene, entity.pointIds[0]);
      const b = point2D(snapshot.scene, entity.pointIds[1]);
      const clipped = a && b ? clipRayToBounds(a, b, bounds) : null;
      if (!clipped) continue;
      parts.push(svgLine(clipped[0], clipped[1], entity, view, unitSize));
      continue;
    }

    if (entity.kind === 'segment' || entity.kind === 'vector') {
      const a = point2D(snapshot.scene, entity.pointIds[0]);
      const b = point2D(snapshot.scene, entity.pointIds[1]);
      if (!a || !b) continue;
      parts.push(svgLine(a, b, entity, view, unitSize, entity.kind === 'vector'));
      continue;
    }

    if (entity.kind === 'arc') {
      const center = point2D(snapshot.scene, entity.centerId);
      const start = point2D(snapshot.scene, entity.startId);
      const end = point2D(snapshot.scene, entity.endId);
      if (!center || !start || !end) continue;
      parts.push(svgArc(center, start, end, entity, view, unitSize));
    }
  }
  parts.push('</svg>');
  return parts.join('');
}


export function svgLine(
  a: Vector2,
  b: Vector2,
  entity: GeometryEntityDisplay,
  view: View2D,
  unitSize: number,
  arrow = false,
): string {
  const sa = geometryWorldToScreen(a, view, unitSize);
  const sb = geometryWorldToScreen(b, view, unitSize);
  return svgElement('line', {
    x1: sa.x,
    y1: sa.y,
    x2: sb.x,
    y2: sb.y,
    stroke: entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
    'stroke-width': entity.width ?? DEFAULT_WIDTH,
    'stroke-linecap': 'round',
    'marker-end': arrow ? 'url(#kgc-arrow)' : undefined,
  });
}


export function svgArc(
  center: Vector2,
  start: Vector2,
  end: Vector2,
  entity: GeometryEntityDisplay,
  view: View2D,
  unitSize: number,
): string {
  const screenCenter = geometryWorldToScreen(center, view, unitSize);
  const screenStart = geometryWorldToScreen(start, view, unitSize);
  const screenEnd = geometryWorldToScreen(end, view, unitSize);
  const radius = distance2D(center, start) * unitSize * view.zoom;
  const startAngle = Math.atan2(screenStart.y - screenCenter.y, screenStart.x - screenCenter.x);
  const endAngle = Math.atan2(screenEnd.y - screenCenter.y, screenEnd.x - screenCenter.x);
  const delta = normalizeAngleDelta(endAngle - startAngle);
  const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;
  return svgElement('path', {
    d: `M ${screenStart.x} ${screenStart.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${screenEnd.x} ${screenEnd.y}`,
    fill: 'none',
    stroke: entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
    'stroke-width': entity.width ?? DEFAULT_WIDTH,
    'stroke-linecap': 'round',
  });
}


export function svgElement(
  name: string,
  attributes: Record<string, string | number | boolean | null | undefined>,
  content?: string,
): string {
  const renderedAttributes = Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => ` ${key}="${escapeXml(String(value))}"`)
    .join('');
  if (content === undefined) return `<${name}${renderedAttributes}/>`;
  return `<${name}${renderedAttributes}>${content}</${name}>`;
}


export function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, character => {
    switch (character) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return character;
    }
  });
}


export function svgPathForWorldPoints(points: Vector2[], view: View2D, unitSize: number, closed: boolean): string {
  const first = points[0];
  if (!first) return '';
  const start = geometryWorldToScreen(first, view, unitSize);
  const commands = [`M ${start.x} ${start.y}`];
  for (const point of points.slice(1)) {
    const screen = geometryWorldToScreen(point, view, unitSize);
    commands.push(`L ${screen.x} ${screen.y}`);
  }
  if (closed) commands.push('Z');
  return commands.join(' ');
}

