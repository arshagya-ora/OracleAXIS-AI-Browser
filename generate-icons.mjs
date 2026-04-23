import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// CRC32
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  crcTable[i] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function createPNG(width, height, getPixel) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // no filter
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const i = 1 + x * 4;
      row[i] = r; row[i + 1] = g; row[i + 2] = b; row[i + 3] = a;
    }
    rows.push(row);
  }
  const compressed = deflateSync(Buffer.concat(rows));
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))]);
}

function inRoundedRect(px, py, x1, y1, x2, y2, r) {
  if (px < x1 || px > x2 || py < y1 || py > y2) return false;
  const cr = Math.min(r, (x2 - x1) / 2, (y2 - y1) / 2);
  if (px < x1 + cr && py < y1 + cr) return Math.hypot(px - (x1 + cr), py - (y1 + cr)) <= cr;
  if (px > x2 - cr && py < y1 + cr) return Math.hypot(px - (x2 - cr), py - (y1 + cr)) <= cr;
  if (px < x1 + cr && py > y2 - cr) return Math.hypot(px - (x1 + cr), py - (y2 - cr)) <= cr;
  if (px > x2 - cr && py > y2 - cr) return Math.hypot(px - (x2 - cr), py - (y2 - cr)) <= cr;
  return true;
}

// Oracle AXIS icon: red background (#C74634) with white pill-shaped "O"
function oraclePixel(x, y, w, h) {
  const bg = [199, 70, 52, 255]; // #C74634
  const fg = [255, 255, 255, 255];

  const samples = 4; // 4x4 supersampling for anti-aliasing
  let fgCount = 0;

  for (let sy = 0; sy < samples; sy++) {
    for (let sx = 0; sx < samples; sx++) {
      const px = x + (sx + 0.5) / samples;
      const py = y + (sy + 0.5) / samples;

      const padX = w * 0.12;
      const padY = h * 0.22;
      const sw = Math.max(2.5, w * 0.105);

      const x1o = padX, y1o = padY, x2o = w - padX, y2o = h - padY;
      const rO = (y2o - y1o) / 2; // pill shape: radius = half height

      const x1i = x1o + sw, y1i = y1o + sw, x2i = x2o - sw, y2i = y2o - sw;
      const rI = Math.max(0, rO - sw);

      if (inRoundedRect(px, py, x1o, y1o, x2o, y2o, rO) && !inRoundedRect(px, py, x1i, y1i, x2i, y2i, rI)) {
        fgCount++;
      }
    }
  }

  const alpha = fgCount / (samples * samples);
  if (alpha === 0) return bg;
  if (alpha === 1) return fg;
  return [
    Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
    Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
    Math.round(fg[2] * alpha + bg[2] * (1 - alpha)),
    255,
  ];
}

const publicDir = join(__dirname, 'chrome-extension', 'public');

for (const size of [128, 32]) {
  const png = createPNG(size, size, oraclePixel);
  const outPath = join(publicDir, `icon-${size}.png`);
  writeFileSync(outPath, png);
  console.log(`Generated icon-${size}.png (${png.length} bytes)`);
}
