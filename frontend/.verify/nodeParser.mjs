// Node stand-in for src/importCpp/parser.js. Identical parsing, but loads the
// two committed wasm blobs from public/ off disk instead of fetching them
// over HTTP from the site root -- the only part of that module that assumes
// a browser. The recognizers under test are untouched.
import { readFile } from 'node:fs/promises';
import { Parser, Language } from 'web-tree-sitter';

const PUBLIC = new URL('../public/', import.meta.url);
let languagePromise = null;

export function getCppLanguage() {
  if (!languagePromise) {
    languagePromise = Parser.init({
      locateFile: () => new URL('web-tree-sitter.wasm', PUBLIC).pathname,
    }).then(async () => Language.load(new Uint8Array(await readFile(new URL('tree-sitter-cpp.wasm', PUBLIC)))));
  }
  return languagePromise;
}

export async function parseCpp(sourceText) {
  const language = await getCppLanguage();
  const parser = new Parser();
  parser.setLanguage(language);
  return parser.parse(sourceText);
}
