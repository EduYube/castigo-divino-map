import { readFile } from 'node:fs/promises';

const mainCss = await readFile('src/styles/main.css', 'utf8');
const accessibilityCss = await readFile('src/styles/accessibility.css', 'utf8');

function parseHex(value) {
  const normalized = value.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    throw new Error(`Expected a six-digit hex color, received ${value}.`);
  }
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
}

function relativeLuminance(value) {
  const [red, green, blue] = parseHex(value).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

const pairs = [
  { label: 'primary text', foreground: '#f7f1e3', background: '#182019', minimum: 4.5 },
  { label: 'muted text', foreground: '#b9c0b7', background: '#182019', minimum: 4.5 },
  { label: 'accent text', foreground: '#d7b96f', background: '#182019', minimum: 4.5 },
  { label: 'release badge', foreground: '#172018', background: '#d7b96f', minimum: 4.5 },
  { label: 'focus ring', foreground: '#fff1a8', background: '#182019', minimum: 3 },
];

const measurements = pairs.map((pair) => ({
  ...pair,
  ratio: contrastRatio(pair.foreground, pair.background),
}));

for (const measurement of measurements) {
  if (measurement.ratio < measurement.minimum) {
    throw new Error(
      `${measurement.label} contrast ${measurement.ratio.toFixed(2)}:1 is below ${measurement.minimum}:1.`,
    );
  }
}

if (!mainCss.includes('color-scheme: dark')) {
  throw new Error('The application must keep its declared dark color scheme.');
}
if (!accessibilityCss.includes('@media (prefers-reduced-motion: reduce)')) {
  throw new Error('The reduced-motion media query is missing.');
}
if (!accessibilityCss.includes('animation-duration: 0.01ms !important')) {
  throw new Error('Reduced motion must collapse animation duration.');
}
if (!accessibilityCss.includes('transition-duration: 0.01ms !important')) {
  throw new Error('Reduced motion must collapse transition duration.');
}
if (!accessibilityCss.includes('@media (forced-colors: active)')) {
  throw new Error('Forced-colors support is missing.');
}

console.log('MAP-029 accessibility static checks passed.');
for (const measurement of measurements) {
  console.log(`${measurement.label}: ${measurement.ratio.toFixed(2)}:1`);
}
