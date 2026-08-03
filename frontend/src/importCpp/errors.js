import { line, column } from './cst.js';

// Whole-import-rejects-on-anything-unrecognized (see index.js's module
// comment for the full reasoning): every recognizer function in this
// directory either returns a real Blockly block-state, or records exactly
// one diagnostic here and returns null -- callers propagate a null straight
// back up without adding their own redundant "containing statement also
// failed" message, so one real problem produces one clear line-numbered
// error, not a cascade.
export class ImportContext {
  constructor() {
    this.errors = [];
    // name -> {id, name} -- one entry per distinct global variable, in
    // first-seen order; also carried into the project's top-level
    // `variables` array as-is.
    this.variables = new Map();
    // Names declared `Servo <name>;` at global scope -- tracked so
    // `<name>.attach(pin)` / `<name>.write(angle)` are recognized as the
    // io_servo_write block rather than "unrecognized method call".
    this.servoVars = new Set();
    // servoVar name -> the pin expression node from its `.attach(pin)` call,
    // found by a dedicated pre-scan (program.js) across every function body
    // before any statement recognition happens, so `.write()` can be
    // recognized correctly regardless of whether `.attach()` appears later
    // in the file (e.g. attach in setup(), write in loop()).
    this.servoAttachPins = new Map();
    // name -> the same shape registry.js's restoreCustomBlocks expects:
    // {id, name, cName, nextParamSeq, params: [{id, name, type, cName}]}.
    this.customFunctions = new Map();
    // Function names whose *signature* was already rejected in the
    // declaration pass -- lets call-site recognition skip them silently
    // instead of reporting the same underlying problem a second time.
    this.rejectedFunctionNames = new Set();
    // Names of top-level functions whose body matches sensor_read_distance's
    // exact generated helper-function template (see program.js's
    // matchesDistanceHelperTemplate) -- these are consumed entirely (not
    // turned into a My Blocks custom function); only their *call sites*
    // become blocks (sensor_read_distance).
    this.distanceHelperNames = new Set();
    // Lists (see lists.js), in declaration order. Keyed by the ARRAY's name:
    // list name -> {id, name, capacity, lengthName}. `id` is handed to the
    // LIST field on every list block, and each of these also becomes an
    // entry in the project's `variables` array -- typed 'List', which is what
    // keeps lists out of the plain Variables category.
    this.lists = new Map();
    // The reverse lookup, counter name -> list name, so `scoresLength` can be
    // recognized as "length of scores" (and `scoresLength = 0` as "delete all
    // of scores") without re-deriving the pairing at every use.
    this.listLengthNames = new Map();
    // Top-level function name -> which list helper it is ('add', 'item', ...),
    // filled in by the shape match in lists.js. Like distanceHelperNames
    // above, these functions are consumed entirely -- only their call sites
    // become blocks.
    this.listHelperNames = new Map();
    // Array/counter names belonging to something that *looked* like a list
    // but was already rejected with a specific reason (no counter, an
    // unsupported size). Kept so the generic "unsupported global declaration"
    // pass doesn't report the same declaration a second, vaguer time.
    this.rejectedListNames = new Set();
    this._varCounter = 0;
    this._listCounter = 0;
  }

  error(node, message) {
    this.errors.push({ line: line(node), column: column(node), message });
  }

  get hasErrors() {
    return this.errors.length > 0;
  }

  addList(name, lengthName, capacity) {
    if (this.lists.has(name)) return this.lists.get(name);
    const list = { id: `import_list_${this._listCounter++}`, name, capacity, lengthName };
    this.lists.set(name, list);
    this.listLengthNames.set(lengthName, name);
    return list;
  }

  getOrCreateVariable(name) {
    if (!this.variables.has(name)) {
      this.variables.set(name, { id: `import_var_${this._varCounter++}`, name });
    }
    return this.variables.get(name);
  }
}

// Thrown by the top-level importCpp() call (index.js) when the import
// should be rejected wholesale -- carries every collected diagnostic, not
// just the first, so the dialog can show the kid (or the adult helping
// them) the full picture in one pass rather than a fix-one-see-the-next
// loop.
export class ImportRejected extends Error {
  constructor(errors) {
    super(`Couldn't import this code: ${errors.length} problem(s) found.`);
    this.name = 'ImportRejected';
    this.errors = errors;
  }
}
