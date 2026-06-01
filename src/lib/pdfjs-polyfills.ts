/** Used by pdf.js 5.6+ internally (e.g. PDFObjects). */
export function polyfillPromiseWithResolvers(): void {
  if (typeof Promise.withResolvers === "function") {
    return;
  }

  Promise.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

/**
 * pdf.js 5.6+ uses Map.getOrInsertComputed during canvas render; polyfill when missing.
 * Legacy worker build covers the worker thread; this guards the main thread.
 */
export function polyfillMapGetOrInsertComputed(): void {
  const mapProto = Map.prototype as Map<unknown, unknown> & {
    getOrInsertComputed?: (key: unknown, callback: () => unknown) => unknown;
  };

  if (typeof mapProto.getOrInsertComputed === "function") {
    return;
  }

  mapProto.getOrInsertComputed = function getOrInsertComputed<K, V>(this: Map<K, V>, key: K, callback: () => V): V {
    if (this.has(key)) {
      return this.get(key) as V;
    }
    const value = callback();
    this.set(key, value);
    return value;
  };
}

/**
 * Minimal DOMMatrix stub for pdfjs-dist when the runtime lacks it (e.g. workerd SSR).
 * Derived from unpdf's polyfill (Apache-2.0).
 */
export function polyfillDomMatrix(): void {
  if (typeof globalThis.DOMMatrix !== "undefined") {
    return;
  }

  class DomMatrixStub {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;

    constructor(init?: number[]) {
      if (Array.isArray(init) && init.length === 6) {
        this.a = init[0] ?? 1;
        this.b = init[1] ?? 0;
        this.c = init[2] ?? 0;
        this.d = init[3] ?? 1;
        this.e = init[4] ?? 0;
        this.f = init[5] ?? 0;
      } else {
        this.a = 1;
        this.b = 0;
        this.c = 0;
        this.d = 1;
        this.e = 0;
        this.f = 0;
      }
    }

    translateSelf(tx: number, ty = 0): this {
      this.e = this.a * tx + this.c * ty + this.e;
      this.f = this.b * tx + this.d * ty + this.f;
      return this;
    }

    scaleSelf(sx: number, sy = sx): this {
      this.a *= sx;
      this.b *= sx;
      this.c *= sy;
      this.d *= sy;
      return this;
    }
  }

  // pdfjs only needs a constructible DOMMatrix-like global
  globalThis.DOMMatrix = DomMatrixStub as unknown as typeof DOMMatrix;
}
