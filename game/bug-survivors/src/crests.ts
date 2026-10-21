// Crests are the achievements: all 55 PostHog team crests (@posthog/brand), each earned by something fitting its
// team or product, and each unlocking a hoggie. The ids are the crest slugs; old achievement ids migrate (save.ts).
import type { AchievementDef } from '@shared/meta';
import brand from './brand.json';

export interface CrestDef { id: string; desc: string; hog: string; hidden?: boolean }
const CRESTS: CrestDef[] = [
  { id: 'a-default-crest', desc: 'Clear wave 1', hog: 'success' },
  { id: 'ai-gateway', desc: 'Squash 1,000 bugs with AI tools (in total)', hog: 'dadd-ai-2' },
  { id: 'ai-observability', desc: 'Evolve Trace into Evaluations', hog: 'magnifying-glass' },
  { id: 'ai-research', desc: 'Evolve Max AI into Deep Research', hog: 'research' },
  { id: 'analytics-platform', desc: 'Hold 3 analytics weapons at once', hog: 'chart' },
  { id: 'apm', desc: 'Beat a boss in under 20 s', hog: 'rocket' },
  { id: 'batch-exports', desc: 'One Batch Export hits 100 bugs', hog: 'mailbox' },
  { id: 'billing', desc: 'Earn 1,000 gold in total', hog: 'money' },
  { id: 'blitzscale', desc: 'Reach wave 5 before 14:00', hog: 'roller-coaster' },
  { id: 'builder-relations', desc: 'Play 10 runs', hog: 'hand-clasp' },
  { id: 'clickhouse', desc: 'Squash 100,000 bugs in total', hog: 'construction-1' },
  { id: 'client-libraries', desc: 'Clear wave 1 with 10 different hoggies', hog: 'coding-group' },
  { id: 'cloud-foundations', desc: 'Reach wave 8', hog: 'construction-2' },
  { id: 'cloud-platform', desc: 'Reach wave 10', hog: 'float' },
  { id: 'conversations', desc: 'Find 10 handbook pages', hog: 'phone-call' },
  { id: 'customer-analytics', desc: 'Squash 50 elites in total', hog: 'noir-1' },
  { id: 'customer-success-eu', desc: 'Co-op only: not in this game', hog: 'croissant' },
  { id: 'customer-success-na', desc: 'Co-op only: not in this game', hog: 'burger' },
  { id: 'data-modeling', desc: 'Evolve Managed Warehouse', hog: 'doll-house' },
  { id: 'data-tools', desc: 'Hold Warehouse, Pipelines and Batch Exports', hog: 'data-thief' },
  { id: 'demand-gen', desc: 'Pick up 25 powerups in one run', hog: 'megaphone' },
  { id: 'dev-experience', desc: 'Clear wave 1 without getting hit', hog: 'code-bubble' },
  { id: 'editorial', desc: 'Find every handbook page', hog: 'reading-is-magic' },
  { id: 'error-tracking', desc: 'Evolve Stack Trace Storm', hog: 'error' },
  { id: 'experiments', desc: 'Evolve Multivariate Barrage', hog: 'experiment' },
  { id: 'feature-flags', desc: 'Evolve Kill Switch Grid', hog: 'stop' },
  { id: 'forward-deployed-engineering', desc: 'Clear wave 3 on heat 3 or more', hog: 'explorer' },
  { id: 'graphics', desc: 'Unlock 25 hoggies', hog: 'art-thief' },
  { id: 'growth', desc: 'Reach level 100 in one run', hog: 'gardener-1' },
  { id: 'gtm-engineering', desc: 'Cash out at wave 3+ with 500+ gold', hog: 'haha-bizzniss' },
  { id: 'ingestion', desc: 'Collect 5,000 gems in one run', hog: 'hot-popcorn' },
  { id: 'managed-warehouse', desc: 'Hold 5 evolved weapons', hog: 'organized' },
  { id: 'marketing', desc: 'Score 250,000 in one run', hog: 'town-crier' },
  { id: 'mcp-analytics', desc: 'Hold 5 PostHog tools in one run', hog: 'cursor' },
  { id: 'new-business-sales', desc: 'Cash out for the first time', hog: 'gatsby' },
  { id: 'onboarding', desc: 'Finish your first run', hog: 'lifeguard' },
  { id: 'people-ops', desc: 'Unlock 50 hoggies', hog: 'namaste' },
  { id: 'platform-features', desc: 'Patch a weapon to v1.10', hog: 'transformer' },
  { id: 'platform-ux', desc: 'Ship a v2.0 major release', hog: 'ipad' },
  { id: 'posthog-desktop', desc: 'Run 9 Command Center agents', hog: 'desk-wizard' },
  { id: 'product-analytics', desc: 'Evolve Funnel Quake', hog: 'level-up' },
  { id: 'product-lead-sales-east', desc: 'Clear wave 1 on heat 3', hog: 'football-coach' },
  { id: 'product-led-sales-west', desc: 'Clear wave 3 on heat 5', hog: 'cowboy-lasso' },
  { id: 'replay', desc: 'Evolve Rage Click Vortex', hog: 'x-ray' },
  { id: 'security', desc: 'Clear wave 6 without dropping under half HP', hog: 'mountie' },
  { id: 'self-driving', desc: 'Ride out Self-Driving Mode', hog: 'self-driving' },
  { id: 'support', desc: 'Be revived 10 times in total', hog: 'doctor-1' },
  { id: 'surveys', desc: 'Evolve NPS Blizzard', hog: 'survey' },
  { id: 'talent', desc: 'Unlock every signature hoggie', hog: 'star' },
  { id: 'warehouse-sources', desc: 'Collect every merch relic', hog: 'safari' },
  { id: 'web-analytics', desc: 'Evolve Realtime Dashboard', hog: 'traffic-controller' },
  { id: 'website', desc: 'Fuse Full Stack Nova', hog: 'dr-manhattan', hidden: true },
  { id: 'wizard-docs', desc: 'Clear wave 1 as a Wizard', hog: 'wizard-3' },
  { id: 'workflows', desc: 'Evolve Multi-Channel Blast', hog: 'workflows' },
  { id: 'youtube', desc: 'Get run over by Hogzilla', hog: 'driving-hogzilla' },
];

const NAMES = new Map((brand as { crests: { id: string; name: string }[] }).crests.map((c) => [c.id, c.name]));
export const CREST_INDEX = new Map((brand as { crests: { id: string }[] }).crests.map((c, i) => [c.id, i]));
export const crestFrame = (id: string) => CREST_INDEX.get(id) ?? 0;
export const CREST_BY_ID = new Map(CRESTS.map((c) => [c.id, c]));
export const CREST_LIST = CRESTS;

export const ACHIEVEMENTS: AchievementDef[] = CRESTS.map((c) => ({ id: c.id, name: NAMES.get(c.id) ?? c.id, desc: c.desc, hidden: c.hidden }));

/** Old achievement ids -> crests, so earlier saves keep what they earned. */
export const LEGACY: Record<string, string> = {
  first_win: 'a-default-crest', rich: 'billing', daily: 'customer-success-eu', heat5: 'product-led-sales-west',
  hands_off: 'self-driving', super: 'website', full_clear: 'a-default-crest',
};
/** Old heroes -> hoggies. */
export const LEGACY_HEROES: Record<string, string> = { max: 'im-the-driver', sprinter: 'rocket', wizard: 'wizard-1', hacker: 'error' };
