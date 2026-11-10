// Paste into Extensions > Apps Script in the TEST spreadsheet.
const TARGET_ID = 'YOUR_SPREADSHEET_ID';
const TARGET_TAB = 'YOUR_SHEET_TAB_NAME';
const EXPECTED_HEADERS = ['Тикеты в онхолде', 'Айди вывода', 'Айди депозита', 'Заявка хаба', 'Айди клиента', 'Проект', 'Сумма'];

function setup() {
  const sheet = getTarget_();
  checkHeaders_(sheet);
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty('MATCHING_SECRET');
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    properties.setProperty('MATCHING_SECRET', secret);
  }
  SpreadsheetApp.getUi().alert('Connection key',
    'Copy this key into the matching widget Settings. Keep it private.\n\n' + secret,
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function getTarget_() {
  const sheet = SpreadsheetApp.openById(TARGET_ID).getSheetByName(TARGET_TAB);
  if (!sheet) throw new Error('The tab “' + TARGET_TAB + '” was not found.');
  return sheet;
}

function checkHeaders_(sheet) {
  const headers = sheet.getRange(1, 1, 1, 7).getDisplayValues()[0];
  if (headers.some((h, i) => h.trim().toLowerCase() !== EXPECTED_HEADERS[i].toLowerCase())) {
    throw new Error('The first seven column headings do not match. No row was written.');
  }
}

function validateRecord_(data) {
  if (!data || typeof data !== 'object') throw new Error('Missing record.');
  if (typeof data.ticket !== 'string' || !/^https:\/\/app\.helpdesk\.com\/tickets\/[A-Za-z0-9_-]{1,100}$/.test(data.ticket)) {
    throw new Error('Enter a valid HelpDesk ticket link.');
  }
  for (const name of ['withdrawal', 'deposit', 'reservation', 'client']) {
    if (typeof data[name] !== 'string' || !/^\d{1,30}$/.test(data[name])) {
      throw new Error('Missing or invalid ' + name + ' ID.');
    }
  }
  if (typeof data.project !== 'string' || !data.project.trim() || data.project.length > 100 || /^[=+@-]/.test(data.project.trim()) || /[\r\n\t]/.test(data.project)) {
    throw new Error('Missing or invalid project.');
  }
  if (typeof data.amount !== 'string' || !/^\d{1,15}(\.\d{1,2})?$/.test(data.amount)) throw new Error('Missing or invalid amount. Update the Matching Doc Helper.');
  return [data.ticket, data.withdrawal, data.deposit, data.reservation, data.client, data.project.trim(), data.amount];
}

function doPost(e) {
  let lock;
  try {
    const body = e && e.postData && e.postData.contents;
    if (!body || body.length > 4096) throw new Error('Invalid request.');
    const request = JSON.parse(body);
    const secret = PropertiesService.getScriptProperties().getProperty('MATCHING_SECRET');
    if (!secret || request.secret !== secret) throw new Error('Connection key is incorrect.');
    const values = validateRecord_(request.record);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error('Another save is in progress. Please retry.');
    const sheet = getTarget_();
    checkHeaders_(sheet);
    const sheetLast = sheet.getLastRow();
    const rows = sheetLast > 1 ? sheet.getRange(2, 1, sheetLast - 1, 7).getDisplayValues() : [];
    // Ignore manual checkboxes and other columns when choosing the append row.
    while (rows.length && rows[rows.length - 1].every(value => String(value).trim() === '')) rows.pop();
    const last = rows.length + 1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].slice(0, 4).map(value => String(value).trim());
      row[3] = row[3].replace(/^#\s*/, '');
      // Only an identical combination of all four fields is a duplicate.
      if (row.every((value, column) => value === values[column])) {
        return json_({ok: true, schemaVersion: 2, duplicate: true, row: i + 2});
      }
    }
    const nextRow = Math.max(2, last + 1);
    if (nextRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
    sheet.getRange(nextRow, 1, 1, 7).setNumberFormat('@').setBackground(null).setValues([values]);
    SpreadsheetApp.flush();
    return json_({ok: true, schemaVersion: 2, duplicate: false, row: nextRow});
  } catch (error) {
    return json_({ok: false, error: String(error.message || 'Save failed.').slice(0, 250)});
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function doGet() {
  return json_({ok: true, service: 'Matching ticket saver', version: 2});
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
