// Sketches that must NOT be silently misread.
import { tryImport } from './tryImport.mjs';

const cases = {
  'unrelated const uint16_t (must reject, not claim as address)': `#include <IRremote.hpp>
const uint16_t cruiseSpeed = 200;
void setup() { IrReceiver.begin(12, ENABLE_LED_FEEDBACK); Serial.begin(9600); }
void loop() { if (IrReceiver.decode()) { Serial.println(IrReceiver.decodedIRData.command); IrReceiver.resume(); } }
`,
  'renamed address constant, actually filtered on (must be accepted)': `#include <IRremote.hpp>
const uint16_t myRemote = 0xEF00;
void setup() { IrReceiver.begin(12, ENABLE_LED_FEEDBACK); Serial.begin(9600); }
void loop() {
  if (IrReceiver.decode()) {
    if (IrReceiver.decodedIRData.address == myRemote) {
      Serial.println(IrReceiver.decodedIRData.command);
    }
    IrReceiver.resume();
  }
}
`,
  'held-command tracker with a non-standard idle timeout (must reject)': `#include <IRremote.hpp>
int irHeldCommand = 0;
unsigned long irLastSignalMs = 0;
void setup() { IrReceiver.begin(12, ENABLE_LED_FEEDBACK); Serial.begin(9600); }
void loop() {
  if (IrReceiver.decode()) {
    irHeldCommand = IrReceiver.decodedIRData.command;
    irLastSignalMs = millis();
    IrReceiver.resume();
  }
  if (millis() - irLastSignalMs > 900) { irHeldCommand = 0; }
  Serial.println(irHeldCommand);
}
`,
  'address guard comparing against a plain literal (no block for it -- must reject)': `#include <IRremote.hpp>
void setup() { IrReceiver.begin(12, ENABLE_LED_FEEDBACK); Serial.begin(9600); }
void loop() {
  if (IrReceiver.decode()) {
    if (IrReceiver.decodedIRData.address == 255) {
      Serial.println(IrReceiver.decodedIRData.command);
    }
    IrReceiver.resume();
  }
}
`,
};

for (const [name, src] of Object.entries(cases)) {
  const r = await tryImport(src);
  console.log(`\n### ${name}`);
  if (r.ok) {
    const walk = (b, out = []) => { if (!b) return out; out.push(b.type);
      for (const s of Object.values(b.inputs || {})) walk(s.block, out);
      walk(b.next?.block, out); return out; };
    const blocks = walk(r.project.workspace.blocks.blocks[0]);
    const recv = JSON.stringify(r.project.workspace.blocks.blocks[0], null, 0).match(/"ADDRESS":"[^"]*"/);
    console.log('  ACCEPTED -- blocks:', blocks.join(' > '), recv ? ` | ${recv[0]}` : ' | (no ADDRESS)');
  } else {
    console.log('  REJECTED:', r.errors.map((e) => `line ${e.line}: ${e.message}`).join(' / '));
  }
}
