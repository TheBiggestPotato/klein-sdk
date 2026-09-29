import type { ExportOptions, Vector2, View2D } from '../core/index.js';
import { pdfDocument, pdfFillColor, pdfNumber, pdfStrokeColor, pdfText } from '../export/index.js';
import type { GeometryEntityDisplay } from '../geometry-core/index.js';
import { distance2D } from '../geometry-core/index.js';
import { DEFAULT_DRAW_COLOR, DEFAULT_FILL, DEFAULT_WIDTH } from './constants.js';
import { clipLineToBounds, clipRayToBounds, lineEquationFromEntityPoints } from './equations.js';
import { normalizeAngleDelta } from './geometry-math.js';
import { exportBackground } from './render-svg.js';
import { isPoint2D, orderedEntities, point2D } from './scene.js';
import { relationMarkerAnchor, relationMarkerLabel, sampledCurveSegments } from './snap.js';
import { chooseGridStep, geometryWorldToScreen, isMajorGridLine, screenToGeometryWorld } from './snapshot.js';
import { colorWithAlpha } from './theme.js';
import type { GeometryCalculatorSnapshot, GeometryGridOptions, WorldBounds } from './types.js';

export function geometrySceneToPdfBlob(
  snapshot: GeometryCalculatorSnapshot,
  size: { width: number; height: number },
  options: ExportOptions,
  title: string,
): Blob {
  const stream = geometrySceneToPdfStream(snapshot, size, options, title);
  return new Blob([pdfDocument(stream, size)], { type: 'application/pdf' });
}


export function geometrySceneToPdfStream(
  snapshot: GeometryCalculatorSnapshot,
  size: { width: number; height: number },
  options: ExportOptions,
  title: string,
): string {
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
  const commands: string[] = [];
  const backgroundFill = exportBackground(options.background);
  if (backgroundFill !== 'transparent') {
    commands.push(
      'q',
      pdfFillColor(backgroundFill),
      `0 0 ${pdfNumber(size.width)} ${pdfNumber(size.height)} re f`,
      'Q',
    );
  }
  if (options.includeGrid) {
    commands.push(pdfGrid(bounds, view, unitSize, snapshot.appState.grid, size));
  }

  for (const entity of orderedEntities(snapshot.scene)) {
    if (entity.hidden) continue;
    if (options.includeMeasurements === false && entity.kind === 'relationMarker') continue;
    if (entity.kind === 'polygon') {
      const points = entity.pointIds.map(id => point2D(snapshot.scene, id)).filter(isPoint2D);
      if (points.length < 3) continue;
      commands.push(pdfPolyline(
        points,
        view,
        unitSize,
        size,
        true,
        entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
        entity.fillColor ?? DEFAULT_FILL,
        entity.width ?? DEFAULT_WIDTH,
      ));
      continue;
    }
    if (entity.kind === 'locus') {
      if (entity.points.length < 2) continue;
      commands.push(pdfPolyline(
        entity.points,
        view,
        unitSize,
        size,
        Boolean(entity.closed),
        entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
        entity.closed && entity.fillColor ? entity.fillColor : null,
        entity.width ?? DEFAULT_WIDTH,
      ));
      continue;
    }
    if (entity.kind === 'conic' || entity.kind === 'parametricCurve') {
      for (const segment of sampledCurveSegments(entity)) {
        if (segment.length < 2) continue;
        commands.push(pdfPolyline(
          segment,
          view,
          unitSize,
          size,
          Boolean(entity.closed),
          entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
          entity.closed && entity.fillColor ? entity.fillColor : null,
          entity.width ?? DEFAULT_WIDTH,
        ));
      }
      continue;
    }
    if (entity.kind === 'relationMarker') {
      const anchor = relationMarkerAnchor(snapshot.scene, entity);
      if (!anchor) continue;
      const screen = geometryWorldToScreen(anchor, view, unitSize);
      commands.push(pdfText(
        entity.text ?? entity.label ?? relationMarkerLabel(entity.relationKind),
        { x: screen.x + 6, y: screen.y - 6 },
        entity.color ?? DEFAULT_DRAW_COLOR,
        size,
      ));
      continue;
    }
    if (entity.kind === 'circle') {
      const center = point2D(snapshot.scene, entity.centerId);
      if (!center || entity.radius <= 0) continue;
      commands.push(pdfCircle(
        center,
        entity.radius * unitSize * view.zoom,
        view,
        unitSize,
        entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
        entity.fillColor ?? colorWithAlpha(entity.color ?? DEFAULT_DRAW_COLOR, 0.1),
        entity.width ?? DEFAULT_WIDTH,
        size,
      ));
      continue;
    }
    if (entity.kind === 'line') {
      const equation = entity.equation ?? lineEquationFromEntityPoints(snapshot.scene, entity);
      const clipped = equation ? clipLineToBounds(equation, bounds) : null;
      if (!clipped) continue;
      commands.push(pdfLine(clipped[0], clipped[1], entity, view, unitSize, size));
      continue;
    }
    if (entity.kind === 'ray') {
      const a = point2D(snapshot.scene, entity.pointIds[0]);
      const b = point2D(snapshot.scene, entity.pointIds[1]);
      const clipped = a && b ? clipRayToBounds(a, b, bounds) : null;
      if (!clipped) continue;
      commands.push(pdfLine(clipped[0], clipped[1], entity, view, unitSize, size));
      continue;
    }
    if (entity.kind === 'segment' || entity.kind === 'vector') {
      const a = point2D(snapshot.scene, entity.pointIds[0]);
      const b = point2D(snapshot.scene, entity.pointIds[1]);
      if (!a || !b) continue;
      commands.push(pdfLine(a, b, entity, view, unitSize, size));
      continue;
    }
    if (entity.kind === 'arc') {
      const center = point2D(snapshot.scene, entity.centerId);
      const start = point2D(snapshot.scene, entity.startId);
      const end = point2D(snapshot.scene, entity.endId);
      if (!center || !start || !end) continue;
      commands.push(pdfArc(center, start, end, entity, view, unitSize, size));
    }
  }

  commands.push(pdfText(title, { x: 16, y: size.height - 18 }, '#64748b', size, 9));
  return commands.filter(Boolean).join('\n');
}



