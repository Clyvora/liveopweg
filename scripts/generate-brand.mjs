import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publicDirectory = new URL("../public/", import.meta.url);
const brandDirectory = new URL("brand/", publicDirectory);
const previewDirectory = new URL("../output/playwright/", import.meta.url);
const ink = "#101d40";
const blue = "#102bb1";
const white = "#fff8e8";
const svg = (width, height, content, label = "Liveopweg") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${label}"><title>${label}</title>${content}</svg>\n`;

const symbolOutline = await readFile(new URL("symbol.svg", brandDirectory), "utf8");
const wordOutline = await readFile(new URL("wordmark.svg", brandDirectory), "utf8");

function drawOutline(outline, color, width, x, y) {
  return outline.trim()
    .replace(/width="\d+" height="\d+"/, `width="${width}" height="${width * (outline === symbolOutline ? 194 / 201 : 148 / 704)}" x="${x}" y="${y}"`)
    .replace(/fill="[^"]+"/, `fill="${color}"`);
}

function mark() {
  return `<rect width="64" height="64" rx="15" fill="${blue}"/>${drawOutline(symbolOutline, white, 44, 10, 11)}`;
}

const positioned = (contents, x, y, scale) => `<g transform="translate(${x} ${y}) scale(${scale})">${contents}</g>`;
const horizontal = color => drawOutline(symbolOutline, color, 49, 5, 6) + drawOutline(wordOutline, color, 229, 64, 9);
const stacked = color => drawOutline(symbolOutline, color, 80, 78, 4) + drawOutline(wordOutline, color, 214, 11, 94);
const raster = (source, width) => sharp(Buffer.from(source)).resize({ width }).png().toBuffer();

await mkdir(brandDirectory, { recursive: true });
const icon = svg(64, 64, mark(), "Liveopweg beeldmerk");
const primary = svg(300, 60, horizontal(blue));
await Promise.all([
  writeFile(new URL("favicon.svg", publicDirectory), icon),
  writeFile(new URL("liveopweg.svg", brandDirectory), primary),
  writeFile(new URL("liveopweg-dark.svg", brandDirectory), svg(300, 60, horizontal(white))),
  writeFile(new URL("liveopweg-stacked.svg", brandDirectory), svg(236, 148, stacked(blue))),
  raster(primary, 960).then(buffer => writeFile(new URL("liveopweg-logo.png", publicDirectory), buffer)),
  raster(icon, 48).then(buffer => writeFile(new URL("favicon-48.png", publicDirectory), buffer)),
  raster(icon, 180).then(buffer => writeFile(new URL("apple-touch-icon.png", publicDirectory), buffer)),
  raster(icon, 512).then(buffer => writeFile(new URL("icon-512.png", brandDirectory), buffer)),
]);

const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => raster(icon, size)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  header[entry] = header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
}
await writeFile(new URL("favicon.ico", publicDirectory), Buffer.concat([header, ...images]));

const art = svg(1200, 630, `
  <rect width="1200" height="630" fill="${ink}"/>
  <path d="M745 630V493l158-158v-90l175-175h122M890 630V510l106-106h204M1000 630l200-200" fill="none" stroke="#2b468c" stroke-width="5"/>
  <path d="M620 630v-73l205-205h83l150-150h142" fill="none" stroke="#5276ff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="1058" cy="202" r="15" fill="#b9cbff"/><circle cx="1058" cy="202" r="27" fill="none" stroke="#b9cbff" stroke-opacity=".38" stroke-width="3"/>
  ${positioned(horizontal(white), 70, 151, 2.31)}
  <text x="90" y="375" fill="${white}" font-family="Arial, sans-serif" font-size="36" font-weight="600">Live treinlocaties in Nederland</text>
`);
await sharp(Buffer.from(art)).png().toFile(fileURLToPath(new URL("og.png", publicDirectory)));

if (process.argv.includes("--preview")) {
  await mkdir(previewDirectory, { recursive: true });
  const board = svg(960, 580, `
    <rect width="960" height="580" fill="#eaf0fa"/>
    <rect x="20" y="20" width="920" height="234" rx="18" fill="#fff"/>
    ${positioned(horizontal(blue), 63, 73, 2.1)}
    <rect x="20" y="270" width="450" height="290" rx="18" fill="${ink}"/>
    ${positioned(horizontal(white), 63, 361, 1.22)}
    <rect x="488" y="270" width="452" height="290" rx="18" fill="#fff"/>
    ${positioned(stacked(blue), 512, 323, 1.08)}
    ${positioned(mark(), 811, 362, 1)}
    ${positioned(mark(), 811, 445, 0.5)}
    ${positioned(mark(), 857, 453, 0.25)}
  `);
  await sharp(Buffer.from(board)).png().toFile(fileURLToPath(new URL("liveopweg-merkvarianten.png", previewDirectory)));
}
