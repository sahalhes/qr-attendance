const HEADERS_ = {
  Students: ['Student ID', 'Name', 'Year', 'Class', 'Email', 'Active'],
  Sessions: ['Session ID', 'Year', 'Class', 'Opened at', 'Expires at', 'Closed at', 'Form URL'],
  Roster: ['Session ID', 'Student ID', 'Name', 'Year', 'Class', 'Email'],
  Present: ['Session ID', 'Student ID', 'Name', 'Year', 'Class', 'Email'],
  Absent: ['Session ID', 'Student ID', 'Name', 'Year', 'Class', 'Email']
};
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Attendance').addItem('Set up / repair', 'setupAttendance').addItem('Admin dashboard', 'showAdmin').addToUi();
}
function withLock_(fn) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function rows_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Run Attendance → Set up / repair first.');
  const expected = HEADERS_[name];
  if (expected && sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0].join('|') !== expected.join('|')) throw new Error('Restore the column headers in ' + name + '.');
  return sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, expected.length).getValues();
}
function setupAttendance() {
  return withLock_(function() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(HEADERS_).forEach(name => {
      let sheet = ss.getSheetByName(name);
      if (!sheet) sheet = ss.insertSheet(name);
      if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS_[name]);
      rows_(name); // Never overwrite an unrelated sheet with the same name.
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS_[name].length).setFontWeight('bold');
    });
    const students = ss.getSheetByName('Students');
    students.getRange('A2:E').setNumberFormat('@');
    students.getRange('F2:F').setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    const props = PropertiesService.getDocumentProperties();
    let form;
    if (props.getProperty('FORM_ID')) form = FormApp.openById(props.getProperty('FORM_ID'));
    else {
      form = FormApp.create('Class attendance');
      props.setProperty('FORM_ID', form.getId());
      form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    }
    form.setCollectEmail(true).setAllowResponseEdits(false).setLimitOneResponsePerUser(false).setPublishingSummary(false).setShowLinkToRespondAgain(false);
    form.setDescription('Use the Google account registered in your class roster. A submission is counted only if it matches the roster and attendance window.');
    form.setConfirmationMessage('Submitted. Your teacher will verify it against the class roster and attendance window.');
    let itemId = props.getProperty('SESSION_ITEM_ID');
    if (!itemId) {
      const item = form.addTextItem().setTitle('Session ID').setRequired(true);
      props.setProperty('SESSION_ITEM_ID', String(item.getId()));
    }
    if (!sessions_().some(s => !s.closedAt && Date.now() <= new Date(s.expiresAt).getTime())) form.setAcceptingResponses(false);
    SpreadsheetApp.getActiveSpreadsheet().toast('Ready. Add students and set the form email collection to Verified before opening attendance.');
    return {formEditUrl: form.getEditUrl()};
  });
}
function showAdmin() {
  SpreadsheetApp.getUi().showSidebar(HtmlService.createTemplateFromFile('Admin').evaluate().setTitle('Attendance'));
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
function form_() {
  const id = PropertiesService.getDocumentProperties().getProperty('FORM_ID');
  if (!id) throw new Error('Run setup first.');
  return FormApp.openById(id);
}
function sessions_() {
  return rows_('Sessions').map(r => ({id: String(r[0]), year: String(r[1]), group: String(r[2]), openedAt: new Date(r[3]).toISOString(), expiresAt: new Date(r[4]).toISOString(), closedAt: r[5] ? new Date(r[5]).toISOString() : null, url: String(r[6])}));
}
function getDashboard() {
  const groups = new Map();
  rows_('Students').forEach(r => {
    if (r[5] === true || String(r[5]).toUpperCase() === 'TRUE') groups.set(JSON.stringify([String(r[2]), String(r[3])]), {year: String(r[2]), group: String(r[3])});
  });
  return {groups: Array.from(groups.values()), sessions: sessions_().reverse(), formEditUrl: form_().getEditUrl()};
}
function openAttendance(year, group, minutes, verifiedEmailConfirmed) {
  return withLock_(function() {
    if (verifiedEmailConfirmed !== true) throw new Error('First set Collect email addresses to Verified in the Google Form settings.');
    minutes = Number(minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) throw new Error('Choose an attendance window of 1–180 minutes.');
    const now = new Date();
    if (sessions_().some(s => !s.closedAt && now.getTime() <= new Date(s.expiresAt).getTime())) throw new Error('Close the current session before opening another.');
    const roster = rosterFor_(rows_('Students'), year, group);
    if (!roster.length) throw new Error('No active students found for this year/class.');
    const form = form_();
    // Keep the shared form closed while the next session is prepared.
    form.setAcceptingResponses(false);
    const id = Utilities.getUuid();
    const item = form.getItemById(Number(PropertiesService.getDocumentProperties().getProperty('SESSION_ITEM_ID'))).asTextItem();
    const url = form.createResponse().withItemResponse(item.createResponse(id)).toPrefilledUrl();
    const session = {id: id, year: String(year), group: String(group), openedAt: now.toISOString(), expiresAt: new Date(now.getTime() + minutes * 60000).toISOString(), closedAt: null, url: url};
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Roster');
    sheet.getRange(sheet.getLastRow() + 1, 1, roster.length, 6).setValues(roster.map(s => [id, s.id, s.name, s.year, s.group, s.email].map(safeCell_)));
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sessions').appendRow([id, safeCell_(year), safeCell_(group), now, new Date(session.expiresAt), '', url]);
    SpreadsheetApp.flush();
    form.setAcceptingResponses(true);
    return session;
  });
}
function session_(id) {
  const session = sessions_().find(s => s.id === String(id));
  if (!session) throw new Error('Session not found.');
  return session;
}
function report_(session) {
  const roster = rows_('Roster').filter(r => r[0] === session.id).map(r => ({id: String(r[1]), name: String(r[2]), year: String(r[3]), group: String(r[4]), email: normalizeEmail_(r[5])}));
  const itemId = PropertiesService.getDocumentProperties().getProperty('SESSION_ITEM_ID');
  // Read Google Forms directly: delayed/failed spreadsheet submit triggers cannot lose attendance.
  const responses = form_().getResponses(new Date(new Date(session.openedAt).getTime() - 1)).map(r => {
    const answer = r.getItemResponses().find(i => String(i.getItem().getId()) === itemId);
    return {id: r.getId(), email: r.getRespondentEmail(), timestamp: r.getTimestamp().toISOString(), sessionId: answer ? String(answer.getResponse()).trim() : ''};
  });
  return Object.assign({session: session}, calculateAttendance_(roster, responses, session, Date.now()));
}
function getReport(id) { return report_(session_(id)); }
function closeAttendance(id) {
  return withLock_(function() {
    const session = session_(id);
    if (!session.closedAt) {
      const active = sessions_().some(s => s.id !== session.id && !s.closedAt && Date.now() <= new Date(s.expiresAt).getTime());
      if (!active) form_().setAcceptingResponses(false);
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sessions');
      const index = rows_('Sessions').findIndex(r => r[0] === session.id);
      session.closedAt = new Date().toISOString();
      sheet.getRange(index + 2, 6).setValue(new Date(session.closedAt));
      SpreadsheetApp.flush();
    }
    const report = report_(session);
    writeReport_(report);
    return report;
  });
}
function writeReport_(report) {
  ['Present', 'Absent'].forEach(name => {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    sheet.clearContents();
    sheet.getRange(1, 1, 1, 6).setValues([HEADERS_[name]]);
    const people = report[name.toLowerCase()];
    if (people.length) sheet.getRange(2, 1, people.length, 6).setValues(people.map(s => [report.session.id, s.id, s.name, s.year, s.group, s.email].map(safeCell_)));
  });
}
function exportAttendance(id, kind) {
  if (['absent', 'present', 'all'].indexOf(kind) < 0) throw new Error('Invalid export type.');
  const report = getReport(id);
  const rows = [['Session ID', 'Student ID', 'Name', 'Year', 'Class', 'Email', 'Attendance']];
  ['present', 'absent'].forEach(status => {
    if (kind !== 'all' && kind !== status) return;
    report[status].forEach(s => rows.push([id, s.id, s.name, s.year, s.group, s.email, status]));
  });
  return {filename: 'attendance-' + id + '-' + kind + '.csv', content: csv_(rows)};
}
