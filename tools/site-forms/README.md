# The website's forms: test sign-ups and the contact form

GitHub Pages only serves files; it cannot send email. Both forms on www.froglet.games post to this Google
Apps Script, which runs on Froglet's Google Workspace, keeps each submission on a Google Sheet and sends the
emails. No form ever opens the visitor's email app.

**Contact form** (Support page: Send a Message, Report a Player, Report a Bug; Delete My Data: Request
Deletion): the message is emailed to `CONTACT_TO` (default: Caleb and Shombith) with **Reply** going to the
sender, so you answer from your inbox. Each message is also a row on the **Contact** sheet.

**Test sign-ups** (the Windows, iPhone & iPad and Android cards: email, platform, how they heard about us):
1. A request lands as a row on the **Requests** sheet (Status **Pending**), and Caleb and Shombith get an
   email with **Approve** and **Decline** links.
2. Approve opens a page with one button (so a mail scanner opening the link changes nothing). Pressing it
   emails the tester their confirmation with that platform's instructions, and marks the row **Approved**.
3. Or select rows on the sheet and use the **Testers** menu.

Until it is set up, both forms show a "not open yet / didn't send" message: the site has nothing else that
can send email.

## Setup (about 10 minutes, once)

1. In Google Drive (signed in to your froglet.studio account) create a Google Sheet, e.g. "Cosmic Shore testers".
2. **Extensions > Apps Script**. Replace `Code.gs` with this folder's `Code.gs`. Save.
3. **Project Settings (gear) > Script properties**, add:
   | Property | Value |
   |---|---|
   | `APPROVE_SECRET` | any long random string (required; it signs the Approve links) |
   | `NOTIFY_TO` | `caleb@froglet.studio,shombith@froglet.studio` (the default): who reviews test requests |
   | `CONTACT_TO` | who gets contact-form messages, e.g. `support@froglet.games` once that group exists (default: `NOTIFY_TO`) |
   | `REPLY_TO` | where testers' replies go (default: the first `NOTIFY_TO`) |
   | `INSTRUCTIONS_IOS` | e.g. the TestFlight public link and two lines of steps |
   | `INSTRUCTIONS_ANDROID` | e.g. the Play internal-test opt-in link |
   | `INSTRUCTIONS_WINDOWS` | e.g. the Steam playtest or download link |
   Blank lines become paragraphs and links become clickable. An empty one tells the tester the build
   follows in a separate email (send it by hand).
4. **Deploy > New deployment > Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Authorise it
   (it asks for Sheets, sending email as you, and the script service). If the Workspace admin blocks
   "Anyone", allow it for this script in the Admin console, or the site's form can't reach it.
5. Copy the web app URL (ends in `/exec`) into `_data/forms.yml` as `endpoint`, and push. Both forms use it.
6. Reload the sheet once: the **Testers** menu appears.

Try it: send yourself a message from /support (check the email arrives and Reply goes to the sender), then
request test access with your own email, approve it from the email, and check the confirmation.

After editing `Code.gs`, use **Deploy > Manage deployments > Edit > Version: New version** so the
same URL serves the new code (a *new* deployment gets a new URL).

## Limits and safety

- Gmail sends about 1,500 emails a day from a Workspace account: plenty here.
- A hidden field catches bots. A test request with the same email + platform within 10 minutes, or one
  already on the sheet, sends nothing again. The contact form sends one message a minute per sender and at
  most 30 in any 10 minutes. Cells can't start with `=`, `+`, `-` or `@`, so a sign-up can't plant a formula.
- The website never sends the email address to analytics.
- What is collected and why: `/privacy#testers`. Set `tester_retention` and `support_retention` in `_data/legal.yml`.
