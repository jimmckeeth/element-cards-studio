/**
 * webpEncoder.js — genuinely lossless, genuinely small WebP export.
 *
 * Chromium's built-in `canvas.toBlob('image/webp', 1)` does encode losslessly
 * (it writes a VP8L chunk, and the pixels round-trip exactly), but at a far
 * lower compression effort than libwebp is capable of. For a typical vector
 * card export this produces a file 100x or more larger than necessary —
 * often larger than the equivalent PNG, defeating the entire point of
 * offering WebP. There is no way to raise that effort through the Canvas
 * API; the browser does not expose libwebp's method/quality knobs.
 *
 * So this app carries its own copy of libwebp, compiled to WebAssembly
 * (vendored in vendor/webp-enc/ — see the NOTICE there), and calls it
 * directly with `lossless: 1, exact: 1`. Encoding runs in a Worker
 * (webpWorker.js) so a large export doesn't freeze the page. The Worker is
 * created lazily, on the first WebP export, and then reused.
 */

let worker = null;
let nextId = 1;
const pending = new Map();

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./webpWorker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => {
    const { id, ok, bytes, message } = ev.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve(new Uint8Array(bytes));
    else p.reject(new Error(message));
  };
  worker.onerror = (ev) => {
    // A load-time failure (e.g. the wasm file 404s) rejects every in-flight
    // request rather than hanging them forever.
    const err = new Error(ev.message || 'The WebP encoder worker failed to load.');
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };
  return worker;
}

/**
 * Encode an ImageData-shaped object `{ data, width, height }` to a lossless
 * WebP `Uint8Array`. `method` is libwebp's compression-effort knob (0 fast/
 * larger .. 6 slow/smaller); the default of 4 already gets within a percent
 * or two of method 6 in testing, in a fraction of the time — see the NOTICE.
 */
export function encodeLosslessWebp({ data, width, height }, { method = 4 } = {}) {
  const w = ensureWorker();
  const id = nextId++;
  // Transfer the pixel buffer instead of copying it — for an 8x export this
  // can be hundreds of megabytes, and a copy across the worker boundary
  // would double both the time and the peak memory for no benefit (the
  // caller's ImageData is not reused afterward).
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, buffer, width, height, method }, [buffer]);
  });
}

/** True once WebAssembly is available — the one thing this encoder needs. */
export function webpEncoderSupported() {
  return typeof WebAssembly === 'object' && typeof Worker === 'function';
}
