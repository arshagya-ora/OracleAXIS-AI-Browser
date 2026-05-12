import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const i18nPath = path.join(__dirname, 'lib', 'i18n-dev.ts');

void build(i18nPath);
