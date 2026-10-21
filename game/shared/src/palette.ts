// The fixed 36-colour NES-style master palette. Brand colours are snapped to it, so every game
// stays 8-bit and readable whatever the prospect's brand. shared/sprites.py uses the same list (palette.json).
import masterList from '../palette.json';

export const MASTER: string[] = masterList as string[];

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const toInt = (h: string) => parseInt(h.slice(1), 16);
export const isHex = (h: unknown): h is string => typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h);

/** Perceptual-ish ("redmean") distance between two #rrggbb colours. */
export function dist(a: string, b: string) {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
}

export function snap(hex: string): string {
  if (!isHex(hex)) return MASTER[0];
  return MASTER.reduce((best, c) => (dist(hex, c) < dist(hex, best) ? c : best), MASTER[0]);
}

export function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Nearest master colour at least `min` contrast away from `bg` (keeps the hue where it can). */
export function readableOn(hex: string, bg: string, min = 3): string {
  const ok = MASTER.filter((c) => contrast(c, bg) >= min);
  return ok.reduce((best, c) => (dist(hex, c) < dist(hex, best) ? c : best), ok[0] ?? '#fcfcfc');
}

export interface Ui {
  bg: string;       // screen background: a dark colour
  panel: string;    // boxes and bars: the brand's primary, kept readable against bg
  primary: string;
  accent: string;   // highlights, selection
  text: string;     // body text on bg
  dim: string;      // secondary text on bg
  onPanel: string;  // text drawn on panel
  bgInt: number; panelInt: number; primaryInt: number; accentInt: number; textInt: number; dimInt: number; onPanelInt: number;
}

/** Derive screen colours from a theme palette: dark background, readable text, brand accents. */
export function deriveUi(p: { primary: string; secondary: string; accent: string }): Ui {
  const primary = snap(p.primary), secondary = snap(p.secondary), accent0 = snap(p.accent);
  // Background: the darker brand colour if it is dark enough and snapping kept its hue, else black.
  const pairs: [string, string][] = [[p.primary, primary], [p.secondary, secondary]];
  const [orig, darker] = pairs.sort((a, b) => luminance(a[1]) - luminance(b[1]))[0];
  const bg = luminance(darker) <= 0.08 && (!isHex(orig) || dist(orig, darker) < 120) ? darker : '#000000';
  const panel = readableOn(primary, bg, 1.8);
  const accent = readableOn(accent0, bg, 3);
  const text = '#fcfcfc';
  const dim = readableOn('#bcbcbc', bg, 4.5);
  const onPanel = contrast('#fcfcfc', panel) >= contrast('#000000', panel) ? '#fcfcfc' : '#000000';
  const ui = { bg, panel, primary, accent, text, dim, onPanel } as Ui;
  for (const k of ['bg', 'panel', 'primary', 'accent', 'text', 'dim', 'onPanel'] as const) (ui as any)[k + 'Int'] = toInt(ui[k]);
  return ui;
}