export function pdfGrid(
  bounds: WorldBounds,
  view: View2D,
  unitSize: number,
  grid: GeometryGridOptions,
  size: { width: number; height: number },
): string {
  const step = chooseGridStep(unitSize * view.zoom);
  const commands = ['q', '0.75 w'];
  const startX = Math.floor(bounds.minX / step) * step;
  const endX = Math.ceil(bounds.maxX / step) * step;
  for (let x = startX; x <= endX + 1e-9; x += step) {
    const screen = geometryWorldToScreen({ x, y: 0 }, view, unitSize);
    commands.push(
      Math.abs(x) < 1e-9 ? pdfStrokeColor('#94a3b8') : pdfStrokeColor(isMajorGridLine(x, grid.majorEvery) ? '#cbd5e1' : '#e7edf4'),
      `${pdfNumber(screen.x)} 0 m ${pdfNumber(screen.x)} ${pdfNumber(size.height)} l S`,
    );
  }
  const startY = Math.floor(bounds.minY / step) * step;
  const endY = Math.ceil(bounds.maxY / step) * step;
  for (let y = startY; y <= endY + 1e-9; y += step) {
    const screen = geometryWorldToScreen({ x: 0, y }, view, unitSize);
    const pdfY = size.height - screen.y;
    commands.push(
      Math.abs(y) < 1e-9 ? pdfStrokeColor('#94a3b8') : pdfStrokeColor(isMajorGridLine(y, grid.majorEvery) ? '#cbd5e1' : '#e7edf4'),
      `0 ${pdfNumber(pdfY)} m ${pdfNumber(size.width)} ${pdfNumber(pdfY)} l S`,
    );
  }
  commands.push('Q');
  return commands.join('\n');
}


export function pdfLine(
  a: Vector2,
  b: Vector2,
  entity: GeometryEntityDisplay,
  view: View2D,
  unitSize: number,
  size: { width: number; height: number },
): string {
  const start = pdfPoint(a, view, unitSize, size);
  const end = pdfPoint(b, view, unitSize, size);
  return [
    'q',
    pdfStrokeColor(entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR),
    `${pdfNumber(entity.width ?? DEFAULT_WIDTH)} w`,
    `${pdfNumber(start.x)} ${pdfNumber(start.y)} m ${pdfNumber(end.x)} ${pdfNumber(end.y)} l S`,
    'Q',
  ].join('\n');
}


