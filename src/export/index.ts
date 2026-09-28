import { KleinSdkError } from '../core/index.js';
import type { Vector2 } from '../core/index.js';

/**
 * Turning a rendered figure into a file somebody else's software can open.
 *
 * <p>Shared between the instruments rather than written twice. A PDF writer is
 * not interesting code - it is a fixed set of operators and a byte-offset table
 * - but it is exactly the kind of code that rots differently in two places, and
 * a figure that printed correctly from one instrument and not the other would
 * be a bug nobody could explain.
 *
 * <p>No dependency and no font embedding: the page uses Helvetica, which every
 * reader has, so the file is a few kilobytes of text rather than a few hundred
 * of typeface.
 */

/** Clamps into a range, since colour components have to land inside one. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function pdfNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number(value.toFixed(4)).toString();
}

export function escapePdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/[()\\]/g, match => `\\${match}`)
    .replace(/\r?\n/g, ' ');
}

export function normalizePdfColor(r: number, g: number, b: number, alpha: number): { r: number; g: number; b: number } {
  const a = clamp(alpha, 0, 1);
  return {
    r: clamp((r * a + 255 * (1 - a)) / 255, 0, 1),
    g: clamp((g * a + 255 * (1 - a)) / 255, 0, 1),
    b: clamp((b * a + 255 * (1 - a)) / 255, 0, 1),
  };
}

export function parsePdfColor(color: string, blendAlpha: boolean): { r: number; g: number; b: number } {
  const trimmed = color.trim();
  const hex = trimmed.match(/^#(?<hex>[0-9a-f]{6})(?<alpha>[0-9a-f]{2})?$/i);
  if (hex?.groups) {
    const raw = hex.groups.hex ?? '2563eb';
    const alpha = hex.groups.alpha ? Number.parseInt(hex.groups.alpha, 16) / 255 : 1;
    return normalizePdfColor(
      Number.parseInt(raw.slice(0, 2), 16),
      Number.parseInt(raw.slice(2, 4), 16),
      Number.parseInt(raw.slice(4, 6), 16),
      blendAlpha ? alpha : 1,
    );
  }
  const rgba = trimmed.match(/^rgba?\((?<r>[\d.]+),\s*(?<g>[\d.]+),\s*(?<b>[\d.]+)(?:,\s*(?<a>[\d.]+))?\)$/i);
  if (rgba?.groups) {
    return normalizePdfColor(
      Number(rgba.groups.r),
      Number(rgba.groups.g),
      Number(rgba.groups.b),
      blendAlpha ? Number(rgba.groups.a ?? 1) : 1,
    );
  }
  return normalizePdfColor(37, 99, 235, 1);
}

export function pdfStrokeColor(color: string): string {
  const rgb = parsePdfColor(color, false);
  return `${pdfNumber(rgb.r)} ${pdfNumber(rgb.g)} ${pdfNumber(rgb.b)} RG`;
}

export function pdfFillColor(color: string): string {
  const rgb = parsePdfColor(color, true);
  return `${pdfNumber(rgb.r)} ${pdfNumber(rgb.g)} ${pdfNumber(rgb.b)} rg`;
}

export function pdfText(
  text: string,
  screenPoint: Vector2,
  color: string,
  size: { width: number; height: number },
  fontSize = 12,
): string {
  return [
    'q',
    pdfFillColor(color),
    `BT /F1 ${pdfNumber(fontSize)} Tf ${pdfNumber(screenPoint.x)} ${pdfNumber(size.height - screenPoint.y)} Td (${escapePdfText(text)}) Tj ET`,
    'Q',
  ].join('\n');
}

export function pdfDocument(stream: string, size: { width: number; height: number }): string {
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj`,
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

export async function svgToPngBlob(svg: string, size: { width: number; height: number }): Promise<Blob> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new KleinSdkError('unsupported_export', 'PNG export requires a browser canvas environment.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new KleinSdkError('export_failed', 'Canvas context could not be created.');
  const image = new Image();
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new KleinSdkError('export_failed', 'SVG rasterization failed.'));
    image.src = url;
  });
  context.drawImage(image, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new KleinSdkError('export_failed', 'Canvas PNG export failed.');
  return blob;
}

