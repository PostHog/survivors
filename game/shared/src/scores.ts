// The leaderboard screen: the top 20 for each of the kit's modes, and (after a run that made the board) the 3-letter
// initials entry. Reached from the End screen (NEW HIGH SCORE / SCORES) or a kit's title choice.
//
// Initials: type letters, or UP/DOWN / the wheel / the ^ v buttons on the current letter; LEFT/RIGHT or a click picks the
// letter; ENTER or OK sends. With no entry pending, LEFT/RIGHT (or a click on a tab) switch boards.
import Phaser from 'phaser';
import { K, beginRun, runProps } from './kit';
import { hooks } from './hooks';
import { capture } from './analytics';
import { text, box, W, H, NARROW, TOUCH as TOUCH_DEVICE, PixelText } from './ui';
import { screen, starfield, button, onTap, inside, Rect, TAP } from './scenes';
import { lb, LbEntry, mmss } from './leaderboard';

const touchUi = () => TOUCH_DEVICE && !!K.kit?.touch;
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface ScoresData {
  mode?: string;
  /** A run that made the board, waiting for initials. */
  entry?: { score: number; stats: Record<string, number | string>; mode: string; first?: string };
  /** Where the screen came from: 'end' offers ONE MORE RUN + TITLE, 'title' offers BACK. */
  from?: 'end' | 'title';
  // Kept across a relayout (rotation):
  letters?: string[]; cur?: number; doneId?: number; doneRank?: number | null; error?: string;
}

export class ScoresScene extends Phaser.Scene {
  private d: ScoresData = {};
  private top: LbEntry[] | null | undefined; // undefined = loading, null = unreachable
  private objs: Phaser.GameObjects.GameObject[] = [];
  private btns: (Rect & { act: () => void })[] = [];
  private sending = false;

  constructor() { super('Scores'); }

  create(d: ScoresData) {
    hooks.scene = 'Scores';
    hooks.state = 'scores';
    this.d = d;
    d.from ??= 'title';
    d.mode ??= d.entry?.mode ?? lb.modes()[0].id;
    if (d.entry && !d.letters) {
      const l = lb.initials.split('');
      if (d.entry.first) { l[0] = d.entry.first; d.cur = 1; }
      d.letters = l;
    }
    d.cur ??= 0;
    screen(this, () => this.scene.restart(this.d));
    this.cameras.main.setBackgroundColor(K.ui.bg);
    starfield(this, 30);
    this.top = lb.cache.get(lb.board(d.mode));
    this.draw();
    this.load_();
    const key = (e: KeyboardEvent) => { if (!e.repeat) this.key(e); };
    window.addEventListener('keydown', key); // the DOM event, not Phaser's (Phaser can re-emit the last letter)
    this.events.once('shutdown', () => window.removeEventListener('keydown', key));
    onTap(this, (x, y) => this.btns.find((b) => inside(b, x, y, 1))?.act(), 250);
    const wheel = (_p: unknown, _o: unknown, _dx: number, dy: number) => { if (dy) this.spin(dy > 0 ? 1 : -1); };
    this.input.on('wheel', wheel);
    this.events.once('shutdown', () => this.input.off('wheel', wheel));
    hooks.debug = { ...(hooks.debug ?? {}), lbSubmit: (name: string) => { if (this.d.letters) { this.d.letters = name.toUpperCase().split('').slice(0, 3); this.send(); } } };
  }

  private get pending() { return !!this.d.entry && this.d.doneId === undefined; }

  private async load_() {
    const mode = this.d.mode!;
    const top = await lb.top(mode);
    if (!this.scene.isActive() || this.d.mode !== mode) return;
    this.top = top;
    this.draw();
  }

  private key(e: KeyboardEvent) {
    const c = e.code;
    if (this.pending) {
      if (/^Key[A-Z]$/.test(c)) { this.setLetter(c.slice(3)); this.d.cur = Math.min(2, this.d.cur! + 1); this.draw(); return; }
      if (c === 'Backspace') { this.d.cur = Math.max(0, this.d.cur! - 1); this.draw(); return; }
      if (c === 'ArrowUp') { this.spin(-1); return; }
      if (c === 'ArrowDown') { this.spin(1); return; }
      if (c === 'ArrowLeft' || c === 'ArrowRight') { this.d.cur = Phaser.Math.Clamp(this.d.cur! + (c === 'ArrowLeft' ? -1 : 1), 0, 2); this.draw(); return; }
      if (c === 'Enter' || c === 'NumpadEnter') { this.send(); return; }
      if (c === 'Escape') this.leave();
      return;
    }
    if (c === 'ArrowLeft' || c === 'ArrowRight' || c === 'KeyA' || c === 'KeyD') this.setMode(c === 'ArrowLeft' || c === 'KeyA' ? -1 : 1);
    else if (c === 'Enter' || c === 'Space' || c === 'NumpadEnter') { if (this.d.from === 'end') this.again(); else this.leave(); }
    else if (c === 'Escape') this.leave();
  }

