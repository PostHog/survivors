import Phaser from 'phaser';
import { startKit, K, spr, anim, heatRow } from '@shared/kit';
import { meta } from '@shared/meta';
import { lb } from '@shared/leaderboard';
import { text, W, DW, vy, TOUCH, NARROW } from '@shared/ui';
import schema from '../theme.schema.json';
import defaultTheme from '../themes/default.json';
import slots from '../slots.json';
import sfx from '../audio/sfx.json';
import { GameScene, productName, theName, lastRun, HOG32, HOG64, CREST16, CREST64 } from './game';
import { ShopScene } from './shop';
import { HEAT, YOLO } from './content';
import { ACHIEVEMENTS } from './crests';
import { HOGS, hogFrame, hogName } from './hoggies';
import { currentHog, save, syncCrestHogs } from './save';
import { openGuide } from './guide';

/** Runs once per how-to screen: the MERCH title choice skips straight to the shop, SCORES to the
 * leaderboards, GUIDE back to the title with the player's guide open over it. Module scope so off() matches. */
function toShop(this: void) {
  if (K.run.mode === 'guide') {
    (window as any).__phaser?.scene?.getScene('HowTo')?.scene.start('Title');
    openGuide();
    return;
  }
  const to = ({ shop: 'Shop', scores: 'Scores' } as Record<string, string>)[K.run.mode];
  if (!to) return;
  const howto = (window as any).__phaser?.scene?.getScene('HowTo') as Phaser.Scene | undefined;
  howto?.scene.start(to, to === 'Scores' ? { from: 'title' } : undefined);
}

