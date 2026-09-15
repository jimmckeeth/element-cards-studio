/**
 * webpWorker.js — runs the vendored libwebp WASM encoder off the main
 * thread. See webpEncoder.js for why this exists at all.
 *
 * A module Worker rather than a plain function because encoding a large
 * export (an 8x-scale card can be 250+ megapixels) takes long enough —
 * seconds, not milliseconds — that doing it on the main thread would freeze
 * the page and the preview underneath the "Working…" button.
 */

import createEncoderModule from './vendor/webp-enc/webp_enc.js';
import { losslessWebpOptions } from './vendor/webp-enc/lossless-options.js';

let modulePromise = null;
function encoderModule() {
  if (!modulePromise) modulePromise = createEncoderModule();
  return modulePromise;
}

self.onmessage = async (ev) => {
  const { id, buffer, width, height, method } = ev.data;
  try {
    const mod = await encoderModule();
    const pixels = new Uint8Array(buffer);
    // exact:1 (set inside losslessWebpOptions) preserves RGB under fully
    // transparent pixels too — a real lossless guarantee, not just "no
    // visible loss".
    const result = mod.encode(pixels, width, height, losslessWebpOptions(method));
    if (!result) throw new Error('libwebp returned no output.');
    // Transfer the result back rather than copy it, for the same reason the
    // input was transferred in.
    const out = result.buffer;
    self.postMessage({ id, ok: true, bytes: out }, [out]);
  } catch (err) {
    self.postMessage({ id, ok: false, message: err?.message || String(err) });
  }
};