  /** The wheel / UP / DOWN: the current letter while entering, else the board. */
  private spin(d: number) {
    if (this.pending) {
      const i = this.d.cur!, cur = A.indexOf(this.d.letters![i]);
      this.setLetter(A[(cur + d + 26) % 26]);
      this.draw();
    } else this.setMode(d);
  }

  private setLetter(l: string) {
    this.d.letters![this.d.cur!] = l;
    this.d.error = '';
    K.play('move', 0.4);
  }

  private setMode(d: number) {
    const ms = lb.modes();
    if (ms.length < 2) return;
    const i = ms.findIndex((m) => m.id === this.d.mode);
    this.d.mode = ms[(i + d + ms.length) % ms.length].id;
    this.top = lb.cache.get(lb.board(this.d.mode));
    K.play('move', 0.5);
    this.draw();
    this.load_();
  }

  private async send() {
    const e = this.d.entry;
    if (!e || this.sending || !this.pending) return;
    const name = this.d.letters!.join('');
    this.sending = true;
    this.d.error = '';
    this.draw();
    const r = await lb.submit(e.mode, name, e.score, e.stats);
    this.sending = false;
    if (!this.scene.isActive()) return;
    if ('error' in r) { this.d.error = r.error; K.play('hurt', 0.4); this.draw(); return; }
    lb.initials = name;
    this.d.doneId = r.id;
    this.d.doneRank = r.rank;
    this.d.mode = e.mode;
    this.top = r.top;
    K.play(r.rank ? 'win' : 'select', 0.7);
    capture('leaderboard_entry', { board: lb.board(e.mode), rank: r.rank, score: e.score });
    this.draw();
  }

  private again() {
    beginRun();
    capture('game_started', { replay: true, ...runProps() });
    this.scene.start(K.kit.gameScene);
  }
  private leave() { K.play('select'); this.scene.start('Title'); }