startKit({
  id: 'bug-survivors',
  name: 'Bug Survivors',
  schema,
  defaultTheme,
  slots,
  sfx: sfx as Record<string, number[]>,
  scenes: [GameScene, ShopScene],
  gameScene: 'Game',
  touch: true,
  resizable: true,
  // Kit-fixed PostHog brand art: every hoggie (player characters) and every team crest (achievements).
  preload: (scene) => {
    scene.load.spritesheet(HOG32, 'assets/kit/hoggies32.png', { frameWidth: 32, frameHeight: 32 });
    scene.load.spritesheet(HOG64, 'assets/kit/hoggies64.png', { frameWidth: 64, frameHeight: 64 });
    scene.load.spritesheet(CREST16, 'assets/kit/crests16.png', { frameWidth: 16, frameHeight: 16 });
    scene.load.spritesheet(CREST64, 'assets/kit/crests64.png', { frameWidth: 64, frameHeight: 64 });
  },
  howTo: (t) => {
    const lines = [
      `Bugs are swarming ${t.prospect.name}. Survive until ${theName(t.game.boss.name)} shows up, then squash it.`,
      'Every boss is a release. After it: cash out, or keep going into the next wave for new PostHog tools.',
      TOUCH ? 'Drag a finger anywhere to move. Your PostHog weapons fire on their own. Grab the blue gems to level up.'
        : 'Move with the ARROW KEYS or WASD. Your PostHog weapons fire on their own. Grab the blue gems to level up.',
      `You start with ${productName(t.game.starting_product)}. Elites drop chests. ${TOUCH ? 'The || button pauses.' : 'ESC pauses.'}`,
    ];
    if (K.run.heat > 0) lines.push(`HEAT ${K.run.heat}: ${HEAT.slice(1, K.run.heat + 1).map((h) => h.desc).join(', ')}.`);
    else if (K.run.mode === 'yolo') lines.push('YOLO: --dangerously-skip-permissions. x3 everything, no pauses, Max picks your cards.');
    return lines;
  },
  titleArt: (scene: Phaser.Scene) => {
    syncCrestHogs();
    // The hoggie facing down a lineup of the prospect's bugs, with the boss looming. A narrow screen squeezes the lineup
    // in (k) and a tall one drops it to the middle (vy).
    // On a wide touch screen the START button row needs the bottom, so the lineup sits a little higher.
    const k = Math.min(1, W / DW), lift = TOUCH && W >= DW ? 14 : 0, y = (v: number) => vy(v, 0.45) - lift;
    scene.add.sprite(W / 2, y(150), spr('boss')).play(anim('boss')).setAlpha(0.9);
    const hog = currentHog();
    const im = scene.add.image(W / 2 - 150 * k, y(166), HOG64, hogFrame(hog)).setFlipX(true);
    scene.tweens.add({ targets: im, y: y(162), duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    [0, 1, 2].forEach((i) => {
      scene.add.sprite(W / 2 + (70 + i * 26) * k + 8 * (1 - k), y(170 + (i % 2) * 10), spr(`enemy_${i + 1}`)).setScale(2).setFlipX(true)
        .play(anim(`enemy_${i + 1}`));
    });
    // Returning players: gold, best wave and hoggie count.
    const sv = save();
    const parts: string[] = [];
    if (meta.data.coins > 0) parts.push(`GOLD ${meta.data.coins}`);
    if (sv.bestWave >= 2) parts.push(`BEST WAVE ${sv.bestWave}`);
    if (meta.data.runs > 0) parts.push(`HOGGIES ${sv.hogs.length}/${HOGS.length}`);
    if (parts.length) text(scene, W / 2, W < DW ? 26 : 16, parts.join('   '), { align: 'center', color: 0xf8d878, depth: 10, maxWidth: W - 8, maxLines: 2 });
    if (meta.data.runs > 0) text(scene, W / 2 - 150 * k, y(202), hogName(hog).toUpperCase(), { align: 'center', color: K.ui.dimInt, depth: 10, maxWidth: Math.min(110, (W / 2 - 150 * k) * 2 - 4), maxLines: 1 });
    // MERCH is a title choice (mode 'shop'): when the run starts in shop mode, jump from the how-to straight to the shop.
    const howto = scene.scene.get('HowTo');
    howto.events.off('create', toShop);
    howto.events.once('create', toShop);
  },
  titleMenu: () => {
    const yolo = save().bestWave >= YOLO.unlockWave;
    return [
      { key: 'mode', choices: [
        { label: 'RUN', value: 'standard' },
        { label: 'YOLO', value: 'yolo', locked: !yolo },
        { label: 'MERCH', value: 'shop' },
        ...(lb.enabled() ? [{ label: NARROW() ? 'TOP' : 'SCORES', value: 'scores' }] : []), // 6 buttons: a portrait phone fits 5 letters
        { label: 'GUIDE', value: 'guide' },
      ] },
      heatRow(5),
    ];
  },
  endSummary: () => lastRun.lines.slice(0, 2),
  // Online top 20s (shared/src/leaderboard.ts): one board for normal runs (any heat; heat already scales the score), one
  // for YOLO.
  leaderboard: {
    modes: [{ id: 'run', label: 'RUN' }, { id: 'yolo', label: 'YOLO' }],
    mode: () => (K.run.mode === 'yolo' ? 'yolo' : 'run'),
    stats: (d) => {
      const p = (d.props ?? {}) as Record<string, unknown>, num = (v: unknown) => (typeof v === 'number' ? v : 0);
      return { wave: num(p.wave), level: num(p.level), kills: num(p.kills), heat: K.run.heat, hog: hogName(String(p.hog ?? '')).slice(0, 24) };
    },
    columns: [['wave', 'WAVE'], ['time', 'TIME'], ['level', 'LV'], ['hog', 'HOGGIE']],
  },
  achievements: ACHIEVEMENTS,
  postSanitize: (t, issues) => {
    // The starting weapon must be one of the featured products.
    if (!t.products.includes(t.game.starting_product)) {
      issues.push(`game.starting_product ${t.game.starting_product} not in products: using ${t.products[0]}`);
      t.game.starting_product = t.products[0];
    }
  },
});

export { K };
