import { readFileSync } from 'node:fs';
import { BookConfigSchema } from '../src/lib/books/types';

const path = process.argv[2];
if (!path) throw new Error('Config path required');
const config = BookConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
if (config.rendering.recipe?.schema !== 'lhb.book-render@v2' || config.status !== 'draft') {
  throw new Error('Expected a draft v2 flow candidate');
}
