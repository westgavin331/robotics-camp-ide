// Caps how many compileSketch() calls (compile.js) run at once. Each one
// spawns a real arduino-cli/avr-gcc toolchain invocation -- a genuine CPU
// burst across several subprocess stages (preprocess, compile the sketch +
// Arduino core + any libraries, link) -- and Render's free web service tier
// is only 512MB RAM / 0.1 CPU (confirmed against render.com/docs/free).
// With a camp-sized burst of kids clicking Run around the same time and no
// limit here, that many concurrent compiles would fight over a tenth of a
// CPU core, each taking far longer than COMPILE_TIMEOUT_MS and starving the
// same event loop Express needs to accept and answer *any* other request
// (including from devices not even compiling) -- the "one device always
// works, eight at once doesn't" symptom this exists to fix.
//
// A plain in-memory FIFO queue is enough here: one process, one Render
// instance (free tier doesn't support horizontal scaling anyway), so there's
// no multi-instance coordination to worry about. Queued requests wait, they
// aren't rejected -- a kid's Run takes a little longer during a burst
// instead of the whole service falling over for everyone.
export function createCompileQueue(maxConcurrent) {
  let active = 0;
  const queue = [];

  function runNext() {
    if (active >= maxConcurrent || queue.length === 0) return;
    active++;
    const { task, resolve, reject } = queue.shift();
    task().then(
      (result) => {
        active--;
        resolve(result);
        runNext();
      },
      (err) => {
        active--;
        reject(err);
        runNext();
      },
    );
  }

  return function enqueue(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      runNext();
    });
  };
}
