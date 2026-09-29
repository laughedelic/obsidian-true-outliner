import { describe, expect, it } from 'vitest';
import { expandKeys, keyEvents, parseChord } from '../scripts/drive-keys.ts';

// The rows of docs/research/driving-a-running-obsidian, "Keys": what the probe sent, and what
// reached the plugin.
describe('parseChord', () => {
  it.each([
    ['ArrowDown', { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, modifiers: 0 }],
    ['ArrowUp', { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38, modifiers: 0 }],
    ['Tab', { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 0 }],
    ['shift+Tab', { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 }],
    ['Enter', { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 0, text: '\r' }],
    ['x', { key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88, modifiers: 0, text: 'x' }],
    ['Backspace', { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, modifiers: 0 }],
    ['shift+ArrowLeft', { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, modifiers: 8 }],
    ['ctrl+a', { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 }],
  ])('%s', (chord, expected) => {
    expect(parseChord(chord, 'linux')).toEqual(expected);
  });

  it('types a shifted character with shift held', () => {
    expect(parseChord('A', 'linux')).toEqual({
      key: 'A',
      code: 'KeyA',
      windowsVirtualKeyCode: 65,
      modifiers: 8,
      text: 'A',
    });
    expect(parseChord('!', 'linux')).toMatchObject({ key: '!', code: 'Digit1', modifiers: 8, text: '!' });
    expect(parseChord('shift+1', 'linux')).toMatchObject({ key: '!', code: 'Digit1', modifiers: 8, text: '!' });
    expect(parseChord('shift+a', 'linux')).toMatchObject({ key: 'A', text: 'A' });
    expect(parseChord('-', 'linux')).toMatchObject({ code: 'Minus', windowsVirtualKeyCode: 189, modifiers: 0 });
    expect(parseChord('_', 'linux')).toMatchObject({ key: '_', code: 'Minus', modifiers: 8, text: '_' });
  });

  it('gives a command chord no text', () => {
    expect(parseChord('mod+shift+a', 'linux')).toEqual({
      key: 'A',
      code: 'KeyA',
      windowsVirtualKeyCode: 65,
      modifiers: 10,
    });
    expect(parseChord('alt+x', 'linux').text).toBeUndefined();
    expect(parseChord('ctrl+Enter', 'linux').text).toBeUndefined();
  });

  it('reads mod as command on macOS and control elsewhere', () => {
    expect(parseChord('mod+a', 'darwin').modifiers).toBe(4);
    expect(parseChord('mod+a', 'linux').modifiers).toBe(2);
    expect(parseChord('mod+a', 'win32').modifiers).toBe(2);
  });

  it('accepts the names and aliases a person would type', () => {
    expect(parseChord('esc', 'linux')).toMatchObject({ key: 'Escape', windowsVirtualKeyCode: 27 });
    expect(parseChord('Space', 'linux')).toMatchObject({ key: ' ', text: ' ' });
    expect(parseChord('down', 'linux').key).toBe('ArrowDown');
    expect(parseChord('cmd+ctrl+alt+shift+x', 'linux').modifiers).toBe(15);
    expect(parseChord('ctrl++', 'linux')).toMatchObject({ key: '+', code: 'Equal', modifiers: 10 });
  });

  it('refuses a key or a modifier it does not know, naming the chord', () => {
    expect(() => parseChord('ctrl+Nonsense', 'linux')).toThrow(/unknown key "Nonsense" in chord "ctrl\+Nonsense"/);
    expect(() => parseChord('hyper+a', 'linux')).toThrow(/unknown modifier "hyper"/);
    expect(() => parseChord('', 'linux')).toThrow(/empty chord/);
  });
});

describe('expandKeys', () => {
  it('repeats a chord and leaves the others alone', () => {
    expect(expandKeys(['Tab*3', 'shift+Tab', 'x*1'])).toEqual(['Tab', 'Tab', 'Tab', 'shift+Tab', 'x']);
  });
});

describe('keyEvents', () => {
  it('sends a key with text as keyDown and one without as rawKeyDown, each followed by keyUp', () => {
    const enter = keyEvents(parseChord('Enter', 'linux'));
    expect(enter.map((e) => e.type)).toEqual(['keyDown', 'keyUp']);
    expect(enter[0]).toHaveProperty('text', '\r');
    expect(enter[1]).not.toHaveProperty('text');
    expect(keyEvents(parseChord('Tab', 'linux')).map((e) => e.type)).toEqual(['rawKeyDown', 'keyUp']);
  });
});
