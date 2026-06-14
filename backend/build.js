import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FILES = [
  'hash.js',
  'aes.js',
  'log.js',
  'usuarios.js',
  'horario.js',
  'calendario.js',
  'agenda.js',
  'auth.js',
  'guards.js',
  'http.js',
  'router.js',
  'index.js',
];

function stripImportsExports(source) {
  return source
    .split('\n')
    .filter((line) => !/^\s*import\s.+from\s+['"].*['"];?\s*$/.test(line))
    .map((line) => line.replace(/^export\s+(function|const|class|let|var)\s+/, '$1 '))
    .join('\n');
}

const srcDir = join(__dirname, 'src');
const distDir = join(__dirname, 'dist');
mkdirSync(distDir, { recursive: true });

const parts = FILES.map((filename) => {
  const source = readFileSync(join(srcDir, filename), 'utf8');
  return `// ===== ${filename} =====\n${stripImportsExports(source)}`;
});

writeFileSync(join(distDir, 'gas-smpdjm.txt'), parts.join('\n\n'), 'utf8');
console.log(`Build OK -> backend/dist/gas-smpdjm.txt (${FILES.length} archivos)`);
