/**
 * Cosmic Shore test sign-ups: the backend of the "Request test access" form on www.froglet.games.
 *
 * Bound to a Google Sheet (Extensions > Apps Script) and deployed as a web app. Setup: README.md.
 *
 *   site form  --POST JSON-->  doPost  -> a row on the "Requests" sheet (Status: Pending)
 *                                      -> an email to NOTIFY_TO with Approve / Decline links
 *   Approve link -> doGet (a confirm page; a link scanner opening it changes nothing)
 *                -> its button POSTs back -> doPost -> confirmation email to the tester, row Approved
 *
 * The sheet's "Testers" menu approves or declines the selected rows too.
 *
 * Script Properties (Project Settings > Script properties):
 *   APPROVE_SECRET       required. Any long random string; signs the Approve / Decline links.
 *   NOTIFY_TO            who reviews requests (default caleb@froglet.studio,shombith@froglet.studio).
 *   REPLY_TO             the reply-to on the tester's confirmation email (default: the first NOTIFY_TO).
 *   INSTRUCTIONS_WINDOWS / INSTRUCTIONS_IOS / INSTRUCTIONS_ANDROID
 *                        what the approved tester is told for that platform (a link, a code, steps).
 *                        Plain text; blank lines become paragraphs. Empty: a "we'll send it shortly" line.
 */

var SHEET = 'Requests';
var HEADERS = ['Received', 'Email', 'Platform', 'Heard about us', 'Details', 'Status', 'Decided', 'Id'];
var COL = { received: 1, email: 2, platform: 3, heard: 4, details: 5, status: 6, decided: 7, id: 8 };
var PLATFORMS = { windows: 'Windows PC', ios: 'iPhone & iPad', android: 'Android' };
var DEFAULT_NOTIFY = 'caleb@froglet.studio,shombith@froglet.studio';
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function prop_(name, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  return v ? v : (fallback || '');
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

/** A sheet cell never starts with = + - @, so a sign-up can't plant a formula. */
function cell_(v) {
  v = String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function sign_(action, id) {
  var secret = prop_('APPROVE_SECRET');
  if (!secret) throw new Error('Set the APPROVE_SECRET script property (README.md).');
  var bytes = Utilities.computeHmacSha256Signature(action + ':' + id, secret);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function findRow_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, COL.id, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return 0;
}

// ---------------------------------------------------------------- the site's form

function doPost(e) {
  if (e && e.parameter && e.parameter.action) return decideFromLink_(e.parameter);   // the confirm page's button

  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  if (data.website) return json_({ ok: true });                  // honeypot: a bot filled the hidden field

  var email = String(data.email || '').trim().toLowerCase().slice(0, 254);
  var platform = PLATFORMS[data.platform] ? data.platform : '';
  if (!EMAIL_RE.test(email)) return json_({ ok: false, error: 'email' });
  if (!platform) return json_({ ok: false, error: 'platform' });

  // One request per email + platform every 10 minutes, so a double click or a script can't flood the inbox.
  var cache = CacheService.getScriptCache();
  var key = 'rq:' + Utilities.base64EncodeWebSafe(email + '|' + platform);
  if (cache.get(key)) return json_({ ok: true });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_();
    var last = sh.getLastRow();
    if (last >= 2) {
      var rows = sh.getRange(2, COL.email, last - 1, COL.status - COL.email + 1).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0]).replace(/^'/, '') === email && rows[i][1] === PLATFORMS[platform] &&
            rows[i][4] !== 'Declined') {
          cache.put(key, '1', 600);
          return json_({ ok: true });                            // already asked: don't email the team twice
        }
      }
    }
    var id = Utilities.getUuid();
    var heard = cell_(data.heard);
    var details = cell_(data.heard_other);
    sh.appendRow([new Date(), cell_(email), PLATFORMS[platform], heard, details, 'Pending', '', id]);
    cache.put(key, '1', 600);
    notify_(id, email, platform, heard, details);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

function notify_(id, email, platform, heard, details) {
  var url = ScriptApp.getService().getUrl();
  var link = function (action) {
    return url + '?action=' + action + '&id=' + encodeURIComponent(id) + '&sig=' + sign_(action, id);
  };
  var sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  var label = PLATFORMS[platform];
  var html =
    '<p><b>' + esc_(email) + '</b> asked to test Cosmic Shore on <b>' + esc_(label) + '</b>.</p>' +
    '<p>How they heard about us: ' + esc_(heard) + (details ? ' (' + esc_(details) + ')' : '') + '</p>' +
    '<p><a href="' + link('approve') + '">Approve</a> (emails them the ' + esc_(label) + ' instructions)' +
    ' &nbsp;&middot;&nbsp; <a href="' + link('decline') + '">Decline</a> (no email is sent)</p>' +
    '<p><a href="' + sheetUrl + '">All requests</a></p>';
  MailApp.sendEmail({
    to: prop_('NOTIFY_TO', DEFAULT_NOTIFY),
    subject: 'Test request: ' + label + ' - ' + email,
    htmlBody: html,
    body: email + ' asked to test on ' + label + '. Approve: ' + link('approve') + ' Decline: ' + link('decline'),
    replyTo: email,
    name: 'Cosmic Shore test requests'
  });
}

// ---------------------------------------------------------------- the Approve / Decline links

