import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { rimraf } from 'rimraf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @param i18nPath {string}
 */
export async function build(i18nPath) {
  fs.cpSync(i18nPath, path.join(__dirname, 'lib', 'i18n.ts'));

  await esbuild.build({
    absWorkingDir: __dirname,
    entryPoints: [path.join(__dirname, 'index.ts')],
    tsconfig: path.join(__dirname, 'tsconfig.json'),
    bundle: true,
    packages: 'bundle',
    target: 'es6',
    outdir: path.join(__dirname, 'dist'),
    sourcemap: true,
    format: 'esm',
  });

  const outDir = path.resolve(__dirname, '..', '..', 'dist');
  const localePath = path.resolve(outDir, '_locales');
  rimraf.sync(localePath);
  fs.cpSync(path.join(__dirname, 'locales'), localePath, { recursive: true });

  console.log('I18n build complete');
}
