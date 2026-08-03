// Toolbox: "Basic I/O", "Sensors", "Sound", "IR Remote" and "Motors"
// (custom hardware blocks, spec section 2), a minimal "Serial" debug helper
// (not in the spec, see blocks/serial.js), plus the standard Blockly
// "Control flow", "Operators" (logic + math + text, grouped together per
// spec) and "Variables" categories, and a Scratch-style "Lists" category
// (blocks/lists.js).
//
// Category chip colours come from CATEGORY_COLOURS (theme.js) -- the same
// values the block styles themselves are built from -- so the toolbox
// sidebar and the blocks it produces are always in sync.
//
// Default pin choices below deliberately avoid 2, 3, 4, 5, 7 and 8: those
// are hard-wired to the TB6612FNG motor driver (see blocks/motors.js), and
// unlike every other pin here that wiring is fixed -- a kid can't move it
// with a dropdown. The motors are always physically present on the
// chassis, so a default that collided with one would silently fight the
// motor driver for the pin (reservePinMode dedupes by pin, so only one
// pinMode survives) for any program that used both. Pins 6 and 9-13 are
// the free ones; overlaps *among* the defaults below (e.g. digital read
// and the IR receiver both suggesting 12) are fine and pre-existing --
// they're starting suggestions for blocks rarely used together, and either
// one can be moved with its dropdown.
import { CATEGORY_COLOURS } from './theme.js';

