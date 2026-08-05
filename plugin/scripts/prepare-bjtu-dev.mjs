import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const source = resolve(repositoryRoot, 'plugin', 'bjtu-plugin.dev.json');
const destination = resolve(repositoryRoot, 'bjtu-plugin.dev.json');

await copyFile(source, destination);
console.log('Created ignored root bjtu-plugin.dev.json for the explicit bjtu dev workflow.');
