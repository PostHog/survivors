// Reads back the PNGs src/lib/png.ts writes (8-bit RGBA, filter 0, one IDAT), so tests can look at the pixels of what the agent is shown.

export async function decodePng(png: Uint8Array): Promise<{ w: number; h: number; rgba: Uint8Array }> {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let [w, h] = [0, 0];
  const idat: Uint8Array[] = [];
  for (let o = 8; o < png.length; ) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    const data = png.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR')
      [w, h] = [new DataView(data.buffer, data.byteOffset).getUint32(0), new DataView(data.buffer, data.byteOffset).getUint32(4)];
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const compressed = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of idat) {
    compressed.set(c, at);
    at += c.length;
  }
  const raw = new Uint8Array(
    await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer(),
  );
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) rgba.set(raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)), y * w * 4);
  return { w, h, rgba };
}

/** Does the image contain a pixel of exactly this colour? */
export function hasColour(img: { rgba: Uint8Array }, [r, g, b]: [number, number, number]): boolean {
  for (let i = 0; i < img.rgba.length; i += 4)
    if (img.rgba[i] === r && img.rgba[i + 1] === g && img.rgba[i + 2] === b && img.rgba[i + 3] === 255) return true;
  return false;
}
