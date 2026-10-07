// The paste differential: every generated clipboard is pasted, as a synthetic `paste` event, into an
// empty note with outline mode off (Obsidian's own paste, the oracle) and into an empty note with
// outline mode on (the plugin's handler, where it takes the paste). Run inside a driven Obsidian:
//
//   npm run drive -- eval - < docs/research/prototypes/paste-differential/probe.js
//   npm run drive -- eval 'JSON.stringify(window.__pasteDiff.progress)'      # until "done"
//   npm run drive -- eval 'JSON.stringify(window.__pasteDiff.rows)' > rows.json
//
// It starts the sweep and returns at once, since one evaluation answers within 20 s. A
// `clipboardInputFilter` that appends ⟦F⟧ is registered for the whole run, so a row shows which
// branch each paste took.
(() => {
  const state = (window.__pasteDiff = { progress: { done: 0, total: 0, status: 'starting' }, rows: [] });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const LIST = '<ul><li>a<ul><li>b</li></ul></li></ul>';
  const AXES = {
    plain: [null, '- a\n  - b', '  - a\n  - b', 'a\n\nb', '- a', 'https://example.com/page', '- a\r\n  - b'],
    markdown: [null, '- m\n  - n'],
    html: [
      null,
      LIST,
      '<!-- obsidian -->' + LIST,
      LIST + '<p><img src="https://example.com/x.png"></p>',
      LIST + '<p><img src="data:image/png;base64,' + 'A'.repeat(1200) + '"></p>',
      '<ul><li><a href="javascript:alert(1)">a</a><ul><li>b</li></ul></li></ul>',
      '<img src="https://example.com/x.png">',
      '<p>a</p><p>b</p>',
    ],
    uri: [null, 'same', 'https://example.com/other'],
    files: [0, 1],
  };
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const png = () => new File([Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0))], 'x.png', { type: 'image/png' });

  const specs = [];
  for (let p = 0; p < AXES.plain.length; p++)
    for (let m = 0; m < AXES.markdown.length; m++)
      for (let h = 0; h < AXES.html.length; h++)
        for (let u = 0; u < AXES.uri.length; u++)
          for (let f = 0; f < AXES.files.length; f++) specs.push({ p, m, h, u, f });
  state.progress.total = specs.length;

  function transfer(s) {
    const d = new DataTransfer();
    const plain = AXES.plain[s.p];
    if (plain !== null) d.setData('text/plain', plain);
    if (AXES.markdown[s.m] !== null) d.setData('text/markdown', AXES.markdown[s.m]);
    if (AXES.html[s.h] !== null) d.setData('text/html', AXES.html[s.h]);
    const uri = AXES.uri[s.u] === 'same' ? plain : AXES.uri[s.u];
    if (uri) d.setData('text/uri-list', uri);
    if (AXES.files[s.f]) d.items.add(png());
    return d;
  }

  function inserted(spec) {
    const out = [];
    const changes = spec && spec.changes;
    if (changes && typeof changes.iterChanges === 'function') changes.iterChanges((_a, _b, _c, _d, text) => out.push(text.toString()));
    return out.join('');
  }

  const normalize = (text) => text.replace(/Pasted image \d+/g, 'Pasted image N');

  async function openIn(leaf, path, outline) {
    const plugin = app.plugins.plugins['true-outliner'];
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing) await app.vault.delete(existing);
    const folder = path.split('/').slice(0, -1).join('/');
    if (folder && !app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
    const file = await app.vault.create(path, '');
    await leaf.openFile(file);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    await wait(300);
    if (plugin.activeTabOutlineMode() !== outline) {
      app.commands.executeCommandById('true-outliner:toggle-outline-mode');
      await wait(300);
    }
    return plugin.activeTabOutlineMode();
  }

  async function run() {
    const off = app.workspace.getLeaf(false);
    const modeOff = await openIn(off, 'Scratch/paste-diff-off.md', false);
    const on = app.workspace.getLeaf('split');
    const modeOn = await openIn(on, 'Scratch/paste-diff-on.md', true);
    state.progress.modes = { off: modeOff, on: modeOn };
    const A = off.view.editor.cm;
    const B = on.view.editor.cm;
    app.workspace.registerEditorExtension(A.constructor.clipboardInputFilter.of((t) => t + '⟦F⟧'));
    app.workspace.updateOptions();
    await wait(300);
    const log = [];
    const dispatch = B.dispatch.bind(B);
    B.dispatch = (...args) => {
      log.push({ args, stack: new Error().stack || '' });
      return dispatch(...args);
    };
    const reset = (v) => v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '' }, selection: { anchor: 0 } });

    state.progress.status = 'running';
    for (const s of specs) {
      reset(A);
      reset(B);
      log.length = 0;
      A.contentDOM.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer(s), bubbles: true, cancelable: true }));
      B.contentDOM.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer(s), bubbles: true, cancelable: true }));
      await wait(AXES.files[s.f] ? 900 : 120);
      const mine = log.find((e) => e.stack.includes('plugin:true-outliner') && e.args[0] && e.args[0].changes);
      state.rows.push({
        ...s,
        oracle: normalize(A.state.doc.toString()),
        taken: Boolean(mine),
        takenText: mine ? normalize(inserted(mine.args[0])) : null,
        scroll: mine ? Boolean(mine.args[1] && mine.args[1].scrollIntoView) : null,
      });
      state.progress.done++;
    }
    state.axes = AXES;
    state.progress.status = 'done';
  }

  run().catch((e) => {
    state.progress.status = 'error: ' + (e && e.stack ? e.stack : String(e));
  });
  return 'started ' + specs.length;
})();
