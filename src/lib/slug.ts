import { randomToken } from './crypto';

/** "Acme Rockets, Inc." -> "acme-rockets-inc" (at most `max` characters, never empty). */
export function slugify(name: string, max = 36): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
  return s || 'game';
}

/** A public game URL segment: the company, then a random part that makes the link unguessable. Always matches the slug rule (3-48 chars). */
export function newSlug(name: string): string {
  const random = randomToken(8)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .padEnd(8, '0')
    .slice(0, 8);
  return `${slugify(name, 36)}-${random}`;
}
