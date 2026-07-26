import './hat.js';
import './forever.js';
import './io.js';
import './sensors.js';
import './sound.js';
import './ir.js';
import './serial.js';
import { recolorStockBlocks } from './recolorStock.js';

// Runs once 'blockly/blocks' (imported before this module, see
// BlocklyWorkspace.jsx) has populated Blockly.Blocks with the stock
// definitions this recolors.
recolorStockBlocks();
