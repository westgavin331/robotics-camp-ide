import { codeFor, sketch } from './harness.mjs';

const cases = {
  'A. any (default) -- held command': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12' } }],
    [{ type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_held_command' } } } }],
  ),
  'B. filtered (decimal) -- held command': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12', ADDRESS: '0' } }],
    [{ type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_held_command' } } } }],
  ),
  'C. filtered (hex) -- if received + get code': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12', ADDRESS: '0xEF00' } }],
    [{ type: 'ir_if_received', inputs: { DO: { block: {
      type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_get_code', fields: { FORMAT: 'COMMAND' } } } },
    } } } }],
  ),
  'D. address-discovery program (any + print address)': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12' } }],
    [{ type: 'ir_if_received', inputs: { DO: { block: {
      type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_get_code', fields: { FORMAT: 'ADDRESS' } } } },
    } } } }],
  ),
  'E. filtered -- both consumers at once': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12', ADDRESS: '255' } }],
    [
      { type: 'ir_if_received', inputs: { DO: { block: {
        type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_repeat_received' } } },
      } } } },
      { type: 'serial_print', inputs: { VALUE: { block: { type: 'ir_held_command' } } } },
    ],
  ),
  'F. filtered receiver, no consumer': sketch(
    [{ type: 'ir_start_receiver', fields: { PIN: '12', ADDRESS: '0x1FE' } }],
    [],
  ),
};

for (const [name, state] of Object.entries(cases)) {
  console.log(`\n${'='.repeat(70)}\n${name}\n${'='.repeat(70)}`);
  console.log(codeFor(state));
}
