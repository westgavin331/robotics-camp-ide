import * as Blockly from 'blockly/core';

// The stock "Variables" flyout only offers get/set. The spec also wants
// "change [var] by [1]" (math_change) grouped in the same category, so this
// registers a custom flyout callback that appends it after the dynamic
// get/set blocks Blockly.Variables normally provides.
//
// The appended item MUST be a plain JSON flyout-item object, not an XML DOM
// element: Blockly.Variables.flyoutCategory() in this Blockly version
// returns an array of JSON objects (e.g. {kind: 'button', ...}, {kind:
// 'block', ...}), not the XML elements older Blockly versions used to
// return. Pushing an XML Element into that array (as a previous version of
// this file did) meant Blockly later tried to read a `.kind` string off
// every item uniformly -- undefined on a DOM Element -- and threw a
// TypeError from deep inside its own flyout-building code the moment the
// Variables category was opened. That exception aborted the flyout update
// mid-way and left Blockly's toolbox in a state where the *next* category
// clicked (regardless of which one) would also fail to show anything, only
// recoverable with a full page reload -- so the symptom shows up on
// whatever category happens to be clicked afterward, not necessarily on
// Variables itself.
export function registerVariablesCategory(workspace) {
  workspace.registerToolboxCategoryCallback('VARIABLES_WITH_CHANGE', (ws) => {
    const flyoutItems = Blockly.Variables.flyoutCategory(ws);
    // Blockly.Variables.flyoutCategory() fills in the VAR field on
    // "set [var] to ___" but leaves the VALUE input's socket empty, unlike
    // every other typeable input in this app -- add the same plain
    // math_number shadow used elsewhere (e.g. math_change's DELTA below) so
    // it's directly typeable instead of requiring a block to be dragged in.
    for (const item of flyoutItems) {
      if (item.kind === 'block' && item.type === 'variables_set') {
        item.inputs = { VALUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } } };
      }
    }
    flyoutItems.push({
      kind: 'block',
      type: 'math_change',
      inputs: { DELTA: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
    });
    return flyoutItems;
  });
}
