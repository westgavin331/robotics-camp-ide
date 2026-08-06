// Node resolves `blockly/core` to the CJS core-node.js build, whose exports
// the real source files can't namespace-import the way Vite's browser build
// lets them. This hook pins both entry points to the same ESM builds the
// browser gets, so the harness exercises the app's actual module graph
// rather than a differently-shaped one.
//
// importCpp's parser.js is swapped for a Node twin as well -- it fetches its
// two wasm blobs from the site root, which only exists under Vite. Every
// recognizer that the import tests actually exercise is the real one.
const BLOCKLY_DIR = new URL('../../node_modules/blockly/', import.meta.url);
const REMAP = {
  'blockly/core': new URL('blockly.mjs', BLOCKLY_DIR).href,
  'blockly/blocks': new URL('blocks.mjs', BLOCKLY_DIR).href,
  'blockly/msg/en': new URL('msg/en.js', BLOCKLY_DIR).href,
};

const REAL_PARSER = new URL('../src/importCpp/parser.js', import.meta.url).href;
const NODE_PARSER = new URL('./nodeParser.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(REMAP[specifier] ?? specifier, context);
  return resolved.url === REAL_PARSER ? { ...resolved, url: NODE_PARSER } : resolved;
}
