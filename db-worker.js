/* SQLite lives in a worker so a slow query never freezes the editor. */
importScripts('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/sql-wasm.js');
let SQL, db;
const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
function schema() {
  return db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values.map(([name]) => ({name, columns:db.exec(`PRAGMA table_info(${quote(name)})`)[0]?.values.map(c=>({name:c[1],type:c[2]}))||[]})) || [];
}
function samples() {
  db.run(`CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, city TEXT, joined TEXT);
  INSERT INTO customers VALUES (1,'Avery Johnson','Salt Lake City','2025-01-12'),(2,'Jordan Lee','Provo','2025-02-04'),(3,'Morgan Davis','Ogden','2025-02-18'),(4,'Riley Garcia','Salt Lake City','2025-03-01'),(5,'Taylor Wilson','Lehi','2025-03-09'),(6,'Quinn Patel','Provo','2025-04-11'),(7,'Casey Brown','Salt Lake City','2025-04-20'),(8,'Jamie Chen','Ogden','2025-05-02');
  CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, product TEXT, total REAL, order_date TEXT);
  INSERT INTO orders VALUES (101,1,'Notebook',12.5,'2025-05-01'),(102,2,'Desk lamp',45,'2025-05-02'),(103,1,'Keyboard',79.99,'2025-05-06'),(104,3,'Coffee mug',18,'2025-05-08'),(105,4,'Monitor stand',54.5,'2025-05-09'),(106,6,'Notebook',12.5,'2025-05-12'),(107,7,'Keyboard',79.99,'2025-05-15'),(108,5,'Desk lamp',45,'2025-05-17'),(109,8,'Coffee mug',18,'2025-05-18'),(110,2,'Monitor stand',54.5,'2025-05-20');`);
}
function run(query) {
  const results=[];
  // Iterate prepared statements: SQLite handles comments, strings, and semicolons.
  for (const stmt of db.iterateStatements(query)) {
    try {
      const columns=stmt.getColumnNames(), values=[];let count=0;
      while(stmt.step()){count++;if(values.length<500)values.push(stmt.get());}
      if(columns.length)results.push({columns,values,count});
    } finally {stmt.free();}
  }
  return results;
}
self.onmessage=async ({data:{id,type,payload}})=>{
  let backup;
  try {
    if(type==='init'){
      SQL=await initSqlJs({locateFile:f=>'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/'+f});
      db=payload?.bytes ? new SQL.Database(payload.bytes) : new SQL.Database();if(!payload?.bytes)samples();
    }
    if(!db)throw Error('The database is still loading.');
    if(type==='validate'){
      // Preparing against a copy checks syntax and names without changing student data.
      const copy=new SQL.Database(db.export());let result=null;
      try{for(const stmt of copy.iterateStatements(payload.query)){stmt.free();}}
      catch(e){result={message:e.message};}finally{copy.close();}
      postMessage({id,result});return;
    }
    if(type==='run'){
      backup=db.export();const started=performance.now();const results=run(payload.query);
      postMessage({id,result:{results,elapsed:performance.now()-started,schema:schema(),bytes:db.export()}});return;
    }
    if(type==='import'){
      backup=db.export();const {name,columns,types,rows}=payload;
      db.run('BEGIN');
      db.run(`CREATE TABLE ${quote(name)} (${columns.map((c,i)=>quote(c)+' '+types[i]).join(',')})`);
      const stmt=db.prepare(`INSERT INTO ${quote(name)} VALUES (${columns.map(()=>'?').join(',')})`);
      try{for(const row of rows)stmt.run(row);}finally{stmt.free();}
      db.run('COMMIT');
    }
    if(type==='open'){
      const candidate=new SQL.Database(payload.bytes);
      try{candidate.exec('PRAGMA integrity_check');candidate.exec('SELECT name FROM sqlite_master');}catch(e){candidate.close();throw e;}
      db.close();db=candidate;
    }
    postMessage({id,result:{schema:schema(),bytes:db.export()}});
  }catch(e){
    if(backup){db.close();db=new SQL.Database(backup);}
    postMessage({id,error:e.message});
  }
};
