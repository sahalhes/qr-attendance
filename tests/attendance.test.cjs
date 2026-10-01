const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync('apps-script/Attendance.gs','utf8'),context);
const clean=v=>JSON.parse(JSON.stringify(v));
const students=[['001','A','1','B','A@example.com',true],['002','B','1','B','b@example.com',true],['003','C','2','B','c@example.com',true],['004','D','1','B','d@example.com',false]];
const session={id:'session',openedAt:'2026-10-01T09:00:00Z',expiresAt:'2026-10-01T09:10:00Z',closedAt:null};
const response=(id,email,time,sessionId='session')=>({id,email,timestamp:'2026-10-01T09:'+time+'Z',sessionId});
test('year/class/active roster; leading zeros and normalized emails',()=>{
 const roster=clean(context.rosterFor_(students,1,'B'));
 assert.equal(roster.length,2);assert.equal(roster[0].id,'001');assert.equal(roster[0].email,'a@example.com');
});
test('reject duplicate IDs, emails and missing roster fields',()=>{
 for(const extra of [['001','C','1','B','c@example.com',true],['009','C','1','B','A@example.com',true],['009','','1','B','c@example.com',true]])assert.throws(()=>context.rosterFor_([...students,extra],1,'B'));
});
test('only unique registered submissions within session count; boundaries inclusive',()=>{
 const roster=context.rosterFor_(students,1,'B');
 const report=clean(context.calculateAttendance_(roster,[response('early','a@example.com','00:00'),response('duplicate','A@example.com','01:00'),response('unknown','c@example.com','01:00'),response('late','b@example.com','10:01'),response('other','b@example.com','01:00','other')],session,Date.parse('2026-10-01T09:20:00Z')));
 assert.deepEqual(report.present.map(s=>s.id),['001']);assert.deepEqual(report.absent.map(s=>s.id),['002']);assert.equal(report.rejected.length,3);
 const boundary=context.calculateAttendance_(roster,[response('a','b@example.com','10:00')],session,Date.parse('2026-10-01T09:20:00Z'));
 assert.equal(boundary.present.length,1);
});
test('early close and current time both bound attendance',()=>{
 const roster=context.rosterFor_(students,1,'B'),responses=[response('a','a@example.com','04:00'),response('b','b@example.com','06:00')];
 for(const s of [session,{...session,closedAt:'2026-10-01T09:05:00Z'}]){
  const r=context.calculateAttendance_(roster,responses,s,Date.parse('2026-10-01T09:05:00Z'));assert.equal(r.present.length,1);assert.equal(r.absent.length,1);
 }
});
test('empty submissions produce full absent list; no absent when everyone submits',()=>{
 const roster=context.rosterFor_(students,1,'B');
 assert.equal(context.calculateAttendance_(roster,[],session,Date.parse(session.expiresAt)).absent.length,2);
 assert.equal(context.calculateAttendance_(roster,[response('a','a@example.com','01:00'),response('b','b@example.com','02:00')],session,Date.parse(session.expiresAt)).absent.length,0);
});
test('CSV quotes, Unicode and spreadsheet formula protection',()=>{
 const csv=context.csv_([['=HYPERLINK("x")','Sahal, Hussain','a"b','കേരളം','\n=1+1']]);
 assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));assert.ok(csv.includes('"Sahal, Hussain"'));assert.ok(csv.includes('"a""b"'));assert.ok(csv.includes('കേരളം'));
});
test('local QR includes valid finder pattern and handles real prefilled URLs',()=>{
 const qrContext=vm.createContext({});
 vm.runInContext(fs.readFileSync('apps-script/Qr.html','utf8').replace(/^<script>/,'').replace(/<\/script>\s*$/,''),qrContext);
 for(const url of ['https://docs.google.com/forms/d/e/1FAIpQLExample/viewform?usp=pp_url&entry.123456789=00000000-0000-4000-a000-000000000001','https://docs.google.com/forms/d/e/'+ 'a'.repeat(200)+'/viewform?entry.987654321='+ 'b'.repeat(36)]){
  const qr=new qrContext.LocalQR.QRCode(-1,qrContext.LocalQR.level.M);qr.addData(url);qr.make();
  assert.ok(qr.getModuleCount()>=21);assert.equal((qr.getModuleCount()-21)%4,0);
  assert.equal(qr.isDark(0,0),true);assert.equal(qr.isDark(1,1),false);assert.equal(qr.isDark(3,3),true);
 }
});