export function pdfPolyline(
  points: Vector2[],
  view: View2D,
  unitSize: number,
  size: { width: number; height: number },
  closed: boolean,
  strokeColor: string,
  fillColor: string | null,
  width: number,
): string {
  const [first, ...rest] = points;
  if (!first) return '';
  const start = pdfPoint(first, view, unitSize, size);
  const commands = [
    'q',
    pdfStrokeColor(strokeColor),
    fillColor ? pdfFillColor(fillColor) : '',
    `${pdfNumber(width)} w`,
    `${pdfNumber(start.x)} ${pdfNumber(start.y)} m`,
  ];
  for (const point of rest) {
    const pdf = pdfPoint(point, view, unitSize, size);
    commands.push(`${pdfNumber(pdf.x)} ${pdfNumber(pdf.y)} l`);
  }
  if (closed) commands.push('h');
  commands.push(fillColor ? 'B' : 'S', 'Q');
  return commands.filter(Boolean).join('\n');
}


export function pdfCircle(
  center: Vector2,
  radius: number,
  view: View2D,
  unitSize: number,
  strokeColor: string,
  fillColor: string | null,
  width: number,
  size: { width: number; height: number },
): string {
  const c = pdfPoint(center, view, unitSize, size);
  const k = radius * 0.5522847498307936;
  const r = radius;
  return [
    'q',
    pdfStrokeColor(strokeColor),
    fillColor ? pdfFillColor(fillColor) : '',
    `${pdfNumber(width)} w`,
    `${pdfNumber(c.x + r)} ${pdfNumber(c.y)} m`,
    `${pdfNumber(c.x + r)} ${pdfNumber(c.y + k)} ${pdfNumber(c.x + k)} ${pdfNumber(c.y + r)} ${pdfNumber(c.x)} ${pdfNumber(c.y + r)} c`,
    `${pdfNumber(c.x - k)} ${pdfNumber(c.y + r)} ${pdfNumber(c.x - r)} ${pdfNumber(c.y + k)} ${pdfNumber(c.x - r)} ${pdfNumber(c.y)} c`,
    `${pdfNumber(c.x - r)} ${pdfNumber(c.y - k)} ${pdfNumber(c.x - k)} ${pdfNumber(c.y - r)} ${pdfNumber(c.x)} ${pdfNumber(c.y - r)} c`,
    `${pdfNumber(c.x + k)} ${pdfNumber(c.y - r)} ${pdfNumber(c.x + r)} ${pdfNumber(c.y - k)} ${pdfNumber(c.x + r)} ${pdfNumber(c.y)} c`,
    fillColor ? 'B' : 'S',
    'Q',
  ].filter(Boolean).join('\n');
}


export function pdfArc(
  center: Vector2,
  start: Vector2,
  end: Vector2,
  entity: GeometryEntityDisplay,
  view: View2D,
  unitSize: number,
  size: { width: number; height: number },
): string {
  const centerScreen = geometryWorldToScreen(center, view, unitSize);
  const startScreen = geometryWorldToScreen(start, view, unitSize);
  const endScreen = geometryWorldToScreen(end, view, unitSize);
  const radius = distance2D(center, start) * unitSize * view.zoom;
  const startAngle = Math.atan2(startScreen.y - centerScreen.y, startScreen.x - centerScreen.x);
  const endAngle = Math.atan2(endScreen.y - centerScreen.y, endScreen.x - centerScreen.x);
  const delta = normalizeAngleDelta(endAngle - startAngle);
  const steps = Math.max(8, Math.ceil(Math.abs(delta) / (Math.PI / 18)));
  const points: Vector2[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = startAngle + (delta * index) / steps;
    const screenPoint = {
      x: centerScreen.x + Math.cos(angle) * radius,
      y: centerScreen.y + Math.sin(angle) * radius,
    };
    points.push(screenToGeometryWorld(screenPoint, view, unitSize));
  }
  return pdfPolyline(
    points,
    view,
    unitSize,
    size,
    false,
    entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
    null,
    entity.width ?? DEFAULT_WIDTH,
  );
}



export function pdfPoint(
  point: Vector2,
  view: View2D,
  unitSize: number,
  size: { width: number; height: number },
): Vector2 {
  const screen = geometryWorldToScreen(point, view, unitSize);
  return { x: screen.x, y: size.height - screen.y };
}







