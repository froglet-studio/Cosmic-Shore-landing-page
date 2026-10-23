# Cosmic Shore — Website

The official site for **Cosmic Shore**, the party game for pilots by Froglet Games: [www.froglet.games](https://www.froglet.games).

## How it's built and deployed

GitHub Pages builds the site with **Jekyll** on every push to `main`. There is no Action to maintain and nothing to install for a normal edit; the `CNAME` file points the custom domain at Pages.

- Pages with front matter (the `---` block at the top) use the shared layout in `_layouts/` and the header, footer and analytics in `_includes/`.
- Files without front matter (images, scripts) are copied as they are.
- A page at `privacy.html` is served at `/privacy`.

## Project structure

```
├── index.html            # Home page (keeps its own head; uses the shared header, footer, cards)
├── privacy.html          # /privacy        — privacy policy
├── support.html          # /support        — contact, report a player, report a bug
├── delete-my-data.html   # /delete-my-data — account deletion (the Google Play deletion URL)
├── team.html             # /team/          — Know Your Developers (one card per _team/ file)
├── _team/                # one file per developer: their page at /team/<name>/
├── admin/                # /admin/ — Froglet Studio, where developers edit their page and write posts
├── blog/index.html       # /blog/          — dev blog index (RSS at /blog/feed.xml)
├── play.html             # /play           — the browser Toybox loader (dark until _data/toybox.yml has a build_root)
├── _data/toybox.yml      # where the Toybox build lives on the CDN, and the /play UTM campaign
├── _posts/               # published blog posts (Markdown)
├── _data/stores.yml      # store IDs: Steam, App Store, Google Play, TestFlight, Discord
├── _data/legal.yml       # legal entity, contact emails, response times, retention periods
├── _data/forms.yml       # where the contact and test sign-up forms send (tools/site-forms/)
├── tools/                # sync_game_content.py (vessels, modes), site-forms/ (the forms' Google script), studio-auth/ (Studio sign-in)
├── _layouts/             # default page layout and blog post layout
├── _includes/            # topbar, footer, analytics, page hero, store cards, post card
├── css/design-3-hyperdrive.css   # the site's design (tokens, home page)
├── css/pages.css                 # subpage components built on the same tokens
├── js/site.js                    # star field, scroll reveal, topbar, mobile menu, copy buttons
└── assets/                       # branding, icons, screenshots
```

## Common edits

**Publish a blog post.** Add `_posts/YYYY-MM-DD-your-slug.md`:

```markdown
---
title: Welcome to the Toybox
title_html: Welcome to the <span class="gradient-text">Toybox</span>   # optional, for the hero
description: One or two sentences for the card and for link previews.
category: Dev Log          # Dev Log, Design or Patch Notes (sets the chip colour)
role: Design               # shown under the author name
image: /assets/images/Image%20Sequence_021_0012.jpg
image_alt: A large green crystal next to a vessel
---

Your post in Markdown.
```

The post appears at `/blog/your-slug/`. The **Blog** link in the menu and footer, and the home page's blog section, appear automatically once the first post is published. **This repo is public, so drafts don't live here**: anything committed, on any branch, can be read on GitHub. Write drafts in the *Cosmic Shore blog drafts* folder on Google Drive (Markdown, same front matter), and add the file to `_posts/` only on the day it is published. `_drafts/` is git-ignored so a local draft is never pushed by accident.

**Turn on a store button.** Fill in the value in `_data/stores.yml`: `steam_app_id`, `app_store_id` (plus `app_store_pt`) or `google_play_live: true`. That card switches from "Coming soon" to a live, UTM-tagged link. The tags follow `Docs/Analytics/utm-conventions.md` in the game repo.

**Turn on the browser Toybox.** It plays in the home page's **Play** section (`_includes/toybox-player.html`, the menu's Play tab scrolls there; `/play` forwards to it). Set `build_root` in `_data/toybox.yml` to the CDN folder the game's upload step writes, e.g. `https://play.froglet.games/toybox`. That folder must hold `latest.json` (`loader`, `data`, `framework`, `code`, `streamingAssets`, `version`, `bytes`) and the `Build/` files. It must also be served with the right `Content-Encoding`/`Content-Type` for Unity's compressed files and with CORS allowing `https://www.froglet.games`. `/play` then shows the launch button, and "Play in Browser" appears in the menu and as a fourth store card. While `build_root` is empty, `/play` says "Taking Off Soon", is `noindex` and stays out of the menu and sitemap.

**Update the vessels and game modes.** The home page's fleet and mode cards are copied from the game repo: run `python3 tools/sync_game_content.py --game ../cosmic-shore` (a checkout of `bleeding-edge`) and commit `_data/vessels.yml`, `_data/modes.yml` and `assets/vessels|modes/`. `--check` reports whether the site has fallen behind. Fix a placeholder blurb in `_data/content_overrides.yml`, or better, in the game; `trailers` there gives a vessel a Watch the trailer button.

**Profiles and posts: Froglet Studio.** Each developer edits their own page and writes blog posts at **www.froglet.games/admin/** (sign-in: `tools/studio-auth/README.md`). Profiles are `_team/<name>.md` (front matter: name, github, title, bio, location, accent, photo, banner, favourite_vessel, links, pins; the body is their About), published at `/team/<name>/` with `_layouts/profile.html`, and listed on `/team/` in `order`. A post's `author:` is a `_team` file name, which links the byline to that page. To add a developer, copy a file in `_team/`, change `name`, `github` and `order`, and they can sign in.

**The forms (test sign-ups and contact).** "Request test access" on the Windows, iPhone and Android cards (`_includes/tester-signup.html`) and the contact form behind the Support and Delete My Data buttons (`_includes/contact-form.html`) both send from the site itself, through one Google Apps Script that emails the team: setup in `tools/site-forms/README.md`, then put its URL in `_data/forms.yml` as `endpoint`. Until then the forms say they are not open yet; nothing opens the visitor's email app.

**Fill a legal placeholder.** Pink boxed text on `/privacy`, `/support` or `/delete-my-data` is a value missing from `_data/legal.yml`. Fill the value there and the placeholder disappears. A few markers that only counsel can resolve are written inline in the page (search for `class="ph"`).

## Preview a branch before merging

GitHub Pages only publishes `main`. **Cloudflare Pages** builds every branch and pull request at its own
address, so a change can be checked before it goes live. Set it up once:

1. Cloudflare dashboard > **Workers & Pages** > Create > **Pages** > **Connect to Git** > GitHub >
   `froglet-studio/Cosmic-Shore-landing-page`.
2. Production branch: `main`. Framework preset: **Jekyll**. Build command: `jekyll build`.
   Build output directory: `_site`.
3. Environment variables (Production and Preview): `LANG` = `C.UTF-8`.
4. Save and Deploy. Each branch then appears at `https://<branch>.<project>.pages.dev`, and the address is
   posted on the pull request.

The `Gemfile` pins the same Jekyll and plugins GitHub Pages uses, so a preview looks like the live site.
The preview is only for looking: www.froglet.games still comes from GitHub Pages.

**Testing Froglet Studio on a preview:** open `/admin/?branch=<the branch name>`. An orange bar says
"Test mode", and every save goes to that branch instead of `main`, so the live site is never touched.
Without `?branch=`, the Studio saves to `main` (the live site) even on a preview.

## Preview locally

```sh
bundle install
LANG=C.UTF-8 bundle exec jekyll serve      # http://localhost:4000
```

## Links

- **Community**: [Discord](https://discord.gg/wNfYVbJ9dR)
- **iOS beta**: [TestFlight](https://testflight.apple.com/join/9ReKxeGf)
