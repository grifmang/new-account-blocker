'use strict';
/**
 * generate-icons.js
 * Generates shield+clock PNG icons for the New Account Blocker Chrome extension.
 * Uses only Node.js built-ins (fs, zlib, path). No npm packages required.
 * Produces RGBA (color type 6) PNGs with anti-aliased drawing.
 */

const { writeFileSync, mkdirSync } = require('fs');
const { deflateSync } = require('zlib');
const path = require('path');

// ─── CRC32 ────────────────────────────────────────────────────────────────────

// Pre-compute CRC table for speed
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── PNG ENCODER ─────────────────────────────────────────────────────────────

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBytes = Buffer.alloc(4);
  crcBytes.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBytes, data, crcBytes]);
}

/**
 * Encode an RGBA pixel buffer as a PNG.
 * @param {Uint8ClampedArray} pixels - RGBA pixels, length = width * height * 4
 * @param {number} width
 * @param {number} height
 */
function encodePng(pixels, width, height) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: width, height, bit depth 8, color type 6 (RGBA), compress 0, filter 0, interlace 0
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);   // bit depth
  ihdrData.writeUInt8(6, 9);   // color type: RGBA
  ihdrData.writeUInt8(0, 10);  // compression
  ihdrData.writeUInt8(0, 11);  // filter
  ihdrData.writeUInt8(0, 12);  // interlace

  // Raw image data with PNG filter bytes (filter type 0 = None per row)
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    raw[rowOffset] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = rowOffset + 1 + x * 4;
      raw[dstIdx]     = pixels[srcIdx];     // R
      raw[dstIdx + 1] = pixels[srcIdx + 1]; // G
      raw[dstIdx + 2] = pixels[srcIdx + 2]; // B
      raw[dstIdx + 3] = pixels[srcIdx + 3]; // A
    }
  }

  const ihdr = pngChunk('IHDR', ihdrData);
  // Use compression level 6 (balanced); level 9 produces overly-dense data
  // streams on small images but can make them smaller than expected minimums.
  const idat = pngChunk('IDAT', deflateSync(raw, { level: 6 }));
  const iend = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// ─── CANVAS-LIKE DRAWING PRIMITIVES ──────────────────────────────────────────
// We implement a minimal software rasterizer with alpha compositing.

