// The regions of a source file a hunk can be credited to: top-level
// declarations and class members for TypeScript, with the statements of a few
// long methods listed one by one, and top-level rules for CSS. A line belongs
// to the smallest region containing it; a line between regions (a blank line
// or a stray comment) belongs to the region after it.

function firstLine(src, sf, pos) {
  while (pos < src.length && /\s/.test(src[pos])) pos++;
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

// `this.addCommand({ id: 'x', ... })` → `addCommand:x`;
// `this.registerEditorExtension(fooExtension(this))` → `registerEditorExtension:fooExtension`;
// `this.registerEvent(this.app.workspace.on('editor-menu', ...))` → `registerEvent:this.app.workspace.on(editor-menu)`;
// a `new Setting(...).setName(X)` chain → `Setting:X`.
function statementLabel(stmt, sf, ts) {
  let e = ts.isExpressionStatement(stmt) ? stmt.expression : stmt;
  if (ts.isAwaitExpression(e)) e = e.expression;
  if (ts.isCallExpression(e)) {
    const setName = stmt.getText(sf).match(/\.setName\(\s*['"`]?([^'"`)]+)/);
    if (setName) return `Setting:${setName[1]}`;
    const callee = e.expression.getText(sf).replace(/^this\./, '').split('\n')[0].slice(0, 60);
    const arg = e.arguments[0];
    let detail = '';
    if (arg && ts.isStringLiteralLike(arg)) detail = arg.text;
    else if (arg && ts.isCallExpression(arg)) {
      detail = arg.expression.getText(sf);
      const inner = arg.arguments[0];
      if (inner && ts.isStringLiteralLike(inner)) detail += `(${inner.text})`;
    } else if (arg && ts.isObjectLiteralExpression(arg)) {
      const id = arg.properties.find((p) => p.name?.getText(sf) === 'id');
      if (id && ts.isPropertyAssignment(id)) detail = id.initializer.getText(sf).replace(/['"]/g, '');
    } else if (arg) detail = arg.getText(sf).slice(0, 40);
    return detail ? `${callee}:${detail}` : callee;
  }
  if (ts.isVariableStatement(stmt)) return 'const:' + stmt.declarationList.declarations.map((d) => d.name.getText(sf)).join(',');
  if (ts.isIfStatement(stmt)) return 'if:' + stmt.expression.getText(sf).slice(0, 40);
  return ts.SyntaxKind[stmt.kind];
}

function declarationName(stmt, sf, ts) {
  if (ts.isImportDeclaration(stmt)) return '(imports)';
  if (ts.isExportDeclaration(stmt)) return '(exports)';
  if (stmt.name) return stmt.name.getText(sf);
  if (ts.isVariableStatement(stmt)) return stmt.declarationList.declarations.map((d) => d.name.getText(sf)).join(',');
  return `(${ts.SyntaxKind[stmt.kind]})`;
}

export function regionsTS(src, ts, splitMethods = new Set()) {
  const sf = ts.createSourceFile('file.ts', src, ts.ScriptTarget.Latest, true);
  const endLine = (node) => sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  const region = (name, node) => ({ name, start: firstLine(src, sf, node.getFullStart()), end: endLine(node) });
  const out = [];
  for (const stmt of sf.statements) {
    const name = declarationName(stmt, sf, ts);
    if (!ts.isClassDeclaration(stmt)) {
      out.push(region(name, stmt));
      continue;
    }
    // The class's own lines up to its first member; blank lines between members
    // fall through to the member after them.
    const head = region(`${name}.(class)`, stmt);
    if (stmt.members.length) head.end = firstLine(src, sf, stmt.members[0].getFullStart()) - 1;
    out.push(head);
    for (const member of stmt.members) {
      const own = member.name ? member.name.getText(sf) : ts.SyntaxKind[member.kind];
      if (splitMethods.has(own) && member.body) {
        out.push({
          name: `${name}.${own}.(signature)`,
          start: firstLine(src, sf, member.getFullStart()),
          end: sf.getLineAndCharacterOfPosition(member.body.getStart(sf)).line + 1,
        });
        for (const s of member.body.statements) out.push(region(`${name}.${own}/${statementLabel(s, sf, ts)}`, s));
      } else out.push(region(`${name}.${own}`, member));
    }
  }
  return out;
}

// A top-level rule is named by the first `.to-*` class in its selector, or by
// the selector's first token when it has none.
export function regionsCSS(src) {
  const out = [];
  const lines = src.split('\n');
  let depth = 0;
  let selector = '';
  let inComment = false;
  let pending = null;
  let start = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const two = line.slice(j, j + 2);
      if (inComment) {
        if (two === '*/') { inComment = false; j++; }
        continue;
      }
      if (two === '/*') {
        inComment = true;
        if (depth === 0 && pending === null) pending = i + 1;
        j++;
        continue;
      }
      const ch = line[j];
      if (depth === 0 && !/\s/.test(ch) && pending === null) pending = i + 1;
      if (depth === 0 && ch !== '{' && ch !== '}') selector += ch;
      if (ch === '{') {
        if (depth === 0) start = pending ?? i + 1;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const sel = selector.trim();
          const name = sel.match(/\.to-[a-z0-9]+(?:-[a-z0-9]+)?/)?.[0] ?? sel.split(/[\s,]/)[0].slice(0, 30);
          out.push({ name, start, end: i + 1 });
          selector = '';
          pending = null;
          start = null;
        }
      }
    }
    if (depth === 0) selector += ' ';
  }
  return out;
}

export function regionAt(regions, line) {
  if (!regions) return '(absent)';
  const containing = regions
    .filter((r) => line >= r.start && line <= r.end)
    .sort((a, b) => a.end - a.start - (b.end - b.start));
  if (containing.length) return containing[0].name;
  return regions.find((r) => r.start > line)?.name ?? '(eof)';
}
