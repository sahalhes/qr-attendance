# QR attendance

Lightweight year/class attendance using **Google Sheets + Google Forms + Apps Script**. No server, database, framework, paid QR API, or web app deployment. Admin controls live in the spreadsheet sidebar. Students use the Google Form.

## Features

- Master student roster grouped by year and class.
- One reusable QR code for every class and session.
- Open a timed session for a selected class and validate submissions against its roster.
- Close attendance and automatically populate Present and Absent sheets.
- Review past sessions and download absent, present, or full attendance CSVs.
- Duplicate, unregistered, and late submissions do not count.
- Each session snapshots its student roster, preserving historical reports when students change year/class.
- QR generation happens locally, using bundled code with no external request.

## Install later (nothing is hosted yet)

1. Create a **blank Google Sheet**. Go to **Extensions → Apps Script**.
2. Add the files from `apps-script/` to that bound project:
   - Script files: `Code.gs`, `Attendance.gs`.
   - HTML files: `Admin.html`, `Qr.html` (choose HTML when creating each).
   - Enable **Show appsscript.json manifest file in editor** in Project Settings and replace its contents with the supplied manifest.
3. Save. Select `setupAttendance` and click **Run**, then authorize the Google Forms and Sheets permissions. Setup creates the tabs and a reusable Google Form. It is safe to rerun on this project's sheets; it validates headers rather than overwriting existing data.
4. Refresh the spreadsheet. Open **Attendance → Admin dashboard**. If you are upgrading from the class-specific QR version, run **Set up / repair** once; it removes the old Session ID form question.
5. Click **Open Google Form settings**. In the form, set **Settings → Responses → Collect email addresses → Verified**. The setup API enables email collection, but you must verify this UI setting: respondent-entered emails allow impersonation. Do not enable “Limit to 1 response” because students must attend multiple sessions. Keep response editing and response summaries disabled.
6. If Google's form UI asks you to **Publish** the form, publish it for the intended students. Restrict responder access to the college domain if your Workspace account offers it. This is Google Forms responder access, not deployment of a custom website.
7. Populate **Students** with your roster. Use `examples/students.csv` as a header/sample reference; replace its fictional students and emails. Paste values starting at A2 without changing headers. IDs, years and class names are text; leading zeros are preserved. Check **Active** for current students. Emails must match their signed-in Google accounts.
8. Only teachers/admins should have access to this spreadsheet and its bound script. Students receive the session Form link/QR, never spreadsheet edit access.

No `doGet`, Apps Script web app deployment, hosting, npm installation, or API keys are needed for runtime.

### Optional clasp workflow

Install Google's `@google/clasp` locally and log in. Create a `.clasp.json` at the repository root containing:

```json
{"scriptId":"YOUR_BOUND_SCRIPT_ID","rootDir":"apps-script"}
```

Use the existing script ID from the spreadsheet's bound Apps Script project, then run `clasp push`. Do not deploy a web app. `.clasp.json` and credentials are ignored by Git. The manual editor setup above works without clasp.

## Daily use

1. Select year/class and a 1–180 minute window in the sidebar.
2. Confirm that verified email collection is configured. Click **Open attendance**.
3. Display the common QR or download its PNG. You can print and reuse this same QR for every class and future session. Students scan and submit with their registered Google account.
4. Click **Refresh attendance** to see present and provisional absent lists.
5. Click **Close attendance & update sheets**. Present and Absent show this session's results; both include the Session ID. Download CSVs or select an older session when needed.

Only one session may be live at a time. Expired sessions do not block a new one. The deadline is enforced when computing attendance, so a late form submission never counts. The form may remain visibly open until an admin closes it or opens another session; no scheduled background jobs are required. An older expired session can be reviewed/closed without closing another currently live session.

## Spreadsheet tabs

| Tab | Purpose |
| --- | --- |
| Students | Student ID, Name, Year, Class, Email, Active |
| Sessions | Unique session ID, year/class, opening/deadline/closing times and form URL |
| Roster | Student snapshot for each session |
| Form Responses … | Google's linked raw submissions (actual tab name is Google-generated) |
| Present / Absent | Latest report written by the close/update action |

Admin reports read the Google Form responses directly, so they do not depend on a submit trigger or the linked response sheet updating immediately. Historical reports use the Roster snapshot. Do not delete form responses, the Session ID question, or historical Sessions/Roster rows: those are the stored source of truth. These tabs are admin-only, not tamper-proof against spreadsheet editors.

## Attendance logic

The common QR encodes the reusable Google Form URL, not a class, session, or student. Only one session can be live at a time, so a response is assigned by its Google Forms timestamp. A submission counts only when the verified respondent email appears in the selected session's roster and its timestamp falls between opening and the earlier of closing/deadline. A registered email counts once. Absent = snapshot roster minus counted emails. The script is not a physical-presence verifier: students can forward the QR or form link.

Roster duplicates in the selected class cause opening to fail rather than silently dropping a student. Admin UI renders student data as text; CSV exports guard spreadsheet formula injection. Direct use of Forms/Sheets still requires internet and is subject to Google's account policies and Apps Script quotas. This intentionally simple design reads responses from the session's opening onward; very large archives should periodically move to a new master sheet/form.

## Development checks

Node.js 22 or newer; no npm dependencies:

```sh
npm run check
npm test
```

Checks cover script syntax, session windows, duplicates, roster validation, absent calculation, CSV safety, session lifecycle with mocked Google services, and local QR generation. Actual Google account permissions, verified-email configuration, and phone scanning require a smoke test after setup:

1. Register two test Google accounts in one class; open a session and scan the downloaded PNG.
2. Submit from one account twice; refresh: one present, one absent.
3. Submit from an unregistered account; it must not count.
4. Close and confirm Present/Absent and CSV results. Submit after the deadline using an old link; it must not count.
5. Change the master roster and review the old session; its snapshot must remain unchanged.

## Google documentation

- [HTML Service and spreadsheet sidebars](https://developers.google.com/apps-script/guides/html)
- [Google Form service](https://developers.google.com/apps-script/reference/forms/form)
- [Form responses and prefilled URLs](https://developers.google.com/apps-script/reference/forms/form-response)

Third-party QR code attribution: see `THIRD_PARTY_NOTICES.md`. No project license has been chosen; this is a private repository.