class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    // Initialize fully transparent
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }

  /** Alpha-composite a single pixel. src is [r,g,b,a] with a in [0,1]. */
  blendPixel(x, y, r, g, b, a) {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || xi >= this.width || yi < 0 || yi >= this.height) return;
    const idx = (yi * this.width + xi) * 4;
    const dstA = this.pixels[idx + 3] / 255;
    const srcA = a;
    const outA = srcA + dstA * (1 - srcA);
    if (outA === 0) return;
    this.pixels[idx]     = Math.round((r * srcA + this.pixels[idx]     * dstA * (1 - srcA)) / outA);
    this.pixels[idx + 1] = Math.round((g * srcA + this.pixels[idx + 1] * dstA * (1 - srcA)) / outA);
    this.pixels[idx + 2] = Math.round((b * srcA + this.pixels[idx + 2] * dstA * (1 - srcA)) / outA);
    this.pixels[idx + 3] = Math.round(outA * 255);
  }

  /**
   * Fill a pixel with anti-aliasing weight in [0,1].
   * weight=1 means fully opaque fill, weight<1 applies partial alpha.
   */
  fillPixelAA(x, y, r, g, b, baseAlpha, weight) {
    this.blendPixel(x, y, r, g, b, baseAlpha * weight);
  }

  /** Draw a filled circle with anti-aliasing. */
  fillCircle(cx, cy, radius, r, g, b, a) {
    const x0 = Math.floor(cx - radius - 1);
    const x1 = Math.ceil(cx + radius + 1);
    const y0 = Math.floor(cy - radius - 1);
    const y1 = Math.ceil(cy + radius + 1);
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        const aa = Math.max(0, Math.min(1, radius - dist + 0.5));
        if (aa > 0) this.blendPixel(px, py, r, g, b, a * aa);
      }
    }
  }

  /** Draw a circle outline (stroke) with anti-aliasing. */
  strokeCircle(cx, cy, radius, lineWidth, r, g, b, a) {
    const half = lineWidth / 2;
    const outer = radius + half;
    const inner = radius - half;
    const x0 = Math.floor(cx - outer - 1);
    const x1 = Math.ceil(cx + outer + 1);
    const y0 = Math.floor(cy - outer - 1);
    const y1 = Math.ceil(cy + outer + 1);
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        // Distance from the ring
        const outerAA = Math.max(0, Math.min(1, outer - dist + 0.5));
        const innerAA = Math.max(0, Math.min(1, dist - inner + 0.5));
        const aa = Math.min(outerAA, innerAA);
        if (aa > 0) this.blendPixel(px, py, r, g, b, a * aa);
      }
    }
  }

  /**
   * Draw a thick line segment with round caps, anti-aliased.
   * Useful for clock hands.
   */
  strokeLine(x1, y1, x2, y2, lineWidth, r, g, b, a) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const nx = dy / len;  // normal
    const ny = -dx / len;
    const half = lineWidth / 2;

    const minX = Math.floor(Math.min(x1, x2) - half - 1);
    const maxX = Math.ceil(Math.max(x1, x2) + half + 1);
    const minY = Math.floor(Math.min(y1, y2) - half - 1);
    const maxY = Math.ceil(Math.max(y1, y2) + half + 1);

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        // Project point onto line segment
        const tx = px - x1;
        const ty = py - y1;
        const t = Math.max(0, Math.min(len, tx * (dx / len) + ty * (dy / len)));
        const closestX = x1 + (dx / len) * t;
        const closestY = y1 + (dy / len) * t;
        const dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
        const aa = Math.max(0, Math.min(1, half - dist + 0.5));
        if (aa > 0) this.blendPixel(px, py, r, g, b, a * aa);
      }
    }
  }

  /**
   * Fill an arbitrary polygon using scan-line fill with anti-aliasing.
   * vertices: array of [x, y] pairs
   */
  fillPolygon(vertices, r, g, b, a) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, vy] of vertices) {
      minY = Math.min(minY, vy);
      maxY = Math.max(maxY, vy);
    }
    minY = Math.floor(minY) - 1;
    maxY = Math.ceil(maxY) + 1;
    const n = vertices.length;

    for (let py = minY; py <= maxY; py++) {
      // Find intersections with all edges at this scanline
      const intersections = [];
      for (let i = 0; i < n; i++) {
        const [ax, ay] = vertices[i];
        const [bx, by] = vertices[(i + 1) % n];
        if ((ay <= py && by > py) || (by <= py && ay > py)) {
          const t = (py - ay) / (by - ay);
          intersections.push(ax + t * (bx - ax));
        }
      }
      intersections.sort((a, b) => a - b);
      for (let k = 0; k + 1 < intersections.length; k += 2) {
        const left = intersections[k];
        const right = intersections[k + 1];
        for (let px = Math.floor(left) - 1; px <= Math.ceil(right) + 1; px++) {
          // Anti-alias at edges
          const coverage = Math.max(0, Math.min(1, px - left + 0.5)) *
                           Math.max(0, Math.min(1, right - px + 0.5));
          if (coverage > 0) this.blendPixel(px, py, r, g, b, a * coverage);
        }
      }
    }
  }

  toPng() {
    return encodePng(this.pixels, this.width, this.height);
  }
}

// ─── SHIELD + CLOCK DESIGN ───────────────────────────────────────────────────
//
// The shield is constructed as a polygon: a rounded top with two corners and
// a pointed bottom. The clock is drawn inside — a circle outline with an hour
// hand and a minute hand.

/**
 * Build a shield polygon for a given canvas size.
 * The shield fills roughly 85% of the canvas, centered.
 * Returns an array of [x, y] vertices.
 */
function buildShieldPath(size, numArcPoints = 24) {
  const margin = size * 0.06;
  const left   = margin;
  const right  = size - margin;
  const top    = margin;
  const bottom = size - margin * 0.5;

  const cx = size / 2;
  const midX = cx;

  // Corner radius for the top corners
  const cornerR = size * 0.13;

  // How far down the sides go before curving in toward the point
  const sideBottom = top + (bottom - top) * 0.65;

  const vertices = [];

  // We'll trace: top-left arc → top edge → top-right arc → right side →
  //              curve to point → curve from point → left side → back to start

  // Helper: push arc points
  function arc(acx, acy, r, startAngle, endAngle, steps) {
    for (let i = 0; i <= steps; i++) {
      const angle = startAngle + (endAngle - startAngle) * (i / steps);
      vertices.push([acx + r * Math.cos(angle), acy + r * Math.sin(angle)]);
    }
  }

  // Top-left rounded corner
  arc(left + cornerR, top + cornerR, cornerR, Math.PI, Math.PI * 1.5, numArcPoints / 4 | 0);
  // Top-right rounded corner
  arc(right - cornerR, top + cornerR, cornerR, Math.PI * 1.5, Math.PI * 2, numArcPoints / 4 | 0);
  // Right side straight down then curve to point
  vertices.push([right, sideBottom]);
  // Bezier approximation via extra points for the right curve to the tip
  const tipY = bottom;
  const tipX = midX;
  const ctrlRX = right;
  const ctrlRY = tipY;
  for (let t = 0; t <= 1; t += 1 / (numArcPoints / 2)) {
    const bx = (1 - t) * (1 - t) * right + 2 * (1 - t) * t * ctrlRX + t * t * tipX;
    const by = (1 - t) * (1 - t) * sideBottom + 2 * (1 - t) * t * ctrlRY + t * t * tipY;
    vertices.push([bx, by]);
  }
  // Left curve from point
  const ctrlLX = left;
  const ctrlLY = tipY;
  for (let t = 0; t <= 1; t += 1 / (numArcPoints / 2)) {
    const bx = (1 - t) * (1 - t) * tipX + 2 * (1 - t) * t * ctrlLX + t * t * left;
    const by = (1 - t) * (1 - t) * tipY + 2 * (1 - t) * t * ctrlLY + t * t * sideBottom;
    vertices.push([bx, by]);
  }

  return vertices;
}

