// The paste differential: every generated clipboard is pasted, as a synthetic `paste` event, with
// outline mode off (Obsidian's own paste) and on (the plugin's handler, where it takes the paste),
// at four destinations: an empty note, the empty item of `- A` / `- `, the word `see` selected in
// the paragraph `x see y`, and the text `beta` selected in the item `- beta`. Run inside a driven
// Obsidian:
//
//   npm run drive -- eval - < docs/research/prototypes/paste-differential/probe.js
//   npm run drive -- eval 'JSON.stringify(window.__pasteDiff.progress)'      # until "done"
//   npm run drive -- eval 'JSON.stringify(window.__pasteDiff.rows)' > rows.json
//
// It starts the sweep and returns at once, since one evaluation answers within 20 s. A
// `clipboardInputFilter` that appends ⟦F⟧ is registered for the whole run, so a row shows which
// branch each paste took.
//
// The oracle is Obsidian's paste into an empty note with outline mode off and "Convert pasted HTML
// to Markdown" on, of the clipboard, or of its plain text alone where Obsidian's paste would insert
// the files: the text outline mode takes, by the maintainer's decisions (a list beside a file is
// taken as text; HTML is converted whatever the setting says). The empty item and the two selections
// are pasted at under the four combinations of "Smart lists" and the conversion setting, and the
// empty item is also dropped on, with the defaults.
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
      '<ul><li><b>a</b></li></ul>',
      // A code editor's copy, in the shape VS Code writes: a line per <div>, white space kept.
      '<div style="white-space: pre;"><div><span>- a</span></div><div><span>&nbsp;&nbsp;- b</span></div></div>',
      '<p><a href="https://example.com/x">x</a></p>',
      '<a href="https://example.com/x">https://example.com/x</a>',
      // Google Docs wraps its copy in a <b> with a generated id.
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b"><ul><li dir="ltr"><p dir="ltr"><span>a</span></p></li><ul><li dir="ltr"><p dir="ltr"><span>b</span></p></li></ul></ul></b>',
      '<table><tr><td>a</td><td>b</td></tr></table>',
      '<html><body><!--StartFragment--><ul><li>a<ul><li>b</li></ul></li></ul><!--EndFragment--></body></html>',
      // A URL as text, which converts to the bare URL and so meets the link test over a selection.
      '<span>https://example.com/x</span>',
    ],
    uri: [null, 'same', 'https://example.com/other'],
    files: [0, 1],
  };
  const SETTINGS = [
    { smartIndentList: true, autoConvertHtml: true },
    { smartIndentList: false, autoConvertHtml: true },
    { smartIndentList: true, autoConvertHtml: false },
    { smartIndentList: false, autoConvertHtml: false },
  ];
  const ITEM = '- A\n- ';
  // Each selection destination: its text and the range selected in it.
  const SELECTIONS = { para: ['x see y', 2, 5], item: ['- beta', 2, 6] };
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const png = () => new File([Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0))], 'x.png', { type: 'image/png' });

  const specs = [];
  for (let p = 0; p < AXES.plain.length; p++)
    for (let m = 0; m < AXES.markdown.length; m++)
      for (let h = 0; h < AXES.html.length; h++)
        for (let u = 0; u < AXES.uri.length; u++)
          for (let f = 0; f < AXES.files.length; f++) specs.push({ p, m, h, u, f });
  // A shorter sweep for trying the probe out: `window.__pasteDiffLimit = 20` before running it.
  if (window.__pasteDiffLimit) specs.splice(window.__pasteDiffLimit);
  state.progress.total = specs.length * SETTINGS.length;

  // Where Obsidian's paste chooses no text and inserts the files, outline mode takes a plain text
  // that opens with a list item: beside Obsidian's own copy, a lone image, or no HTML or Markdown
  // and no other URL. The oracle then pastes that plain text alone.
  const LONE_IMAGE = '<img src="https://example.com/x.png">';
  function plainBesideFiles(s) {
    const plain = AXES.plain[s.p];
    const html = AXES.html[s.h];
    const uri = AXES.uri[s.u] === 'same' ? plain : AXES.uri[s.u];
    if (!AXES.files[s.f] || plain === null) return false;
    if (!/^([>\s]*)([*+-] |\d+[.)] )/.test(plain.split(/\r\n?|\n/, 1)[0])) return false;
    if (html !== null && html.includes('<!-- obsidian -->')) return true;
    if (AXES.markdown[s.m] !== null) return false;
    if (html === LONE_IMAGE) return true;
    return html === null && (!uri || uri.toLowerCase() === plain.toLowerCase());
  }

  function transfer(s, oracle = false) {
    const d = new DataTransfer();
    const plain = AXES.plain[s.p];
    if (oracle && plainBesideFiles(s)) {
      d.setData('text/plain', plain);
      return d;
    }
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
    else if (Array.isArray(changes)) for (const c of changes) out.push(String(c.insert ?? ''));
    return out.join('');
  }

  const normalize = (text) => text.replace(/Pasted image \d+( \d+)?\.png/g, 'Pasted image N.png');

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
    if (plugin.activeTabOutlineMode() !== outline) throw new Error('outline mode not ' + outline + ' in ' + path);
    return leaf.view.editor.cm;
  }

  // Twelve panes, so that every editor is laid out and a drop has coordinates.
  function panes() {
    const first = app.workspace.getLeaf(false);
    const a = app.workspace.createLeafBySplit(first, 'vertical');
    const b = app.workspace.createLeafBySplit(first, 'horizontal');
    const c = app.workspace.createLeafBySplit(a, 'horizontal');
    const four = [first, a, b, c];
    const eight = [...four, ...four.map((l) => app.workspace.createLeafBySplit(l, 'vertical'))];
    return [...eight, ...four.map((l) => app.workspace.createLeafBySplit(l, 'horizontal'))];
  }

  function logged(view) {
    const log = [];
    const dispatch = view.dispatch.bind(view);
    view.dispatch = (...args) => {
      log.push({ args, stack: new Error().stack || '' });
      return dispatch(...args);
    };
    return log;
  }

  const reset = (v, text) => v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: { anchor: text.length } });

  const paste = (v, d) => v.contentDOM.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true }));

  function drop(v, d) {
    const c = v.coordsAtPos(v.state.doc.length);
    if (!c) return false;
    v.contentDOM.dispatchEvent(
      new DragEvent('drop', { dataTransfer: d, clientX: c.left + 1, clientY: (c.top + c.bottom) / 2, bubbles: true, cancelable: true }),
    );
    return true;
  }

  // Until every editor's text has changed from where it started, or a file paste had time to save.
  async function settle(views, starts) {
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) {
      if (views.every((v, i) => v.state.doc.toString() !== starts[i])) break;
      await wait(15);
    }
    await wait(60);
  }

  const mine = (log) => log.find((e) => e.stack.includes('plugin:true-outliner') && e.args[0] && e.args[0].changes);

  async function run() {
    const leaves = panes();
    const ed = {
      oracle: await openIn(leaves[0], 'Scratch/pd-oracle.md', false),
      noteOff: await openIn(leaves[1], 'Scratch/pd-note-off.md', false),
      noteOn: await openIn(leaves[2], 'Scratch/pd-note-on.md', true),
      itemOff: await openIn(leaves[3], 'Scratch/pd-item-off.md', false),
      itemOn: await openIn(leaves[4], 'Scratch/pd-item-on.md', true),
      dropOff: await openIn(leaves[5], 'Scratch/pd-drop-off.md', false),
      dropOn: await openIn(leaves[6], 'Scratch/pd-drop-on.md', true),
      paraOff: await openIn(leaves[7], 'Scratch/pd-para-off.md', false),
      paraOn: await openIn(leaves[8], 'Scratch/pd-para-on.md', true),
      selItemOff: await openIn(leaves[9], 'Scratch/pd-sel-item-off.md', false),
      selItemOn: await openIn(leaves[10], 'Scratch/pd-sel-item-on.md', true),
    };
    app.workspace.registerEditorExtension(ed.oracle.constructor.clipboardInputFilter.of((t) => t + '⟦F⟧'));
    app.workspace.updateOptions();
    await wait(300);
    const logs = {
      noteOn: logged(ed.noteOn),
      itemOn: logged(ed.itemOn),
      dropOn: logged(ed.dropOn),
      paraOn: logged(ed.paraOn),
      selItemOn: logged(ed.selItemOn),
    };
    const selected = (v) => (v === ed.paraOff || v === ed.paraOn ? SELECTIONS.para : SELECTIONS.item);
    const resetSelection = (v) => {
      const [text, from, to] = selected(v);
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: { anchor: from, head: to } });
    };
    const selectionViews = [ed.paraOff, ed.paraOn, ed.selItemOff, ed.selItemOn];
    const saved = { smartIndentList: app.vault.getConfig('smartIndentList'), autoConvertHtml: app.vault.getConfig('autoConvertHtml') };
    state.progress.saved = saved;
    state.progress.status = 'running';
    try {
      for (let k = 0; k < SETTINGS.length; k++) {
        const S = SETTINGS[k];
        for (const key of Object.keys(S)) app.vault.setConfig(key, S[key]);
        await wait(200);
        const first = k === 0;
        for (const s of specs) {
          const views = first
            ? [ed.oracle, ed.noteOff, ed.noteOn, ed.itemOff, ed.itemOn, ed.dropOff, ed.dropOn, ...selectionViews]
            : [ed.itemOff, ed.itemOn, ...selectionViews];
          for (const v of views) {
            if (selectionViews.includes(v)) resetSelection(v);
            else reset(v, v === ed.oracle || v === ed.noteOff || v === ed.noteOn ? '' : ITEM);
          }
          for (const l of Object.values(logs)) l.length = 0;
          const starts = views.map((v) => v.state.doc.toString());
          if (first) {
            // The oracle runs with the conversion on, the setting of this first pass.
            paste(ed.oracle, transfer(s, true));
            paste(ed.noteOff, transfer(s));
            paste(ed.noteOn, transfer(s));
          }
          paste(ed.itemOff, transfer(s));
          paste(ed.itemOn, transfer(s));
          for (const v of selectionViews) paste(v, transfer(s));
          let dropped = null;
          if (first) dropped = drop(ed.dropOff, transfer(s)) && drop(ed.dropOn, transfer(s));
          await settle(views, starts);
          const row = { ...s, k, item: { off: normalize(ed.itemOff.state.doc.toString()), on: normalize(ed.itemOn.state.doc.toString()) } };
          const itemMine = mine(logs.itemOn);
          row.item.taken = itemMine ? normalize(inserted(itemMine.args[0])) : null;
          const paraMine = mine(logs.paraOn);
          const selItemMine = mine(logs.selItemOn);
          row.para = {
            off: normalize(ed.paraOff.state.doc.toString()),
            on: normalize(ed.paraOn.state.doc.toString()),
            taken: paraMine ? normalize(inserted(paraMine.args[0])) : null,
          };
          row.selItem = {
            off: normalize(ed.selItemOff.state.doc.toString()),
            on: normalize(ed.selItemOn.state.doc.toString()),
            taken: selItemMine ? normalize(inserted(selItemMine.args[0])) : null,
          };
          if (first) {
            row.oracle = normalize(ed.oracle.state.doc.toString());
            const noteMine = mine(logs.noteOn);
            row.note = {
              off: normalize(ed.noteOff.state.doc.toString()),
              on: normalize(ed.noteOn.state.doc.toString()),
              taken: noteMine ? normalize(inserted(noteMine.args[0])) : null,
              scroll: noteMine ? Boolean(noteMine.args[1] && noteMine.args[1].scrollIntoView) : null,
            };
            row.drop = dropped
              ? { off: normalize(ed.dropOff.state.doc.toString()), on: normalize(ed.dropOn.state.doc.toString()), taken: Boolean(mine(logs.dropOn)) }
              : null;
          }
          state.rows.push(row);
          state.progress.done++;
        }
      }
    } finally {
      for (const key of Object.keys(saved)) app.vault.setConfig(key, saved[key]);
    }
    state.axes = AXES;
    state.settings = SETTINGS;
    state.progress.status = 'done';
  }

  run().catch((e) => {
    state.progress.status = 'error: ' + (e && e.stack ? e.stack : String(e));
  });
  return 'started ' + specs.length * SETTINGS.length;
})();
