/**
 * lossless-options.js — the full `WebPConfig` struct fields libwebp expects,
 * fixed for a true lossless encode.
 *
 * The encoder's Embind binding takes the complete struct, not a partial one —
 * an omitted field isn't defaulted on the C++ side the way a JS object might
 * suggest. So this is the full field list (values are libwebp's own
 * defaults, per Google's `@jsquash/webp` packaging of the same encoder),
 * with only `lossless`/`exact`/`near_lossless` fixed for our use and
 * `method` left as the caller's one real knob. Shared between webpWorker.js
 * and test/run.mjs so the two can't drift apart.
 */
export function losslessWebpOptions(method = 4) {
  return {
    lossless: 1, exact: 1, near_lossless: 100,
    method, quality: 100,
    target_size: 0, target_PSNR: 0, sns_strength: 50, filter_strength: 60,
    filter_sharpness: 0, filter_type: 1, partitions: 0, segments: 4, pass: 1,
    show_compressed: 0, preprocessing: 0, autofilter: 0, partition_limit: 0,
    alpha_compression: 1, alpha_filtering: 1, alpha_quality: 100,
    image_hint: 0, emulate_jpeg_size: 0, thread_level: 0, low_memory: 0,
    use_delta_palette: 0, use_sharp_yuv: 0,
  };
}
