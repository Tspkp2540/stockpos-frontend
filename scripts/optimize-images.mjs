import { readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const assetDirectory = fileURLToPath(new URL("../src/assets/", import.meta.url));
const maxWidth = 1600;
const quality = 82;
const files = (await readdir(assetDirectory)).filter((file) => /\.png$/i.test(file));

for (const file of files) {
  const source = join(assetDirectory, file);
  const target = join(assetDirectory, `${basename(file, extname(file))}.webp`);
  const image = sharp(source);
  const metadata = await image.metadata();
  await image
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality, effort: 6 })
    .toFile(target);
  const output = await sharp(target).metadata();
  console.log(`${file}: ${metadata.width}×${metadata.height} → ${output.width}×${output.height}`);
}
