import { getCustomBlocks, paramGetterType, PARAM_TYPE_INFO } from './registry.js';

// Dynamic "My Blocks" toolbox category (same registerToolboxCategoryCallback
// mechanism as registerVariablesCategory.js): a "Make a Block" button first,
// then each custom block's call block (with default shadows on every
// parameter, same convention as every other block in toolbox.js) followed
// by that block's own parameter getters, so a kid opening the category to
// build a definition's body can find "speed" right next to "Blink Twice".
//
// Recomputed fresh from the registry every time the category is opened --
// no extra refresh plumbing needed when a new block is created, unlike the
// workspace itself, which does need the new "define" hat placed explicitly
// (see BlocklyWorkspace.jsx).
export function registerMyBlocksCategory(workspace, onMakeBlock) {
  workspace.registerButtonCallback('MAKE_A_BLOCK', onMakeBlock);
  workspace.registerToolboxCategoryCallback('MY_BLOCKS', () => {
    const items = [{ kind: 'button', text: 'Make a Block', callbackKey: 'MAKE_A_BLOCK' }];
    for (const def of getCustomBlocks()) {
      const inputs = {};
      for (const p of def.params) {
        inputs[`ARG_${p.id}`] = { shadow: PARAM_TYPE_INFO[p.type].shadow };
      }
      items.push({ kind: 'block', type: def.callType, inputs });
      for (const p of def.params) {
        items.push({ kind: 'block', type: paramGetterType(def.id, p.id) });
      }
    }
    return items;
  });
}