export const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Basic I/O',
      colour: CATEGORY_COLOURS.io,
      contents: [
        {
          kind: 'block',
          type: 'io_digital_write',
          fields: { PIN: '13' },
        },
        {
          kind: 'block',
          type: 'io_digital_read',
          fields: { PIN: '12' },
        },
        {
          kind: 'block',
          type: 'io_analog_read',
          fields: { PIN: 'A0' },
        },
        {
          kind: 'block',
          type: 'io_pwm_write',
          fields: { PIN: '9' },
          inputs: {
            VALUE: { shadow: { type: 'math_number', fields: { NUM: 128 } } },
          },
        },
        {
          kind: 'block',
          type: 'io_servo_write',
          fields: { PIN: '9' },
          inputs: {
            ANGLE: { shadow: { type: 'math_number', fields: { NUM: 90 } } },
          },
        },
        {
          kind: 'block',
          type: 'io_wait',
          inputs: { TIME: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
        },
      ],
    },
    {
      kind: 'category',
      name: 'Sensors',
      colour: CATEGORY_COLOURS.sensors,
      contents: [
        {
          kind: 'block',
          type: 'sensor_read_distance',
          fields: { TRIG: '11', ECHO: '6' },
        },
      ],
    },
    {
      kind: 'category',
      name: 'Sound',
      colour: CATEGORY_COLOURS.sound,
      contents: [
        {
          kind: 'block',
          type: 'sound_play_note',
          fields: { PIN: '10' },
          inputs: {
            BEATS: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
          },
        },
      ],
    },
    {
      kind: 'category',
      name: 'IR Remote',
      colour: CATEGORY_COLOURS.ir,
      contents: [
        {
          kind: 'block',
          type: 'ir_start_receiver',
          fields: { PIN: '12' },
        },
        { kind: 'block', type: 'ir_if_received' },
        { kind: 'block', type: 'ir_get_code' },
        { kind: 'block', type: 'ir_repeat_received' },
        { kind: 'block', type: 'ir_held_command' },
      ],
    },
    {
      kind: 'category',
      name: 'Motors',
      colour: CATEGORY_COLOURS.motors,
      contents: [
        {
          kind: 'block',
          type: 'motor_drive_for',
          inputs: {
            SPEED: { shadow: { type: 'math_number', fields: { NUM: 128 } } },
            TIME: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
          },
        },
        {
          kind: 'block',
          type: 'motor_turn_for',
          inputs: {
            SPEED: { shadow: { type: 'math_number', fields: { NUM: 128 } } },
            TIME: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
          },
        },
        {
          kind: 'block',
          type: 'motor_set_drive',
          inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: 128 } } } },
        },
        {
          kind: 'block',
          type: 'motor_set_turn',
          inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: 128 } } } },
        },
        { kind: 'block', type: 'motor_stop' },
      ],
    },
    {
      kind: 'category',
      name: 'Serial',
      colour: CATEGORY_COLOURS.serial,
      contents: [
        {
          kind: 'block',
          type: 'serial_print',
          inputs: { VALUE: { shadow: { type: 'shadow_text', fields: { TEXT: '' } } } },
        },
      ],
    },
    {
      kind: 'category',
      name: 'Control Flow',
      colour: CATEGORY_COLOURS.control,
      contents: [
        // The required entry point -- comes with a "forever" already
        // snapped in below it, since hat + forever is the intended starting
        // scaffold for basically every program (see generators/arduino/core.js).
        {
          kind: 'block',
          type: 'arduino_start',
          next: { block: { type: 'controls_forever' } },
        },
        // Also offered on its own, for use anywhere other than directly
        // under the hat (nested inside an if, another loop, etc.), where it
        // means a genuine infinite loop rather than "this is void loop()".
        { kind: 'block', type: 'controls_forever' },
        { kind: 'block', type: 'controls_if' },
        {
          kind: 'block',
          type: 'controls_if',
          extraState: { hasElse: true },
        },
        { kind: 'block', type: 'controls_whileUntil' },
        { kind: 'block', type: 'wait_until' },
        {
          kind: 'block',
          type: 'controls_repeat_ext',
          inputs: {
            TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
          },
        },
        {
          kind: 'block',
          type: 'controls_for',
          inputs: {
            FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            TO: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
            BY: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
          },
        },
        { kind: 'block', type: 'controls_flow_statements' },
      ],
    },
    {
      kind: 'category',
      name: 'Operators',
      colour: CATEGORY_COLOURS.operators,
      contents: [
        {
          kind: 'block',
          type: 'logic_compare',
          inputs: {
            A: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            B: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          },
        },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_negate' },
        { kind: 'block', type: 'logic_boolean' },
        { kind: 'block', type: 'logic_ternary' },
        {
          kind: 'block',
          type: 'math_arithmetic',
          inputs: {
            A: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            B: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
          },
        },
        {
          kind: 'block',
          type: 'math_single',
          inputs: { NUM: { shadow: { type: 'math_number', fields: { NUM: 9 } } } },
        },
        {
          kind: 'block',
          type: 'math_round',
          inputs: { NUM: { shadow: { type: 'math_number', fields: { NUM: 3.1 } } } },
        },
        {
          kind: 'block',
          type: 'math_modulo',
          inputs: {
            DIVIDEND: { shadow: { type: 'math_number', fields: { NUM: 64 } } },
            DIVISOR: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
          },
        },
        {
          kind: 'block',
          type: 'math_random_int',
          inputs: {
            FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            TO: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          },
        },
        // The one draggable, standalone "text" block keeps Blockly's stock
        // look (quote icons, Operators green) -- only shadow defaults below
        // switch to shadow_text (blocks/textShadow.js), which drops the
        // icons so an unfilled text socket reads as plainly as a
        // math_number shadow instead of shouting "text block" at a kid who
        // hasn't typed anything yet.
        { kind: 'block', type: 'text', fields: { TEXT: '' } },
        { kind: 'block', type: 'text_join' },
        {
          kind: 'block',
          type: 'text_length',
          inputs: { VALUE: { shadow: { type: 'shadow_text', fields: { TEXT: 'abc' } } } },
        },
        {
          kind: 'block',
          type: 'text_isEmpty',
          inputs: { VALUE: { shadow: { type: 'shadow_text', fields: { TEXT: '' } } } },
        },
        {
          kind: 'block',
          type: 'text_indexOf',
          inputs: {
            VALUE: { shadow: { type: 'shadow_text', fields: { TEXT: 'abc' } } },
            FIND: { shadow: { type: 'shadow_text', fields: { TEXT: 'b' } } },
          },
        },
        {
          kind: 'block',
          type: 'text_charAt',
          inputs: { VALUE: { shadow: { type: 'shadow_text', fields: { TEXT: 'abc' } } } },
        },
      ],
    },
    {
      kind: 'category',
      name: 'Variables',
      colour: CATEGORY_COLOURS.variables,
      custom: 'VARIABLES_WITH_CHANGE',
    },
    // Lists are Blockly variables of their own 'List' type (blocks/lists.js),
    // so unlike Variables above this is a plain static category -- the
    // dropdown on every block already offers every list plus rename/delete,
    // and "create list" is a real block rather than a flyout button, so
    // there's nothing dynamic left for a custom callback to contribute.
    // INDEX shadows default to 1, not 0: these blocks are 1-based, matching
    // Scratch, and a shadow reading 0 would suggest otherwise.
    {
      kind: 'category',
      name: 'Lists',
      colour: CATEGORY_COLOURS.lists,
      contents: [
        { kind: 'block', type: 'list_create', fields: { SIZE: '20' } },
        {
          kind: 'block',
          type: 'list_add',
          inputs: { ITEM: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
        },
        {
          kind: 'block',
          type: 'list_delete',
          inputs: { INDEX: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
        },
        { kind: 'block', type: 'list_delete_all' },
        {
          kind: 'block',
          type: 'list_insert',
          inputs: {
            ITEM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            INDEX: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
          },
        },
        {
          kind: 'block',
          type: 'list_replace',
          inputs: {
            INDEX: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            ITEM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
          },
        },
        {
          kind: 'block',
          type: 'list_item',
          inputs: { INDEX: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
        },
        { kind: 'block', type: 'list_length' },
        {
          kind: 'block',
          type: 'list_contains',
          inputs: { ITEM: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
        },
        { kind: 'block', type: 'list_extreme' },
        {
          kind: 'block',
          type: 'list_index_of',
          inputs: { ITEM: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
        },
      ],
    },
    {
      kind: 'category',
      name: 'My Blocks',
      colour: CATEGORY_COLOURS.myBlocks,
      custom: 'MY_BLOCKS',
    },
  ],
};
