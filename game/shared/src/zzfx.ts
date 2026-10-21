// A readable implementation of the ZzFX sound generator (same parameter order as ZzFX 1.x, so
// presets made on https://killedbyapixel.github.io/ZzFX/ paste straight into audio/sfx.json).
// Sounds are synthesised in the browser, so they can't fail to load.
const R = 44100;

export type ZzfxParams = number[];

export function zzfxGenerate(
  volume = 1, randomness = 0.05, frequency = 220, attack = 0, sustain = 0, release = 0.1,
  shape = 0, shapeCurve = 1, slide = 0, deltaSlide = 0, pitchJump = 0, pitchJumpTime = 0,
  repeatTime = 0, noise = 0, modulation = 0, bitCrush = 0, delay = 0, sustainVolume = 1,
  decay = 0, tremolo = 0,
): Float32Array {
  const PI2 = Math.PI * 2;
  const sign = (v: number) => (v > 0 ? 1 : -1);
  let startSlide = (slide *= (500 * PI2) / R / R);
  let startFrequency = (frequency *= ((1 + randomness * 2 * Math.random() - randomness) * PI2) / R);
  attack = attack * R + 9;
  decay *= R; sustain *= R; release *= R; delay *= R;
  deltaSlide *= (500 * PI2) / R ** 3;
  modulation *= PI2 / R;
  pitchJump *= PI2 / R;
  pitchJumpTime *= R;
  repeatTime = (repeatTime * R) | 0;
  const length = (attack + decay + sustain + release + delay) | 0;
  const b = new Float32Array(length);
  let t = 0, tm = 0, j = 1, r = 0, c = 0, s = 0, f: number;
  const crush = (bitCrush * 100) | 0;
  for (let i = 0; i < length; b[i++] = s) {
    if (!(++c % (crush || 1)) || !crush) {
      s = shape
        ? shape > 1
          ? shape > 2
            ? shape > 3
              ? Math.sin((t % PI2) ** 3)
              : Math.max(Math.min(Math.tan(t), 1), -1)
            : 1 - (((((2 * t) / PI2) % 2) + 2) % 2)
          : 1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2)
        : Math.sin(t);
      const env = i < attack ? i / attack
        : i < attack + decay ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
        : i < attack + decay + sustain ? sustainVolume
        : i < length - delay ? ((length - i - delay) / release) * sustainVolume
        : 0;
      s = (repeatTime ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime) : 1) *
        sign(s) * Math.abs(s) ** shapeCurve * volume * 0.3 * env;
      s = delay ? s / 2 + (delay > i ? 0 : ((i < length - delay ? 1 : (length - i) / delay) * b[(i - delay) | 0]) / 2) : s;
    }
    f = (frequency += slide += deltaSlide) * Math.cos(modulation * tm++);
    t += f - f * noise * (1 - (((Math.sin(i) + 1) * 1e9) % 2));
    if (j && ++j > pitchJumpTime) { frequency += pitchJump; startFrequency += pitchJump; j = 0; }
    if (repeatTime && !(++r % repeatTime)) { frequency = startFrequency; slide = startSlide; j = j || 1; }
  }
  return b;
}

export class Sfx {
  private buffers = new Map<string, AudioBuffer>();
  private last = new Map<string, number>();
  muted = false;

  constructor(private ctx: AudioContext | null, private presets: Record<string, ZzfxParams>, private pitch = 1) {}

  play(name: string, volume = 1, minGapMs = 40) {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < minGapMs) return; // don't stack 40 hit sounds in one frame
    this.last.set(name, now);
    let buf = this.buffers.get(name);
    if (!buf) {
      const p = this.presets[name];
      if (!p) return;
      const params = [...p];
      params[1] = 0; // deterministic pitch; variety comes from `pitch`
      params[2] = (params[2] ?? 220) * this.pitch;
      const data = zzfxGenerate(...params);
      buf = ctx.createBuffer(1, Math.max(1, data.length), R);
      buf.getChannelData(0).set(data);
      this.buffers.set(name, buf);
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }
}