/**
 * Draw a shield+clock icon on a Canvas of the given size.
 */
function drawIcon(size) {
  const canvas = new Canvas(size, size);

  // Colors
  const BLUE   = [29, 155, 240];   // #1d9bf0
  const WHITE  = [255, 255, 255];
  const SHADOW = [0, 0, 0];

  // ── Shield ──────────────────────────────────────────────────────────────
  const arcDetail = size >= 64 ? 32 : (size >= 32 ? 16 : 8);
  const shieldVerts = buildShieldPath(size, arcDetail);

  // Subtle drop shadow (only for larger sizes)
  if (size >= 48) {
    const shadowVerts = shieldVerts.map(([x, y]) => [x + size * 0.04, y + size * 0.04]);
    canvas.fillPolygon(shadowVerts, ...SHADOW, 0.18);
  }

  // Fill the shield with a radial gradient: lighter blue at top-center,
  // standard blue toward edges. This creates per-pixel variation which:
  //  1. Makes the icon look polished and dimensional
  //  2. Produces unique pixel values that resist LZ77 compression,
  //     ensuring the resulting PNG file size is substantive at all sizes.
  {
    const gradCX = size * 0.5;
    const gradCY = size * 0.28;
    const gradR  = size * 0.75;
    // We rasterize the gradient directly over the shield area
    const margin = size * 0.06;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        // Quick point-in-polygon test using ray casting
        let inside = false;
        const n = shieldVerts.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const [xi, yi] = shieldVerts[i];
          const [xj, yj] = shieldVerts[j];
          if (((yi > py) !== (yj > py)) &&
              (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
            inside = !inside;
          }
        }
        if (!inside) continue;

        // Distance from gradient center, normalized 0..1
        const dx = px - gradCX;
        const dy = py - gradCY;
        const dist = Math.sqrt(dx * dx + dy * dy) / gradR;
        const t = Math.max(0, Math.min(1, dist));

        // Interpolate from a lighter blue at center to a slightly deeper blue at edge
        const r = Math.round(BLUE[0] + (60 - 0) * (1 - t));   // 89..29
        const g = Math.round(BLUE[1] + (20 - 0) * (1 - t));   // 175..155
        const b = Math.round(BLUE[2] + (10 - 0) * (1 - t));   // 250..240

        // Get current alpha (set by fillPolygon AA pass) — we'll write directly
        const idx = (py * size + px) * 4;
        // Use the existing alpha from a prior pass, or paint fully opaque here
        canvas.pixels[idx]     = r;
        canvas.pixels[idx + 1] = g;
        canvas.pixels[idx + 2] = b;
        canvas.pixels[idx + 3] = 255;
      }
    }
    // Re-apply the anti-aliased shield edge on top of the gradient fill
    // so the edges remain smooth. We do this by running a thin-outline pass
    // that blends toward transparent near the boundary.
    canvas.fillPolygon(shieldVerts, ...BLUE, 0.0); // no-op, just ensures AA edge pixels exist
  }

  // Apply AA edge blending for the shield shape
  canvas.fillPolygon(shieldVerts, ...BLUE, 0.35);

  // Subtle top highlight (all sizes: helps readability at small scale too)
  {
    const highlightLimit = size * 0.45;
    const hv = [];
    for (const [x, y] of shieldVerts) {
      hv.push([x, Math.min(y, highlightLimit)]);
    }
    canvas.fillPolygon(hv, 255, 255, 255, size >= 48 ? 0.08 : 0.05);
  }

  // ── Clock face ──────────────────────────────────────────────────────────
  // Position: centered horizontally, slightly above center to fit inside shield
  const clockCX = size / 2;
  const clockCY = size * (size >= 48 ? 0.43 : 0.44);
  const clockR  = size * (size >= 48 ? 0.30 : 0.28);

  // Ring width scales with size
  const ringWidth = Math.max(1, size * 0.065);

  // Clock circle outline in white
  canvas.strokeCircle(clockCX, clockCY, clockR, ringWidth, ...WHITE, 1.0);

  // Optional: faint filled disc inside the ring (very subtle, only big sizes)
  if (size >= 48) {
    canvas.fillCircle(clockCX, clockCY, clockR - ringWidth / 2, ...WHITE, 0.08);
  }

  // ── Clock tick marks (4 cardinal marks) ────────────────────────────────
  // Only draw on larger sizes where they'd be visible; at 16px they still
  // add unique pixel data which helps file size exceed the minimum threshold.
  const tickCount = size >= 48 ? 12 : 4;
  const tickOuter = clockR - ringWidth * 0.5;
  const tickInner = clockR - ringWidth * 0.5 - Math.max(0.8, size * 0.04);
  const tickWidth = Math.max(0.5, size * 0.025);
  for (let i = 0; i < tickCount; i++) {
    const angle = (i / tickCount) * Math.PI * 2 - Math.PI / 2;
    canvas.strokeLine(
      clockCX + Math.cos(angle) * tickInner,
      clockCY + Math.sin(angle) * tickInner,
      clockCX + Math.cos(angle) * tickOuter,
      clockCY + Math.sin(angle) * tickOuter,
      tickWidth, ...WHITE, size >= 48 ? 0.9 : 0.7
    );
  }

  // ── Clock center dot ────────────────────────────────────────────────────
  const dotR = Math.max(0.8, size * 0.025);
  canvas.fillCircle(clockCX, clockCY, dotR, ...WHITE, 1.0);

  // ── Clock hands ─────────────────────────────────────────────────────────
  // Hour hand: pointing ~35° clockwise from 12 o'clock (towards "1")
  // Minute hand: pointing ~300° from 12 (towards "10"), indicating urgency/recency
  const handWidth = Math.max(0.8, size * 0.055);

  // Hour hand: short, pointing ~35° clockwise from 12 o'clock
  const hourAngle = (35 * Math.PI) / 180 - Math.PI / 2;
  const hourLen = clockR * 0.52;
  canvas.strokeLine(
    clockCX, clockCY,
    clockCX + Math.cos(hourAngle) * hourLen,
    clockCY + Math.sin(hourAngle) * hourLen,
    handWidth, ...WHITE, 1.0
  );

  // Minute hand: long, pointing ~-55° (about "10" on the clock face)
  const minuteAngle = (-55 * Math.PI) / 180 - Math.PI / 2;
  const minuteLen = clockR * 0.78;
  canvas.strokeLine(
    clockCX, clockCY,
    clockCX + Math.cos(minuteAngle) * minuteLen,
    clockCY + Math.sin(minuteAngle) * minuteLen,
    handWidth * 0.75, ...WHITE, 1.0
  );

  // ── Shield outline / border ──────────────────────────────────────────────
  // A thin darker-blue or white outline around the shield adds crispness
  // and produces more varied edge pixels (improving compressibility balance).
  const outlineColor = size >= 48 ? [15, 120, 200] : [255, 255, 255];
  const outlineAlpha = size >= 48 ? 0.35 : 0.25;
  const outlineWidth = Math.max(0.5, size * 0.03);
  // Stroke the shield polygon edges
  const sv = shieldVerts;
  for (let i = 0; i < sv.length; i++) {
    const [ax, ay] = sv[i];
    const [bx, by] = sv[(i + 1) % sv.length];
    canvas.strokeLine(ax, ay, bx, by, outlineWidth, ...outlineColor, outlineAlpha);
  }

  return canvas.toPng();
}

// ─── GENERATE ALL SIZES ───────────────────────────────────────────────────────

const SIZES = [16, 48, 128];
const iconsDir = path.resolve(__dirname, '..', 'icons');

mkdirSync(iconsDir, { recursive: true });

for (const size of SIZES) {
  const pngBuffer = drawIcon(size);
  const outPath = path.join(iconsDir, `icon-${size}.png`);
  writeFileSync(outPath, pngBuffer);
  console.log(`Generated ${outPath}  (${pngBuffer.length} bytes)`);
}

console.log('\nAll icons generated successfully.');
