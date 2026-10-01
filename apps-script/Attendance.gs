/** Pure attendance rules; no Google services. */
function normalizeEmail_(value) { return String(value || '').trim().toLowerCase(); }
function rosterFor_(rows, year, group) {
  const selected = rows.filter(r => String(r[2]) === String(year) && String(r[3]) === String(group) && (r[5] === true || String(r[5]).toUpperCase() === 'TRUE'));
  const ids = new Set(), emails = new Set();
  return selected.map(r => {
    const student = { id: String(r[0]).trim(), name: String(r[1]).trim(), year: String(r[2]), group: String(r[3]), email: normalizeEmail_(r[4]) };
    if (!student.id || !student.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email)) throw new Error('Every active student needs an ID, name and valid email.');
    if (ids.has(student.id) || emails.has(student.email)) throw new Error('Duplicate student ID or email in the selected class.');
    ids.add(student.id); emails.add(student.email); return student;
  });
}
function calculateAttendance_(roster, responses, session, now) {
  const start = new Date(session.openedAt).getTime();
  const end = Math.min(new Date(session.expiresAt).getTime(), session.closedAt ? new Date(session.closedAt).getTime() : now);
  const emails = new Set(roster.map(s => s.email));
  const seen = new Set(), presentEmails = new Set(), rejected = [];
  responses.forEach(r => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    const email = normalizeEmail_(r.email), time = new Date(r.timestamp).getTime();
    let reason = '';
    if (!Number.isFinite(time) || time < start || time > end) reason = 'Outside session window';
    else if (!emails.has(email)) reason = 'Email not in session roster';
    else if (presentEmails.has(email)) reason = 'Duplicate submission';
    if (reason) rejected.push({email: email, timestamp: r.timestamp, reason: reason});
    else presentEmails.add(email);
  });
  return {present: roster.filter(s => presentEmails.has(s.email)), absent: roster.filter(s => !presentEmails.has(s.email)), rejected: rejected};
}
/** Prevent Sheets/Excel from treating imported text as a formula. */
function safeCell_(value) {
  const text = String(value == null ? '' : value);
  return /^[=+@\-\t\r\n]/.test(text) ? "'" + text : text;
}
function csv_(rows) {
  return '\ufeff' + rows.map(row => row.map(v => '"' + safeCell_(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
}
