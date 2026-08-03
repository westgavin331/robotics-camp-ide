import './hat.js';
import './forever.js';
import './waitUntil.js';
import './io.js';
import './sensors.js';
import './sound.js';
import './ir.js';
import './serial.js';
import './motors.js';
import './lists.js';
import './textShadow.js';
import { recolorStockBlocks } from './recolorStock.js';
import { overrideDuplicateForStacks } from './deepDuplicate.js';

// Runs once 'blockly/blocks' (imported before this module, see
// BlocklyWorkspace.jsx) has populated Blockly.Blocks with the stock
// definitions this recolors.
recolorStockBlocks();

// Also runs once here: Blockly.ContextMenuRegistry's default items (see
// deepDuplicate.js) are registered as a side effect of importing
// 'blockly/core'/'blockly/blocks', both already imported before this module
// runs (see BlocklyWorkspace.jsx), so "blockDuplicate" is guaranteed to
// exist by this point.
overrideDuplicateForStacks();
