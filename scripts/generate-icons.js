const { writeFileSync, mkdirSync } = require('fs');
const { deflateSync } = require('zlib');

function createPng(size, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(2, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdr = createChunk('IHDR', ihdrData);
  const rawData = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const offset = y * (1 + size * 3);
    rawData[offset] = 0;
    for (let x = 0; x < size; x++) {
      const px = offset + 1 + x * 3;
      rawData[px] = r;
      rawData[px + 1] = g;
      rawData[px + 2] = b;
    }
  }
  const idat = createChunk('IDAT', deflateSync(rawData));
  const iend = createChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

mkdirSync('icons', { recursive: true });
writeFileSync('icons/icon-16.png', createPng(16, 29, 155, 240));
writeFileSync('icons/icon-48.png', createPng(48, 29, 155, 240));
writeFileSync('icons/icon-128.png', createPng(128, 29, 155, 240));
console.log('Icons generated: icon-16.png, icon-48.png, icon-128.png');
