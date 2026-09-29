/**
 * Key chords for `scripts/drive.ts`, as the fields `Input.dispatchKeyEvent` takes.
 *
 * A chord is modifiers and a key joined by `+` (`shift+Tab`, `mod+a`, `ctrl+shift+ArrowLeft`);
 * `*N` after it repeats it (`ArrowDown*3`). `mod` is ⌘ on macOS and Ctrl elsewhere, decided
 * where the app runs, which is where the CLI runs.
 *
 * `text` is set only for a key that inserts something, which is also what decides the event
 * type: a key with text goes in as `keyDown`, one without as `rawKeyDown`
 * (docs/research/driving-a-running-obsidian, "Keys").
 */

export interface KeyEvent {
  key: string;
  code: string;
  windowsVirtualKeyCode: number;
  modifiers: number;
  text?: string;
}

const ALT = 1;
const CTRL = 2;
const META = 4;
const SHIFT = 8;

const MODIFIERS: Record<string, number> = {
  alt: ALT,
  option: ALT,
  ctrl: CTRL,
  control: CTRL,
  meta: META,
  cmd: META,
  command: META,
  shift: SHIFT,
};

interface Named {
  key: string;
  code: string;
  keyCode: number;
  text?: string;
}

const NAMED: Record<string, Named> = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
};

const ALIASES: Record<string, string> = {
  return: 'enter',
  esc: 'escape',
  bksp: 'backspace',
  del: 'delete',
  left: 'arrowleft',
  up: 'arrowup',
  right: 'arrowright',
  down: 'arrowdown',
  pgup: 'pageup',
  pgdn: 'pagedown',
};

/** A key on the US layout: what it types plain and shifted, and its code and key code. */
interface Printable {
  plain: string;
  shifted: string;
  code: string;
  keyCode: number;
}

const PRINTABLE: Printable[] = [
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => ({
    plain: c,
    shifted: c.toUpperCase(),
    code: `Key${c.toUpperCase()}`,
    keyCode: c.toUpperCase().charCodeAt(0),
  })),
  // The shifted characters of the digit row, in the order 1 to 9 then 0.
  ...'1234567890'.split('').map((c, i) => ({
    plain: c,
    shifted: '!@#$%^&*()'.charAt(i),
    code: `Digit${c}`,
    keyCode: c.charCodeAt(0),
  })),
  ...(
    [
      ['-', '_', 'Minus', 189],
      ['=', '+', 'Equal', 187],
      ['[', '{', 'BracketLeft', 219],
      [']', '}', 'BracketRight', 221],
      ['\\', '|', 'Backslash', 220],
      [';', ':', 'Semicolon', 186],
      ["'", '"', 'Quote', 222],
      [',', '<', 'Comma', 188],
      ['.', '>', 'Period', 190],
      ['/', '?', 'Slash', 191],
      ['`', '~', 'Backquote', 192],
    ] as const
  ).map(([plain, shifted, code, keyCode]) => ({ plain, shifted, code, keyCode })),
];

/** What `plus` names, since `+` separates the parts of a chord. */
const WORD_KEYS: Record<string, string> = { plus: '+' };

/** One chord to the event `Input.dispatchKeyEvent` takes. Throws on a key it does not know. */
export function parseChord(chord: string, platform: string = process.platform): KeyEvent {
  const parts = chord.split('+');
  // `ctrl++` is Ctrl and the plus key: the empty part after the last separator is the key.
  if (chord.endsWith('++')) parts.splice(-2, 2, '+');
  const keyPart = parts.pop();
  if (!keyPart) throw new Error(`empty chord ${JSON.stringify(chord)}`);

  let modifiers = 0;
  for (const part of parts) {
    const name = part.toLowerCase();
    const bit = name === 'mod' ? (platform === 'darwin' ? META : CTRL) : MODIFIERS[name];
    if (bit === undefined) throw new Error(`unknown modifier ${JSON.stringify(part)} in ${JSON.stringify(chord)}`);
    modifiers |= bit;
  }

  const lower = keyPart.toLowerCase();
  const named = NAMED[ALIASES[lower] ?? lower];
  if (named) {
    const event: KeyEvent = { key: named.key, code: named.code, windowsVirtualKeyCode: named.keyCode, modifiers };
    if (named.text !== undefined && !(modifiers & (CTRL | ALT | META))) event.text = named.text;
    return event;
  }

  const char = WORD_KEYS[lower] ?? keyPart;
  const entry = PRINTABLE.find((p) => p.plain === char || p.shifted === char);
  if (!entry) throw new Error(`unknown key ${JSON.stringify(keyPart)} in chord ${JSON.stringify(chord)}`);
  // `A` and `!` are typed with shift held, whether or not the chord says so.
  const shift = modifiers & SHIFT || (char === entry.shifted && char !== entry.plain);
  if (shift) modifiers |= SHIFT;
  const key = shift ? entry.shifted : entry.plain;
  const event: KeyEvent = { key, code: entry.code, windowsVirtualKeyCode: entry.keyCode, modifiers };
  // Ctrl, Alt and ⌘ turn a key into a command, so it inserts nothing.
  if (!(modifiers & (CTRL | ALT | META))) event.text = key;
  return event;
}

/** `Tab*3` becomes three chords; arguments without a repeat pass through. */
export function expandKeys(args: readonly string[]): string[] {
  return args.flatMap((arg) => {
    const repeat = /^(.+)\*(\d+)$/.exec(arg);
    if (!repeat) return [arg];
    const [, chord = '', count = '1'] = repeat;
    return Array.from({ length: Number(count) }, () => chord);
  });
}

/** The `Input.dispatchKeyEvent` parameter lists for one chord: the press, then the release. */
export function keyEvents(event: KeyEvent): Record<string, unknown>[] {
  const { text, ...release } = event;
  return [
    { type: text === undefined ? 'rawKeyDown' : 'keyDown', ...event },
    { type: 'keyUp', ...release },
  ];
}
