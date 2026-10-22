# Test sign-ups (the "Request test access" form)

The Windows, iPhone & iPad and Android cards on the home page open a form: email, platform, how they
heard about us. This folder is its backend, a Google Apps Script in Froglet's Google Workspace:

1. A request lands as a row on a Google Sheet (Status **Pending**), and Caleb and Shombith get an email
   with **Approve** and **Decline** links.
2. Approve opens a page with one button (so a mail scanner opening the link changes nothing). Pressing it
   emails the tester their confirmation with that platform's instructions, and marks the row **Approved**.
3. Or select rows on the sheet and use the **Testers** menu.

Until it is set up, the form opens the visitor's email app with a message already addressed to
caleb@froglet.studio and shombith@froglet.studio (`fallback_to` in `_data/testers.yml`), which also puts those
two addresses in the page source.

## Setup (about 10 minutes, once)

1. In Google Drive (signed in to your froglet.studio account) create a Google Sheet, e.g. "Cosmic Shore testers".
2. **Extensions > Apps Script**. Replace `Code.gs` with this folder's `Code.gs`. Save.
3. **Project Settings (gear) > Script properties**, add:
   | Property | Value |
   |---|---|
   | `APPROVE_SECRET` | any long random string (required; it signs the Approve links) |
   | `NOTIFY_TO` | `caleb@froglet.studio,shombith@froglet.studio` (the default) |
   | `REPLY_TO` | where testers' replies go (default: the first `NOTIFY_TO`) |
   | `INSTRUCTIONS_IOS` | e.g. the TestFlight public link and two lines of steps |
   | `INSTRUCTIONS_ANDROID` | e.g. the Play internal-test opt-in link |
   | `INSTRUCTIONS_WINDOWS` | e.g. the Steam playtest or download link |
   Blank lines become paragraphs and links become clickable. An empty one tells the tester the build
   follows in a separate email (send it by hand).
4. **Deploy > New deployment > Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Authorise it
   (it asks for Sheets, sending email as you, and the script service). If the Workspace admin blocks
   "Anyone", allow it for this script in the Admin console, or the site's form can't reach it.
5. Copy the web app URL (ends in `/exec`) into `_data/testers.yml` as `endpoint`, and push.
6. Reload the sheet once: the **Testers** menu appears.

Try it: submit the form on the site with your own email, approve it from the email, check the confirmation.

After editing `Code.gs`, use **Deploy > Manage deployments > Edit > Version: New version** so the
same URL serves the new code (a *new* deployment gets a new URL).

## Limits and safety

- Gmail sends about 1,500 emails a day from a Workspace account: plenty here.
- A hidden field catches bots; the same email + platform within 10 minutes, or a request already on the
  sheet, sends nothing again. Cells can't start with `=`, `+`, `-` or `@`, so a sign-up can't plant a formula.
- The website never sends the email address to analytics.
- What is collected and why: `/privacy#testers`. Set `tester_retention` in `_data/legal.yml`.
