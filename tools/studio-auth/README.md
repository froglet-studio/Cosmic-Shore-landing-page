# Froglet Studio sign-in

Froglet Studio (www.froglet.games/admin/) is where each developer edits their profile (`_team/<name>.md`,
shown at `/team/<name>/`) and writes blog posts. It has no server: every save is a commit made through
the GitHub API with the developer's own sign-in. Who may use it: anyone whose GitHub account is the
`github:` of a file in `_team/`. The Studio only opens and saves that person's profile, and posts with
`author: <their name>`.

There are two ways to sign in. The first works today with no setup.

## 1. A GitHub token (no setup)

Each developer makes their own token once, and pastes it on the Studio's sign-in screen:

1. GitHub > Settings > Developer settings > **Fine-grained tokens** > Generate new token
   (https://github.com/settings/personal-access-tokens/new).
2. Resource owner: **froglet-studio**. Repository access: **Only select repositories** >
   **Cosmic-Shore-landing-page**.
3. Permissions > Repository permissions > **Contents: Read and write**. Nothing else.
4. Pick an expiry (90 days is sensible), generate, and paste it into the Studio.

The token stays in that browser (until the tab closes, or until sign-out if "Remember on this device" is
ticked) and is only ever sent to api.github.com. If the organisation requires approval of fine-grained
tokens, an org owner approves it once under Organization settings > Personal access tokens.

## 2. "Sign in with GitHub" (about 15 minutes, once)

A tiny Cloudflare Worker (`worker.js`, free plan) swaps the GitHub sign-in for a token. It uses a
**GitHub App**, so the token can only read and write files in the website repo, and only for the
person who signed in. It stores nothing.

1. **Create the GitHub App**: github.com/organizations/froglet-studio/settings/apps > New GitHub App.
   - Name: `Froglet Studio`. Homepage URL: `https://www.froglet.games`.
   - Callback URL: `https://<your-worker>.workers.dev/callback` (fill in after step 2, or edit later).
   - Untick **Webhook > Active**.
   - Repository permissions: **Contents: Read and write**. (Metadata: Read is added automatically.)
   - Where can it be installed: **Only on this account**. Create it.
   - Note the **Client ID**, then **Generate a new client secret** and copy it.
   - **Install App** (left menu) > froglet-studio > **Only select repositories** > Cosmic-Shore-landing-page.
2. **Create the Worker**: Cloudflare dashboard > Workers & Pages > Create > Worker > name it (e.g.
   `froglet-studio-auth`) > Deploy > Edit code > replace everything with `worker.js` > Deploy.
3. Worker > Settings > **Variables and Secrets**:
   - `GITHUB_CLIENT_ID` = the App's Client ID (Text)
   - `GITHUB_CLIENT_SECRET` = the client secret (**Secret**)
   - `ALLOWED_ORIGIN` = `https://www.froglet.games` (Text)
4. Put the Worker's address (e.g. `https://froglet-studio-auth.<you>.workers.dev`) in the GitHub App's
   Callback URL as `…/callback`, and in `_data/studio.yml` as `auth_url` (no trailing slash). Push.

The sign-in screen then shows **Sign in with GitHub**; the token option stays as a fallback.

## Good to know

- **Write access is the real gate.** The Studio keeps each developer to their own files, but anyone with
  write access to this repo can still edit any file on GitHub directly. Keep the repo's collaborator list
  to the people who should publish on www.froglet.games.
- **Branch protection.** The Studio commits straight to `main`. If `main` is ever set to require pull
  requests, the Studio's saves will be refused until it is changed to open pull requests instead.
- **Pictures** a developer uploads go to `assets/team/<name>/` (profile) or `assets/blog/` (posts). A
  replaced photo or banner is deleted from the repo when the new one is published.
