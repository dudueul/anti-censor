/**
 * A raster image in RGBA8 layout, structurally compatible with the browser's
 * `ImageData` (so the same buffers flow between the canvas and our pure
 * transform functions). All core transforms operate on this type so they can be
 * unit-tested in Node without a real DOM.
 */
export interface Raster {
  width: number;
  height: number;
  /** RGBA, row-major, length === width * height * 4. */
  data: Uint8ClampedArray;
}

/** A single-channel float plane (e.g. luma), used by metrics and hashing. */
export interface Plane {
  width: number;
  height: number;
  data: Float64Array;
}

export function createRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function cloneRaster(src: Raster): Raster {
  return {
    width: src.width,
    height: src.height,
    data: new Uint8ClampedArray(src.data),
  };
}

export function assertSameSize(a: Raster, b: Raster): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `raster size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    );
  }
}
