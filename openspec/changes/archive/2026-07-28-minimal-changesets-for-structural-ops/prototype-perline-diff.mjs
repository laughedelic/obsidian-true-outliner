import { EditorState, EditorSelection, Transaction } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';

function makeView(s){const v={state:s};v.dispatch=(t)=>{v.state=t.state??v.state.update(t).state};return v}
function trim(oldT,newT,base){
  let p=0; while(p<oldT.length&&p<newT.length&&oldT[p]===newT[p])p++;
  let s=0; while(s<oldT.length-p&&s<newT.length-p&&oldT[oldT.length-1-s]===newT[newT.length-1-s])s++;
  if(p===oldT.length&&p===newT.length) return null; // identical
  return {from:base+p,to:base+oldT.length-s,insert:newT.slice(p,newT.length-s)};
}
/** Per-line minimal diff when line counts match; else whole-region trim. */
function minimalChanges(oldDoc,newDoc){
  const o=oldDoc.split('\n'), n=newDoc.split('\n');
  if(o.length!==n.length) { const c=trim(oldDoc,newDoc,0); return c?[c]:[] }
  const out=[]; let base=0;
  for(let i=0;i<o.length;i++){
    const c=trim(o[i],n[i],base);
    if(c) out.push(c);
    base+=o[i].length+1;
  }
  return out;
}
function run(name,{doc,preCursor,newDoc,opCursor}){
  const changes=minimalChanges(doc,newDoc);
  let st=EditorState.create({doc,extensions:[history()],selection:EditorSelection.cursor(preCursor)});
  st=st.update({changes,selection:EditorSelection.cursor(opCursor),userEvent:'input.structure.indent',annotations:Transaction.addToHistory.of(true)}).state;
  if(st.doc.toString()!==newDoc){console.log('DOC MISMATCH!',JSON.stringify(st.doc.toString()));return}
  const v=makeView(st),steps=[];
  for(const [l,fn,want] of [['undo1',undo,preCursor],['redo1',redo,opCursor],['undo2',undo,preCursor],['redo2',redo,opCursor]]){
    fn(v); const c=v.state.selection.main.head;
    steps.push(`${l}:${c}${c===want?'':` (want ${want}) <<WRONG`}`);
  }
  const ok=steps.every(s=>!s.includes('WRONG'));
  console.log(`${ok?'PASS':'FAIL'}  ${name}`);
  console.log(`        changes=${JSON.stringify(changes)}`);
  console.log(`        ${steps.join(' | ')}`);
}
run('merge',{doc:'paragraph A\n\nparagraph B\n',preCursor:13,newDoc:'paragraph Aparagraph B\n',opCursor:11});
run('indent (node + child)',{doc:'- alpha\n- beta\n\t- beta child\n- gamma\n',preCursor:10,newDoc:'- alpha\n\t- beta\n\t\t- beta child\n- gamma\n',opCursor:11});
run('outdent',{doc:'- alpha\n\t- beta\n\t\t- beta child\n',preCursor:11,newDoc:'- alpha\n- beta\n\t- beta child\n',opCursor:10});
