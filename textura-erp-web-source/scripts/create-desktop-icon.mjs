import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const buildDir = path.join(root, "build");
const source = path.join(buildDir, "icon.svg");
const icoTarget = path.join(buildDir, "icon.ico");
const pngTarget = path.join(buildDir, "icon.png");
const sizes = [16, 24, 32, 48, 64, 128, 256];

await mkdir(buildDir, { recursive: true });
const svg = await readFile(source);

await sharp(svg).resize(1024, 1024).png().toFile(pngTarget);

const images = await Promise.all(
  sizes.map(async (size) => ({
    size,
    buffer: await sharp(svg).resize(size, size).png().toBuffer(),
  })),
);

const headerSize = 6;
const entrySize = 16;
let offset = headerSize + images.length * entrySize;
const header = Buffer.alloc(offset);

header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);

images.forEach(({ size, buffer }, index) => {
  const entryOffset = headerSize + index * entrySize;
  header.writeUInt8(size === 256 ? 0 : size, entryOffset);
  header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
  header.writeUInt8(0, entryOffset + 2);
  header.writeUInt8(0, entryOffset + 3);
  header.writeUInt16LE(1, entryOffset + 4);
  header.writeUInt16LE(32, entryOffset + 6);
  header.writeUInt32LE(buffer.length, entryOffset + 8);
  header.writeUInt32LE(offset, entryOffset + 12);
  offset += buffer.length;
});

await writeFile(icoTarget, Buffer.concat([header, ...images.map((image) => image.buffer)]));
