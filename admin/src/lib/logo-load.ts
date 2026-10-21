// The browser half of logo conversion: read an image file (PNG, JPEG, WebP, SVG...) into pixels. Everything after that is lib/logo.ts.
import type { Rgba } from './logo';

const MAX_SIDE = 1200;

export async function loadImagePixels(file: File): Promise<Rgba> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    // An SVG with no size of its own reports 0x0: give it a working size.
    const natural = { w: img.naturalWidth || 1000, h: img.naturalHeight || 1000 };
    const k = Math.min(1, MAX_SIDE / Math.max(natural.w, natural.h), ...(img.naturalWidth ? [] : [1])) || 1;
    const [w, h] = [Math.max(1, Math.round(natural.w * k)), Math.max(1, Math.round(natural.h * k))];
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('This browser cannot read images');
    ctx.drawImage(img, 0, 0, w, h);
    return { w, h, data: ctx.getImageData(0, 0, w, h).data };
  } finally {
    URL.revokeObjectURL(url);
  }
}
