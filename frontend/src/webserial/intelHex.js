// Parses Intel HEX text (what arduino-cli's --output-dir produces as
// sketch.ino.hex) into a flat flash image starting at address 0, with any
// gaps filled with 0xFF (erased-flash value) so page writes further down the
// pipeline don't need to know about gaps.
//
// Record format: `:LLAAAATT[DD...]CC`
//   LL = byte count, AAAA = 16-bit address, TT = record type, CC = checksum
// Record types handled: 00 data, 01 EOF, 02 extended segment address,
// 04 extended linear address. 03/05 (start address) don't affect flash
// contents and are ignored -- an Uno .hex never uses them anyway.
export function parseIntelHex(hexText) {
  const sparse = [];
  let extendedAddress = 0;

  for (const rawLine of hexText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.startsWith(':')) continue;

    const byteCount = parseInt(line.slice(1, 3), 16);
    const address = parseInt(line.slice(3, 7), 16);
    const recordType = parseInt(line.slice(7, 9), 16);
    const dataHex = line.slice(9, 9 + byteCount * 2);

    if (recordType === 0x00) {
      const base = extendedAddress + address;
      for (let i = 0; i < byteCount; i++) {
        sparse[base + i] = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
      }
    } else if (recordType === 0x01) {
      break;
    } else if (recordType === 0x02) {
      extendedAddress = parseInt(dataHex, 16) << 4;
    } else if (recordType === 0x04) {
      extendedAddress = parseInt(dataHex, 16) << 16;
    }
  }

  const flash = new Uint8Array(sparse.length);
  for (let i = 0; i < sparse.length; i++) {
    flash[i] = sparse[i] ?? 0xff;
  }
  return flash;
}
