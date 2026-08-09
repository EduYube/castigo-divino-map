import { gzipSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

const DIST = 'dist';

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function publicPath(path) {
  return relative(DIST, path).split(sep).join('/');
}

const files = await listFiles(DIST);
const records = [];

for (const path of files) {
  const content = await readFile(path);
  records.push({
    path: publicPath(path),
    extension: extname(path).toLowerCase(),
    bytes: content.byteLength,
    gzipBytes: gzipSync(content).byteLength,
  });
}

const sum = (predicate, field) =>
  records.filter(predicate).reduce((total, record) => total + record[field], 0);
const byExtension = (extension) => (record) => record.extension === extension;
const snapshot = records.find((record) => record.path === 'data/public-catalog.snapshot.json');

if (!snapshot) {
  throw new Error('MAP-029 build report: public snapshot is missing from dist.');
}

const metrics = {
  files: records.length,
  totalBytes: sum(() => true, 'bytes'),
  totalGzipBytes: sum(() => true, 'gzipBytes'),
  htmlBytes: sum(byExtension('.html'), 'bytes'),
  htmlGzipBytes: sum(byExtension('.html'), 'gzipBytes'),
  javascriptBytes: sum(byExtension('.js'), 'bytes'),
  javascriptGzipBytes: sum(byExtension('.js'), 'gzipBytes'),
  cssBytes: sum(byExtension('.css'), 'bytes'),
  cssGzipBytes: sum(byExtension('.css'), 'gzipBytes'),
  snapshotBytes: snapshot.bytes,
  snapshotGzipBytes: snapshot.gzipBytes,
  sourceMaps: records.filter(byExtension('.map')).length,
  rasterImages: records.filter((record) =>
    ['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp'].includes(
      record.extension,
    ),
  ).length,
};

console.log('MAP-029 production build metrics');
console.log(JSON.stringify(metrics, null, 2));
console.log('MAP-029 production files');
for (const record of records.sort((left, right) => left.path.localeCompare(right.path))) {
  console.log(`${record.path}\t${record.bytes} bytes\t${record.gzipBytes} gzip bytes`);
}
