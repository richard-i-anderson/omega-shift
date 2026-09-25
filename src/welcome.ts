import { SCORE, WELCOME } from './config';
import type { EnemyKind } from './entities/enemies';

/**
 * The welcome text: pages that type themselves out over the title screen once
 * nobody has touched a key for a while. Content and timing only; drawn by
 * `src/render/welcome.ts`.
 */
export interface StoryPage {
  kind: 'story';
  title: string;
  lines: string[];
}

export interface EnemyRow {
  /** What to draw beside the row. */
  icon: EnemyKind | 'bonus';
  name: string;
  points: string;
  text: string;
}

export interface EnemyPage {
  kind: 'enemies';
  title: string;
  rows: EnemyRow[];
}

export type WelcomePage = StoryPage | EnemyPage;

export const WELCOME_PAGES: readonly WelcomePage[] = [
  {
    kind: 'story',
    title: 'YOUR MISSION',
    lines: [
      'IN THE FAR FUTURE, GALACTIC COMMAND TRAINS ITS',
      'STAR FIGHTER PILOTS IN A FORCE-FIELD ARENA BUILT',
      'AT THE EDGE OF THE OMEGA SYSTEM.',
      '',
      'THE COURSE IS FLOWN AGAINST ROBOT DROID SHIPS.',
      'THEY ARE REAL, AND SO ARE THEIR WEAPONS. ONLY',
      'CADETS WHO CLEAR EVERY WAVE EARN THEIR WINGS.',
      '',
      'NOW THE ARENA HAS BEEN REBUILT. ITS FORCE FIELDS',
      "SHIFT FROM SHAPE TO SHAPE, AND SOME WON'T KEEP",
      'STILL. THE WALLS BOUNCE YOU BACK, AND A MOVING',
      'WALL WILL SHOVE YOU. GOOD LUCK, CADET.',
    ],
  },
  {
    kind: 'enemies',
    title: 'KNOW YOUR ENEMY',
    rows: [
      {
        icon: 'droid',
        name: 'DROID SHIP',
        points: `${SCORE.droid}`,
        text: "CIRCLES THE TRACK. LEAVE IT TOO LONG AND IT'S PROMOTED.",
      },
      {
        icon: 'command',
        name: 'COMMAND SHIP',
        points: `${SCORE.command}`,
        text: 'FIRES AT YOU, LAYS PHOTON MINES, BECOMES A DEATH SHIP.',
      },
      { icon: 'death', name: 'DEATH SHIP', points: `${SCORE.death}`, text: 'HUNTS YOU DOWN AND LAYS VAPOR MINES.' },
      {
        icon: 'tanker',
        name: 'TANKER',
        points: `${SCORE.tanker}`,
        text: 'ARMOURED. LAUNCHES MORE SHIPS UNTIL YOU DESTROY IT.',
      },
      {
        icon: 'photon',
        name: 'MINES',
        points: `${SCORE.photon} / ${SCORE.vapor}`,
        text: "STAY WHERE THEY'RE LAID. SHOOT THEM OR STEER CLEAR.",
      },
      {
        icon: 'bonus',
        name: 'BONUSES',
        points: '',
        text: 'FLY THROUGH FOR AN EXTRA LIFE, POINTS OR A SMART BOMB.',
      },
    ],
  },
];

/** Characters a page types out, in order (what `WelcomeView.chars` counts). */
export function pageLength(page: WelcomePage): number {
  if (page.kind === 'story') return page.title.length + page.lines.reduce((n, l) => n + l.length, 0);
  return page.title.length + page.rows.reduce((n, r) => n + r.name.length + r.points.length + r.text.length, 0);
}

export interface WelcomeView {
  page: number;
  /** Characters typed so far on this page. */
  chars: number;
  /** Fade, 0..1. */
  alpha: number;
}

/**
 * What the welcome shows after `idle` seconds on the title screen with no key
 * pressed: nothing for `WELCOME.delay`, then each page in turn, then a gap
 * with just the title, then round again.
 */
export function welcomeView(idle: number): WelcomeView | null {
  const t0 = idle - WELCOME.delay;
  if (t0 < 0) return null;
  const period = WELCOME.pageSec * WELCOME_PAGES.length + WELCOME.gapSec;
  const t = t0 % period;
  const page = Math.floor(t / WELCOME.pageSec);
  if (page >= WELCOME_PAGES.length) return null;
  const pt = t - page * WELCOME.pageSec;
  const alpha = Math.min(1, pt / WELCOME.fadeSec, (WELCOME.pageSec - pt) / WELCOME.fadeSec);
  return { page, chars: Math.floor(pt * WELCOME.typeRate), alpha };
}
