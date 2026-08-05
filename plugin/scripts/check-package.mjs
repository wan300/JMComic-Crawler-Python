import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { zipSync } from 'fflate';

const root = resolve(import.meta.dirname, '..', '..');
const output = execFileSync(
  'git',
  ['ls-files', '-co', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
);
const paths = [...new Set(output.split('\0').filter(Boolean))].sort();
const files = {};
let expanded = 0;
for (const relative of paths) {
  const absolute = resolve(root, relative);
  if (!existsSync(absolute)) continue;
  const stat = statSync(absolute);
  if (!stat.isFile()) continue;
  const bytes = new Uint8Array(readFileSync(absolute));
  files[relative.replaceAll('\\', '/')] = bytes;
  expanded += bytes.length;
}
const archive = zipSync(files, { level: 9 });
const limits = {
  files: 1000,
  expanded: 50 * 1024 * 1024,
  archive: 25 * 1024 * 1024,
};
if (Object.keys(files).length > limits.files) throw new Error(`文件数超限：${Object.keys(files).length}/${limits.files}`);
if (expanded > limits.expanded) throw new Error(`解压体积超限：${expanded}/${limits.expanded}`);
if (archive.length > limits.archive) throw new Error(`归档体积超限：${archive.length}/${limits.archive}`);
console.log(JSON.stringify({
  files: Object.keys(files).length,
  expandedBytes: expanded,
  archiveBytes: archive.length,
}, null, 2));
