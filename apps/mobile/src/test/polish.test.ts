/**
 * The design constraints, enforced rather than remembered.
 *
 * These are the rules that decay first. Nobody deliberately adds a third font
 * weight or a second gradient — someone copies a card that has one, a reviewer
 * reads the logic rather than the class list, and six weeks later the app
 * looks like four people built it. A test is cheaper than that vigilance.
 *
 * They read the source rather than a rendered DOM on purpose: the property is
 * "this class never appears", which a render test can only sample.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const SRC = resolve(__dirname, '..');

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === 'test' ? [] : sourceFiles(path);
    return ['.ts', '.tsx', '.css'].includes(extname(path)) ? [path] : [];
  });
}

const FILES = sourceFiles();
const ALL = FILES.map((path) => ({ path: path.slice(SRC.length + 1), text: readFileSync(path, 'utf8') }));

describe('two font weights', () => {
  it('uses only 400 (default) and 500 (font-medium)', () => {
    // font-bold and friends are the ones that creep in from pasted markup.
    const banned = /\bfont-(thin|extralight|light|normal|semibold|bold|extrabold|black)\b/;
    const offenders = ALL.filter((file) => banned.test(file.text)).map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('does not set a numeric font-weight in CSS either', () => {
    const offenders = ALL.filter(
      (file) => file.path.endsWith('.css') && /font-weight:\s*[6-9]00/.test(file.text),
    ).map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});

describe('one gradient', () => {
  it('is the citizen hero and nothing else', () => {
    const users = ALL.filter(
      (file) => /bg-gradient|linear-gradient/.test(file.text) && !file.path.endsWith('types.ts'),
    ).map((file) => file.path);
    expect(users).toEqual(['components/blocks/BlockRenderer.tsx']);
  });
});

describe('touch targets', () => {
  it('gives the shared card and action components a 44px floor', () => {
    // The renderer is where most of the app's buttons come from, so its
    // targets are the ones that matter most.
    const renderer = ALL.find((file) => file.path === 'components/blocks/BlockRenderer.tsx');
    expect(renderer?.text).toContain('ut-touch');
  });

  it('defines ut-touch as 44px in both dimensions', () => {
    const css = ALL.find((file) => file.path === 'styles/index.css')?.text ?? '';
    expect(css).toMatch(/\.ut-touch\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.ut-touch\s*\{[^}]*min-width:\s*44px/);
  });
});

describe('motion', () => {
  it('is eased, never bouncy', () => {
    // framer-motion's spring defaults overshoot. Every transition in this app
    // uses the design's one easing curve; a `type: 'spring'` anywhere means
    // something bounces, which reads as a toy rather than a tool.
    const springs = ALL.filter((file) => /type:\s*['"]spring['"]/.test(file.text)).map(
      (file) => file.path,
    );
    expect(springs).toEqual([]);
  });

  it('respects prefers-reduced-motion', () => {
    const css = ALL.find((file) => file.path === 'styles/index.css')?.text ?? '';
    expect(css).toContain('prefers-reduced-motion');
  });
});

describe('honesty', () => {
  it('never claims the prototype login is secure', () => {
    // The one class of copy that would be a lie rather than a rough edge.
    //
    // The lookbehind matters: the app says "not a verified identity" in the
    // session sheet, which is the honest disclaimer and the opposite of the
    // claim being banned here. A test that cannot tell those apart would push
    // someone to delete the disclaimer to get it green.
    const banned =
      /(?<!not an? )\b(securely signed in|bank[- ]grade|end-to-end encrypted|verified identity)\b/i;
    const offenders = ALL.filter((file) => banned.test(file.text)).map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('says plainly, in the login screen itself, that there is no account system', () => {
    const login = ALL.find((file) => file.path === 'screens/LoginScreen.tsx')?.text ?? '';
    expect(login).toMatch(/no account system/i);
  });
});
