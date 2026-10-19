const $=id=>document.getElementById(id);
let worker,serial=0,pending=new Map(),snapshot=null,tables=[],busy=false,ready=false,allResults=[],selectedResult=0,revision=0,validationTimer,markers=[],history=[];
const initialQuery='-- Click Run query to view 10 customers.\n-- Change the LIMIT to return more or fewer rows.\n\nSELECT *\nFROM customers\nLIMIT 10;';
let editor;
let practiceFeedbackTimer;
function showPracticeLoaded(button){
  const panel=document.querySelector('.editor-panel'),hint=$('editorHint');
  clearTimeout(practiceFeedbackTimer);
  panel.classList.remove('query-loaded');
  // Restart the cue even when the same example is clicked twice.
  void panel.offsetWidth;
  panel.classList.add('query-loaded');
  hint.classList.add('query-loaded-hint');
  hint.textContent='✓ '+button.querySelector('strong').textContent+' loaded. Click Run query.';
  panel.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  practiceFeedbackTimer=setTimeout(()=>{
    panel.classList.remove('query-loaded');hint.classList.remove('query-loaded-hint');
    hint.textContent='Select SQL to run only that selection.';
  },3500);
}
function status(message,error=false){$('status').textContent=message;$('status').className=error?'error':'';}
function friendly(message){
  if(/no such table:/i.test(message))return 'We couldn’t find that table. Check its spelling in Your datasets, or upload it first. '+message;
  if(/no such column:/i.test(message))return 'That column wasn’t found. Expand your table on the left and check the column name. '+message;
  if(/syntax error|incomplete input|unrecognized token/i.test(message))return 'Your query needs a small adjustment. Check commas, quotes, parentheses, and keyword spelling. '+message;
  if(/ambiguous column/i.test(message))return 'More than one table has this column. Add the table name, like customers.id. '+message;
  if(/UNIQUE constraint/i.test(message))return 'That value already exists in a column that needs unique values. '+message;
  if(/already exists/i.test(message))return 'A table with that name already exists. Choose a different table name. '+message;
  return message;
}
function request(type,payload={},timeout=8000){
  return new Promise((resolve,reject)=>{
    const id=++serial;
    const timer=setTimeout(()=>{restart('This task took too long and was stopped. Your last completed database has been restored. Try a smaller dataset or add a LIMIT to your query.');},timeout);
    pending.set(id,{resolve,reject,timer});worker.postMessage({id,type,payload});
  });
}
function spawn(){
  worker=new Worker('db-worker.js');
  worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;clearTimeout(p.timer);pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);};
  worker.onerror=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Could not load the SQL engine. Check your connection and reload the page.'));}pending.clear();ready=false;setBusy(false);status('Could not load SQLite. Check your internet connection and reload.',true);};
}
async function restart(message){
  ready=false;worker?.terminate();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(message));}pending.clear();
  spawn();setBusy(true);try{const result=await request('init',{bytes:snapshot},30000);accept(result);ready=true;status(message,true);}catch(e){status(e.message,true);}finally{setBusy(false);}
}
function setBusy(value){busy=value;$('runBtn').disabled=value||!ready;$('uploadBtn').disabled=value||!ready;$('sampleBtn').disabled=value||!ready;$('saveDb').disabled=value||!ready;$('openDb').disabled=value||!ready;$('stopBtn').hidden=!value;}
function accept(result){if(result.bytes)snapshot=result.bytes;if(result.schema){tables=result.schema;renderSchema();}scheduleValidation();}
// Keep generated classroom SQL readable; escape only special names and keywords.
// SQLite keyword reference: https://sqlite.org/lang_keywords.html
const sqlKeywords=new Set(('ABORT ACTION ADD AFTER ALL ALTER ALWAYS ANALYZE AND AS ASC ATTACH AUTOINCREMENT BEFORE BEGIN BETWEEN BY CASCADE CASE CAST CHECK COLLATE COLUMN COMMIT CONFLICT CONSTRAINT CREATE CROSS CURRENT CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP DATABASE DEFAULT DEFERRABLE DEFERRED DELETE DESC DETACH DISTINCT DO DROP EACH ELSE END ESCAPE EXCEPT EXCLUDE EXCLUSIVE EXISTS EXPLAIN FAIL FILTER FIRST FOLLOWING FOR FOREIGN FROM FULL GENERATED GLOB GROUP GROUPS HAVING IF IGNORE IMMEDIATE IN INDEX INDEXED INITIALLY INNER INSERT INSTEAD INTERSECT INTO IS ISNULL JOIN KEY LAST LEFT LIKE LIMIT MATCH MATERIALIZED NATURAL NO NOT NOTHING NOTNULL NULL NULLS OF OFFSET ON OR ORDER OTHERS OUTER OVER PARTITION PLAN PRAGMA PRECEDING PRIMARY QUERY RAISE RANGE RECURSIVE REFERENCES REGEXP REINDEX RELEASE RENAME REPLACE RESTRICT RETURNING RIGHT ROLLBACK ROW ROWS SAVEPOINT SELECT SET TABLE TEMP TEMPORARY THEN TIES TO TRANSACTION TRIGGER UNBOUNDED UNION UNIQUE UPDATE USING VACUUM VALUES VIEW VIRTUAL WHEN WHERE WINDOW WITH WITHOUT').split(' '));
const quote=s=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)&&!sqlKeywords.has(s.toUpperCase())?s:'"'+s.replaceAll('"','""')+'"';
function renderSchema(){
  $('schema').replaceChildren();$('tableCount').textContent=tables.length;
  for(const table of tables){
    const box=document.createElement('div');box.className='table-item';const btn=document.createElement('button');btn.className='table-name';btn.textContent='▦  '+table.name;btn.title='Preview '+table.name;btn.onclick=()=>{editor.setValue('SELECT *\nFROM '+quote(table.name)+'\nLIMIT 100;',-1);runQuery();};box.append(btn);
    for(const col of table.columns){const row=document.createElement('div');row.className='column';const insert=document.createElement('button');insert.textContent=col.name;insert.title='Insert column name';insert.onclick=()=>{editor.insert(quote(col.name));editor.focus();};const type=document.createElement('span');type.textContent=col.type||'ANY';row.append(insert,type);box.append(row);}
    $('schema').append(box);
  }
}
function clearMarkers(){if(!editor)return;for(const id of markers)editor.session.removeMarker(id);markers=[];editor.session.clearAnnotations();}
function scheduleValidation(){clearTimeout(validationTimer);const version=++revision;clearMarkers();if(!ready||busy)return;validationTimer=setTimeout(async()=>{
  const query=editor.getValue();if(!query.trim())return;
  try{const result=await request('validate',{query});if(version!==revision||busy)return;if(result){
    const token=result.message.match(/near "([^"]+)"/i)?.[1]||result.message.match(/no such (?:column|table): (.+)/i)?.[1];
    let offset=token?query.toLowerCase().indexOf(token.toLowerCase()):-1;
    // SQLite does not provide exact positions; the first matching token is an approximation.
    if(offset<0)offset=Math.max(0,query.trimEnd().length-1);const pos=editor.session.doc.indexToPosition(offset),Range=ace.require('ace/range').Range;
    markers.push(editor.session.addMarker(new Range(pos.row,pos.column,pos.row,pos.column+(token?.length||1)),'sql-error','text'));
    editor.session.setAnnotations([{row:pos.row,column:pos.column,text:friendly(result.message)+' (Approximate location; checks statements against current tables.)',type:'error'}]);
  }}catch{/* The run action reports engine errors. */}
},650);}
async function runQuery(){
  if(busy||!ready)return;const selection=editor.getSelectedText(),query=selection.trim()?selection:editor.getValue();if(!query.trim()){status('Write SQL or choose a practice query.');return;}
  clearTimeout(validationTimer);++revision;clearMarkers();setBusy(true);status(selection.trim()?'Running your highlighted SQL…':'Running your query…');
  try{
    const result=await request('run',{query});accept(result);allResults=result.results;selectedResult=0;renderResults();renderTabs();
    status(allResults.length?`Query complete · ${Math.round(result.elapsed)} ms. ${allResults.some(r=>r.count>500)?'Showing the first 500 rows of each result; add LIMIT to narrow your query.':''}`:'Query complete. No result rows were returned. Your database schema has been refreshed.');
    history=[query,...history.filter(q=>q!==query)].slice(0,6);renderHistory();
  }catch(e){status(friendly(e.message)+' No changes from this run were kept.',true);if(allResults.length)$('resultMeta').textContent+=' · previous result';}finally{setBusy(false);scheduleValidation();}
}
function renderResults(){
  $('results').replaceChildren();const result=allResults[selectedResult];$('exportBtn').disabled=!result;$('resultMeta').textContent=result?`${result.count.toLocaleString()} row${result.count===1?'':'s'}`:'';
  if(!result){const p=document.createElement('p');p.className='empty';p.textContent='Statement completed. Run a SELECT query to view data.';$('results').append(p);return;}
  const table=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr');
  for(const col of ['#',...result.columns]){const th=document.createElement('th');th.textContent=col;tr.append(th);}head.append(tr);table.append(head);const body=document.createElement('tbody');
  result.values.forEach((row,i)=>{const tr=document.createElement('tr');for(const [j,value] of [i+1,...row].entries()){const td=document.createElement('td');td.textContent=value===null?'NULL':value instanceof Uint8Array?'[binary data]':String(value);if(j===0)td.className='row-num';else if(value===null)td.className='null';td.title=td.textContent;tr.append(td);}body.append(tr);});table.append(body);$('results').append(table);
}
function renderTabs(){$('resultTabs').replaceChildren();if(allResults.length<2)return;allResults.forEach((r,i)=>{const b=document.createElement('button');b.textContent='Result '+(i+1);b.className=i===selectedResult?'selected':'';b.onclick=()=>{selectedResult=i;renderResults();renderTabs();};$('resultTabs').append(b);});}
function renderHistory(){$('history').replaceChildren();for(const query of history){const b=document.createElement('button');b.textContent=query.replace(/\s+/g,' ');b.title=query;b.onclick=()=>editor.setValue(query,-1);$('history').append(b);}}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importCSV(file){
  if(!file||busy||!ready)return;if(file.size>10*1024*1024){status('Choose a CSV smaller than 10 MB.',true);return;}
  setBusy(true);status('Reading your CSV…');
  try{
    const text=await file.text();const parsed=Papa.parse(text,{skipEmptyLines:'greedy'});if(parsed.errors.length)throw Error('Your CSV has a formatting issue: '+parsed.errors[0].message);
    if(parsed.data.length<2)throw Error('Include a header row and at least one data row.');
    const columns=parsed.data[0].map((c,i)=>c.trim()||'column_'+(i+1));
    if(new Set(columns.map(c=>c.toLowerCase())).size!==columns.length)throw Error('Each column needs a unique name. Check for duplicate CSV headers.');
    if(columns.length>200)throw Error('Please use a dataset with 200 columns or fewer.');
    const raw=parsed.data.slice(1);if(raw.length>50000)throw Error('Please use a dataset with 50,000 rows or fewer.');
    const bad=raw.findIndex(r=>r.length!==columns.length);if(bad>=0)throw Error(`CSV row ${bad+2} has ${raw[bad].length} fields; the header has ${columns.length}. Check commas and quoted values.`);
    let name=file.name.replace(/\.csv$/i,'').replace(/[^a-zA-Z0-9_]/g,'_').replace(/^([0-9])/,'table_$1')||'my_data';const base=name;let suffix=2;while(tables.some(t=>t.name.toLowerCase()===name.toLowerCase()))name=base+'_'+suffix++;
    // Infer only canonical numbers, preserving phone numbers, ZIP codes, and IDs with leading zeroes.
    const number=/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
    const types=columns.map((_,i)=>{const values=raw.map(r=>r[i]).filter(v=>v!=='');if(values.length&&values.every(v=>number.test(v)&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=Number.MAX_SAFE_INTEGER))return values.every(v=>Number.isInteger(Number(v)))?'INTEGER':'REAL';return 'TEXT';});
    const rows=raw.map(row=>row.map((v,i)=>v===''?null:types[i]==='TEXT'?v:Number(v)));
    const result=await request('import',{name,columns,types,rows});accept(result);editor.setValue('SELECT *\nFROM '+quote(name)+'\nLIMIT 100;',-1);status(`Imported ${rows.length.toLocaleString()} rows into ${name}. Empty cells become NULL. Run the query to explore your data.`);
  }catch(e){status(friendly(e.message),true);}finally{setBusy(false);scheduleValidation();$('fileInput').value='';}
}
async function init(){
  if(!window.ace||!window.Papa){status('The editor could not load. Check your internet connection, then reload.',true);return;}
  editor=ace.edit('editor');editor.session.setMode('ace/mode/sql');editor.setTheme('ace/theme/chrome');editor.setOptions({showPrintMargin:false,enableBasicAutocompletion:true,enableLiveAutocompletion:true,tabSize:2,fontFamily:'Consolas, monospace',fontSize:14});editor.session.setUseWorker(false);editor.setValue(initialQuery,-1);
  ace.require('ace/ext/language_tools').addCompleter({getCompletions(_e,_s,_p,_prefix,callback){callback(null,tables.flatMap(t=>[{caption:t.name,value:quote(t.name),meta:'table',score:1000},...t.columns.map(c=>({caption:c.name,value:quote(c.name),meta:t.name,score:900}))]));}});
  editor.commands.addCommand({name:'runSQL',bindKey:{win:'Ctrl-Enter',mac:'Command-Enter'},exec:runQuery});editor.session.on('change',scheduleValidation);editor.selection.on('changeSelection',()=>{$('runBtn').innerHTML=editor.getSelectedText().trim()?'Run selection <kbd>Ctrl+Enter</kbd>':'Run query <kbd>Ctrl+Enter</kbd>';});
  $('runBtn').onmousedown=e=>e.preventDefault();
  $('runBtn').onclick=runQuery;$('stopBtn').onclick=()=>restart('Stopped. Restored your last completed database.');$('clearBtn').onclick=()=>{editor.setValue('',-1);editor.focus();};
  $('uploadBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>importCSV(e.target.files[0]);
  $('editorHint').setAttribute('role','status');$('editorHint').setAttribute('aria-live','polite');$('editorHint').setAttribute('aria-atomic','true');
  document.querySelectorAll('.lesson').forEach(b=>b.onclick=()=>{document.querySelectorAll('.lesson').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});b.classList.add('active');b.setAttribute('aria-pressed','true');editor.setValue(b.dataset.query.replaceAll('\\n','\n'),-1);editor.focus();showPracticeLoaded(b);});
  $('sampleBtn').onclick=async()=>{if(!confirm('Restore the original sample database? This removes uploaded tables and database changes. Save your database first if you want to keep them.'))return;snapshot=null;allResults=[];renderResults();renderTabs();await restart('Sample data restored. Ready to explore.');editor.setValue(initialQuery,-1);};
  $('saveDb').onclick=()=>download(new Blob([snapshot],{type:'application/vnd.sqlite3'}),'tech-moms-sandbox.sqlite');
  $('openDb').onclick=()=>$('dbInput').click();$('dbInput').onchange=async e=>{const file=e.target.files[0];if(!file||busy)return;if(file.size>20*1024*1024){status('Choose a database smaller than 20 MB.',true);return;}if(!confirm('Replace this tab’s database with this file? Save your current database first if you want to keep it.'))return;setBusy(true);try{accept(await request('open',{bytes:new Uint8Array(await file.arrayBuffer())}));allResults=[];renderResults();renderTabs();status('Database opened. Choose a table on the left to explore.');}catch(e){status('Could not open this SQLite database. '+e.message,true);}finally{setBusy(false);$('dbInput').value='';scheduleValidation();}};
  $('exportBtn').onclick=()=>{const r=allResults[selectedResult];if(r)download(new Blob(['\uFEFF'+Papa.unparse({fields:r.columns,data:r.values})],{type:'text/csv;charset=utf-8'}),'query-results.csv');};
  $('helpBtn').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();$('clearHistory').onclick=()=>{history=[];renderHistory();};
  window.addEventListener('beforeunload',e=>{if(snapshot){e.preventDefault();e.returnValue='';}});
  spawn();try{accept(await request('init',{},30000));ready=true;status('Click Run query or upload a CSV.');}catch(e){status(e.message,true);}setBusy(false);scheduleValidation();
}
init();
