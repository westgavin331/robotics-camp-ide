// Shared pin dropdown option lists, so every block's pin field (Basic I/O,
// Sensors, IR Remote, Sound) stays consistent with the physical Arduino Uno
// board instead of each block file inventing its own list.

const PWM_PINS = [3, 5, 6, 9, 10, 11];

// General digital pin choices: 2-13. Pins 0 and 1 are reserved for Serial
// (RX/TX) -- offering them as GPIO would break serial communication and
// code uploads, so they're never a choice here. PWM-capable pins are
// labeled with the "~" prefix Arduino's own board silkscreen uses, purely
// cosmetic in this list -- every pin here remains selectable regardless of
// PWM support (e.g. servo and plain digital read/write work on any of them).
export const DIGITAL_PIN_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 2).map((pin) => [
  PWM_PINS.includes(pin) ? `~${pin}` : `${pin}`,
  `${pin}`,
]);

// PWM-restricted choices (analogWrite): only the Uno's six PWM-capable
// pins. Every option here gets the "~" prefix since it applies to all of
// them.
export const PWM_PIN_OPTIONS = PWM_PINS.map((pin) => [`~${pin}`, `${pin}`]);

// Analog input pins.
export const ANALOG_PIN_OPTIONS = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'].map((pin) => [pin, pin]);
