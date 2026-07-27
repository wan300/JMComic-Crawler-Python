import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const dist = resolve(root, 'dist');
if (!existsSync(resolve(dist, 'index.html')) || !existsSync(resolve(dist, 'icon.svg'))) {
  throw new Error('dist/ 缺少 index.html 或 icon.svg');
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

for (const file of walk(dist)) {
  if (!statSync(file).isFile()) continue;
  const relative = file.slice(root.length + 1).replaceAll('\\', '/');
  execFileSync('git', ['ls-files', '--error-unmatch', relative], { cwd: root, stdio: 'ignore' });
}
execFileSync('git', ['diff', '--exit-code', '--', 'dist'], { cwd: root, stdio: 'inherit' });
console.log('dist/ 与已提交产物一致。');
