const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(){
 const data={},props={},responses=[];
 const range=(name,r,c,n=1,w=1)=>({
  getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>data[name][r+i-1]?.[c+j-1]??'')),
  getDisplayValues(){return this.getValues().map(row=>row.map(String));},
  setValues(rows){rows.forEach((row,i)=>row.forEach((v,j)=>{data[name][r+i-1]??=[];data[name][r+i-1][c+j-1]=typeof v==='string'&&v.startsWith("'")?v.slice(1):v;}));return this;},
  setValue(v){return this.setValues([[v]]);},setFontWeight(){return this;},setNumberFormat(){return this;},setDataValidation(){return this;}
 });
 const sheet=name=>({appendRow(row){data[name].push(row);return this;},getLastRow:()=>data[name].length,getRange:(...args)=>range(name,...args),setFrozenRows(){},clearContents(){data[name]=[];}});
 const ss={getSheetByName:name=>name in data?sheet(name):null,insertSheet(name){data[name]=[];return sheet(name);},getId:()=> 'sheet',toast(){}};
 const item={getId:()=>123,asTextItem(){return this;},setTitle(){return this;},setRequired(){return this;},createResponse:value=>value};
 let accepting=false;
 const form={getId:()=> 'form',getEditUrl:()=> 'https://example.com/form/edit',getPublishedUrl:()=> 'https://example.com/form',getItemById:()=>item,addTextItem:()=>item,deleteItem(){return form;},
  setAcceptingResponses(v){accepting=v;return this;},getResponses:since=>responses.filter(r=>r.getTimestamp()>=since),
 };
 ['setDestination','setCollectEmail','setAllowResponseEdits','setLimitOneResponsePerUser','setPublishingSummary','setShowLinkToRespondAgain','setDescription','setConfirmationMessage'].forEach(name=>form[name]=()=>form);
 let sequence=0;
 const ctx=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush(){},newDataValidation:()=>({requireCheckbox(){return this;},build(){return {};}})},PropertiesService:{getDocumentProperties:()=>({getProperty:k=>props[k]??null,setProperty(k,v){props[k]=v;},deleteProperty(k){delete props[k];}})},FormApp:{create:()=>form,openById:()=>form,DestinationType:{SPREADSHEET:'sheet'}},LockService:{getDocumentLock:()=>({waitLock(){},releaseLock(){}})},Utilities:{getUuid:()=> 'session-'+(++sequence)}});
 for(const name of ['Attendance.gs','Code.gs'])vm.runInContext(fs.readFileSync('apps-script/'+name,'utf8'),ctx);
 function submit(email,s,time=new Date()) {responses.push({getId:()=> 'response-'+responses.length+'-'+email,getRespondentEmail:()=>email,getTimestamp:()=>time,getItemResponses:()=>[]});}
 return {ctx,data,submit,accepting:()=>accepting};
}
test('setup is repeatable; open, submit, close, export and historical roster are connected',()=>{
 const h=harness();h.ctx.setupAttendance();h.ctx.setupAttendance();
 assert.equal(h.data.Students.length,1);assert.equal(h.accepting(),false);
 h.data.Students.push(['001','Student A','1','B','a@example.com',true],['002','Student B','1','B','b@example.com',true]);
 assert.throws(()=>h.ctx.openAttendance('1','B',10,false));
 const s=h.ctx.openAttendance('1','B',10,true);assert.equal(h.accepting(),true);
 assert.equal(s.url,'https://example.com/form');
 assert.throws(()=>h.ctx.openAttendance('1','B',10,true));
 h.submit('A@example.com',s);h.submit('a@example.com',s);h.submit('outsider@example.com',s);
 const report=h.ctx.closeAttendance(s.id);
 assert.equal(report.present.length,1);assert.equal(report.absent.length,1);assert.equal(report.rejected.length,2);assert.equal(h.accepting(),false);
 assert.equal(h.data.Present[1][1],'001');assert.equal(h.data.Absent[1][1],'002');
 assert.ok(h.ctx.exportAttendance(s.id,'absent').content.includes('Student B'));
 h.data.Students.splice(1,2,['003','New student','1','B','c@example.com',true]);
 assert.equal(h.ctx.getReport(s.id).absent[0].id,'002');
 const next=h.ctx.openAttendance('1','B',10,true);assert.equal(next.url,s.url);h.ctx.closeAttendance(s.id);assert.equal(h.accepting(),true);
 h.ctx.closeAttendance(next.id);assert.equal(h.accepting(),false);
});
test('deadline rejects late submissions without a background timer; expired session does not close new session',()=>{
 const h=harness();h.ctx.setupAttendance();h.data.Students.push(['001','Student A','1','B','a@example.com',true]);
 const old=h.ctx.openAttendance('1','B',1,true);
 const row=h.data.Sessions[1];row[3]=new Date(Date.now()-120000);row[4]=new Date(Date.now()-60000);
 h.submit('a@example.com',old,new Date(Date.now()-1000));
 assert.equal(h.ctx.getReport(old.id).present.length,0);
 const current=h.ctx.openAttendance('1','B',1,true);h.ctx.closeAttendance(old.id);
 assert.equal(h.accepting(),true);assert.equal(h.ctx.getReport(current.id).absent.length,1);
});