/** The link opens a page with one button, so a mail scanner fetching the link decides nothing. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action !== 'approve' && p.action !== 'decline') return page_('Cosmic Shore test requests', 'Nothing to do here.');
  if (!p.id || p.sig !== sign_(p.action, p.id)) return page_('Link not valid', 'This link is broken or was changed.');
  var sh = sheet_();
  var row = findRow_(sh, p.id);
  if (!row) return page_('Not found', 'That request is no longer on the sheet.');
  var r = sh.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  var email = String(r[COL.email - 1]).replace(/^'/, '');
  if (r[COL.status - 1] !== 'Pending')
    return page_('Already ' + String(r[COL.status - 1]).toLowerCase(), esc_(email) + ' was already ' +
                 String(r[COL.status - 1]).toLowerCase() + '.');
  var verb = p.action === 'approve' ? 'Approve' : 'Decline';
  var body =
    '<p>' + verb + ' <b>' + esc_(email) + '</b> for <b>' + esc_(r[COL.platform - 1]) + '</b>?</p>' +
    (p.action === 'approve' ? '<p>They will get the confirmation email with the test instructions.</p>'
                            : '<p>No email is sent to them.</p>') +
    '<form method="post" action="' + esc_(ScriptApp.getService().getUrl()) + '" target="_top">' +
    '<input type="hidden" name="action" value="' + p.action + '">' +
    '<input type="hidden" name="id" value="' + esc_(p.id) + '">' +
    '<input type="hidden" name="sig" value="' + esc_(p.sig) + '">' +
    '<button type="submit">' + verb + '</button></form>';
  return page_(verb + ' test request', body);
}

function decideFromLink_(p) {
  if (!p.id || p.sig !== sign_(p.action, p.id)) return page_('Link not valid', 'This link is broken or was changed.');
  var result = decide_(p.id, p.action);
  return page_(result.title, result.message);
}

function page_(title, bodyHtml) {
  return HtmlService.createHtmlOutput(
    '<div style="font:16px/1.5 system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px">' +
    '<h2>' + esc_(title) + '</h2>' + bodyHtml + '</div>').setTitle(title);
}

// ---------------------------------------------------------------- deciding

function decide_(id, action) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_();
    var row = findRow_(sh, id);
    if (!row) return { title: 'Not found', message: 'That request is no longer on the sheet.' };
    var r = sh.getRange(row, 1, 1, HEADERS.length).getValues()[0];
    var email = String(r[COL.email - 1]).replace(/^'/, '');
    var status = r[COL.status - 1];
    if (status !== 'Pending')
      return { title: 'Already ' + String(status).toLowerCase(), message: esc_(email) + ' was already ' + String(status).toLowerCase() + '.' };
    if (action === 'approve') {
      var key = Object.keys(PLATFORMS).filter(function (k) { return PLATFORMS[k] === r[COL.platform - 1]; })[0];
      sendConfirmation_(email, key);
      sh.getRange(row, COL.status).setValue('Approved');
    } else {
      sh.getRange(row, COL.status).setValue('Declined');
    }
    sh.getRange(row, COL.decided).setValue(new Date());
    return action === 'approve'
      ? { title: 'Approved', message: 'The confirmation email went to ' + esc_(email) + '.' }
      : { title: 'Declined', message: esc_(email) + ' was declined. No email was sent.' };
  } finally {
    lock.releaseLock();
  }
}

function sendConfirmation_(email, platform) {
  var label = PLATFORMS[platform];
  var steps = prop_('INSTRUCTIONS_' + String(platform).toUpperCase()) ||
              'We\'ll send your ' + label + ' build or invitation in a separate email shortly.';
  var paragraphs = steps.split(/\n\s*\n/).map(function (p) {
    return '<p>' + esc_(p).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>') + '</p>';
  }).join('');
  MailApp.sendEmail({
    to: email,
    subject: 'You\'re in: the Cosmic Shore ' + label + ' test',
    htmlBody: '<p>Hi,</p><p>Thanks for asking to test Cosmic Shore. You\'re approved for the <b>' + esc_(label) +
              '</b> test.</p>' + paragraphs +
              '<p>Reply to this email with anything you find, or any questions.</p><p>See you in the HyperSea,<br>The Froglet team</p>',
    body: 'You\'re approved for the Cosmic Shore ' + label + ' test.\n\n' + steps +
          '\n\nReply to this email with anything you find, or any questions.\n\nThe Froglet team',
    replyTo: prop_('REPLY_TO', prop_('NOTIFY_TO', DEFAULT_NOTIFY).split(',')[0].trim()),
    name: 'Cosmic Shore'
  });
}

// ---------------------------------------------------------------- the sheet's menu

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Testers')
    .addItem('Approve selected rows (sends the confirmation email)', 'approveSelected')
    .addItem('Decline selected rows', 'declineSelected')
    .addToUi();
}

function approveSelected() { decideSelected_('approve'); }
function declineSelected() { decideSelected_('decline'); }

function decideSelected_(action) {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEET) { SpreadsheetApp.getUi().alert('Select rows on the "' + SHEET + '" sheet.'); return; }
  var range = sh.getActiveRange();
  var done = 0, skipped = 0;
  for (var row = Math.max(2, range.getRow()); row <= range.getLastRow(); row++) {
    var id = String(sh.getRange(row, COL.id).getValue());
    if (!id) continue;
    var res = decide_(id, action);
    if (res.title === 'Approved' || res.title === 'Declined') done++; else skipped++;
  }
  SpreadsheetApp.getUi().alert((action === 'approve' ? 'Approved ' : 'Declined ') + done +
                               (skipped ? '; ' + skipped + ' were already decided.' : '.'));
}