  private draw() {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    this.btns = [];
    const ui = K.ui, d = this.d, narrow = NARROW(), o = this.objs;
    const T = (x: number, y: number, s: string, opts: Parameters<typeof text>[4] = {}) => { const t = text(this, x, y, s, { depth: 10, ...opts }); o.push(t); return t; };
    const btn = (r: Rect, label: string, act: () => void, opt: Parameters<typeof button>[3] = {}) => { o.push(...button(this, r, label, opt)); this.btns.push({ ...r, act }); };
    const mx = narrow ? 4 : 12;
    o.push(box(this, mx, 6, W - mx * 2, H - 12, ui.bgInt, ui.textInt, ui.panelInt));
    let y = 14;
    T(W / 2, y, 'TOP 20', { scale: 2, align: 'center', color: ui.accentInt });
    y += 20;
    // Board tabs.
    const ms = lb.modes();
    if (ms.length > 1) {
      const tw = Math.min(70, Math.floor((W - 40) / ms.length)), th = touchUi() ? TAP - 4 : 14, x0 = W / 2 - (ms.length * tw + (ms.length - 1) * 4) / 2;
      ms.forEach((m, i) => btn({ x: x0 + i * (tw + 4), y, w: tw, h: th }, m.label, () => {
        if (this.pending || m.id === d.mode) return;
        d.mode = m.id; this.top = lb.cache.get(lb.board(m.id)); K.play('move', 0.5); this.draw(); this.load_();
      }, { on: m.id === d.mode, dim: this.pending && m.id !== d.mode }));
      y += th + 6;
    }
    // Initials entry.
    if (this.pending) {
      const e = d.entry!, rank = this.top ? lb.rankOf(this.top, e.score) : 0;
      T(W / 2, y, `NEW HIGH SCORE${rank ? ` #${rank}` : ''}!   ${e.score}`, { align: 'center', color: 0xf8d878 });
      y += 11;
      T(W / 2, y, touchUi() ? 'Your initials: tap ^ v, then OK' : 'Type your initials, ENTER to send', { align: 'center', color: ui.dimInt });
      y += 12;
      const bw = 24, bh = 26, gap = 6, okW = 44, rowW = 3 * bw + 2 * gap + 10 + okW, x0 = Math.round(W / 2 - rowW / 2);
      const arrows = touchUi(), ay = y, ly = arrows ? y + TAP + 2 : y;
      for (let i = 0; i < 3; i++) {
        const x = x0 + i * (bw + gap), on = i === d.cur;
        if (arrows) btn({ x, y: ay, w: bw, h: TAP }, '^', () => { d.cur = i; this.spin(-1); });
        o.push(box(this, x, ly, bw, bh, on ? ui.panelInt : ui.bgInt, on ? ui.accentInt : ui.textInt, on ? ui.accentInt : ui.panelInt).setDepth(10));
        T(x + bw / 2, ly + 6, d.letters![i], { scale: 2, align: 'center', color: on ? 0xfcfcfc : ui.textInt, depth: 11 });
        this.btns.push({ x, y: ly, w: bw, h: bh, act: () => { d.cur = i; K.play('move', 0.4); this.draw(); } });
        if (arrows) btn({ x, y: ly + bh + 2, w: bw, h: TAP }, 'v', () => { d.cur = i; this.spin(1); });
      }
      btn({ x: x0 + 3 * (bw + gap) + 4, y: ly, w: okW, h: bh }, this.sending ? '...' : 'OK', () => this.send(), { color: 0xf8d878 });
      y = ly + bh + (arrows ? TAP + 4 : 0) + 4;
      if (d.error) T(W / 2, y, d.error.toUpperCase(), { align: 'center', color: 0xf87858 });
      y += 12;
    } else if (d.doneId !== undefined) {
      T(W / 2, y, d.doneRank ? `YOU'RE #${d.doneRank}!` : 'Sent! Just off the board this time', { align: 'center', color: 0xf8d878 });
      y += 13;
    }
    // The table.
    const bottom = H - (touchUi() ? TAP + 18 : 34);
    const cols = K.kit.leaderboard?.columns ?? [['time', 'TIME']];
    const show = narrow ? cols.filter(([k]) => k !== 'hog').slice(0, 2) : cols;
    const left = narrow ? mx + 8 : Math.max(mx + 10, W / 2 - 170);
    const xs = { rank: left + 12, name: left + 20, score: left + 92 };
    const colX = (i: number) => xs.score + 18 + i * (narrow ? 46 : 42);
    const head = (s: string, x: number, align: 'left' | 'right' = 'left') => T(x, y, s, { color: ui.dimInt, align });
    head('#', xs.rank, 'right'); head('NAME', xs.name); head('SCORE', xs.score, 'right');
    show.forEach(([, label], i) => head(label, colX(i)));
    y += 11;
    const rowH = Phaser.Math.Clamp(Math.floor((bottom - y) / 20), 8, 13), fit = Math.max(3, Math.floor((bottom - y) / rowH)); // all 20 if they fit
    if (this.top === undefined) T(W / 2, y + 10, 'Loading...', { align: 'center', color: ui.dimInt });
    else if (this.top === null) T(W / 2, y + 10, "Can't reach the leaderboard right now", { align: 'center', color: 0xf87858 });
    else if (!this.top.length) T(W / 2, y + 10, 'No scores yet. Be the first!', { align: 'center', color: ui.dimInt });
    else {
      let rows = this.top.slice(0, fit);
      const mine = this.top.findIndex((e) => e.id === d.doneId);
      if (mine >= fit) rows = [...this.top.slice(0, fit - 1), this.top[mine]]; // keep your row in view
      rows.forEach((e) => {
        const me = e.id === d.doneId, col = me ? 0xf8d878 : ui.textInt;
        if (me) o.push(this.add.rectangle(left, y - 1, W - left * 2, rowH, ui.panelInt, 0.5).setOrigin(0).setDepth(9));
        T(xs.rank, y, String(this.top!.indexOf(e) + 1), { align: 'right', color: me ? col : ui.dimInt });
        T(xs.name, y, e.name, { color: me ? col : ui.accentInt });
        T(xs.score, y, String(e.score), { align: 'right', color: col });
        show.forEach(([k], i) => {
          const v = e.stats?.[k];
          const s = v === undefined ? '' : k === 'time' && typeof v === 'number' ? mmss(v) : String(v);
          T(colX(i), y, s, { color: me ? col : ui.dimInt, maxWidth: k === 'hog' ? W - colX(i) - left : 40, maxLines: 1 });
        });
        y += rowH;
      });
    }
    // Buttons.
    const by = H - (touchUi() ? TAP + 12 : 30), bh = touchUi() ? TAP + 2 : 20;
    const keys = !touchUi();
    if (d.from === 'end') {
      const bw = Math.min(130, Math.floor((W - 30) / 2));
      btn({ x: W / 2 - bw - 3, y: by, w: bw, h: bh }, keys && !this.pending ? 'ENTER  ONE MORE RUN' : 'ONE MORE RUN', () => this.again(), { color: ui.accentInt });
      btn({ x: W / 2 + 3, y: by, w: bw, h: bh }, keys ? 'ESC  TITLE' : 'TITLE', () => this.leave());
    } else {
      const bw = Math.min(110, W - 40);
      btn({ x: W / 2 - bw / 2, y: by, w: bw, h: bh }, keys ? 'ESC  BACK' : 'BACK', () => this.leave());
    }
  }
}
