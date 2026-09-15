# Vendored: WebAssembly WebP encoder

`webp_enc.wasm` and `webp_enc.js` are Google's `libwebp` encoder compiled to
WebAssembly by the [Squoosh](https://github.com/GoogleChromeLabs/squoosh)
project and repackaged for npm as
[`@jsquash/webp`](https://github.com/jamsinclair/jSquash) 1.5.0
(non-SIMD build, for the widest browser compatibility).

Vendored rather than loaded from a CDN so the app stays a self-contained
static site with no third-party runtime dependency — consistent with the
"no build step, no dependencies" design of the rest of the project.

- `webp_enc.wasm`, `webp_enc.js` — Google libwebp, BSD-3-Clause
  (see `LICENSE.libwebp.md`)
- jSquash's Emscripten glue and TypeScript wrapper around it — Apache-2.0
  (see `LICENSE.jsquash.md`); the wrapper itself is not used here, only the
  raw codec files, called directly from `../webpEncoder.js`

## Why this exists

Chromium's built-in `canvas.toBlob('image/webp', 1)` does encode losslessly
(confirmed via the VP8L chunk it writes), but at a far lower compression
effort than a properly configured libwebp encoder — for a typical card
export it produces a file 100x or more larger than necessary, often larger
than the equivalent PNG. There is no way to raise that effort through the
Canvas API. Encoding with our own copy of libwebp, off the main thread in
`../webpWorker.js`, gets a WebP that is both genuinely lossless and
actually smaller than the PNG, on every browser that supports WebAssembly.

## Updating

Fetch a newer non-SIMD build the same way this one was obtained:

```sh
npm view @jsquash/webp version   # check the latest release
npm install @jsquash/webp --no-save
cp node_modules/@jsquash/webp/codec/enc/webp_enc.{js,wasm} .
```
