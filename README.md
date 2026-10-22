# Cosmic Shore — Website

The official site for **Cosmic Shore**, the party game for pilots by Froglet Games: [www.froglet.games](https://www.froglet.games).

## How it's built and deployed

GitHub Pages builds the site with **Jekyll** on every push to `main`. There is no Action to maintain and nothing to install for a normal edit; the `CNAME` file points the custom domain at Pages.

- Pages with front matter (the `---` block at the top) use the shared layout in `_layouts/` and the header, footer and analytics in `_includes/`.
- Files without front matter (images, the old `design-*.html` drafts) are copied as they are.
- A page at `privacy.html` is served at `/privacy`.

## Project structure

```
├── index.html            # Home page (keeps its own head; uses the shared header, footer, cards)
├── privacy.html          # /privacy        — privacy policy
├── support.html          # /support        — contact, report a player, report a bug
├── delete-my-data.html   # /delete-my-data — account deletion (the Google Play deletion URL)
├── blog/index.html       # /blog/          — dev blog index (RSS at /blog/feed.xml)
├── play.html             # /play           — the browser Toybox loader (dark until _data/toybox.yml has a build_root)
├── _data/toybox.yml      # where the Toybox build lives on the CDN, and the /play UTM campaign
├── _posts/               # published blog posts (Markdown)
├── _drafts/              # unpublished drafts
├── _data/stores.yml      # store IDs: Steam, App Store, Google Play, TestFlight, Discord
├── _data/legal.yml       # legal entity, contact emails, response times, retention periods
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

The post appears at `/blog/your-slug/`. The **Blog** link in the menu and footer, and the home page's blog section, appear automatically once the first post is published. To publish a draft, move it from `_drafts/` to `_posts/` and add the date to its file name.

**Turn on a store button.** Fill in the value in `_data/stores.yml`: `steam_app_id`, `app_store_id` (plus `app_store_pt`) or `google_play_live: true`. That card switches from "Coming soon" to a live, UTM-tagged link. The tags follow `Docs/Analytics/utm-conventions.md` in the game repo.

**Turn on the browser Toybox.** It plays in the home page's **Play** section (`_includes/toybox-player.html`, the menu's Play tab scrolls there; `/play` forwards to it). Set `build_root` in `_data/toybox.yml` to the CDN folder the game's upload step writes, e.g. `https://play.froglet.games/toybox`. That folder must hold `latest.json` (`loader`, `data`, `framework`, `code`, `streamingAssets`, `version`, `bytes`) and the `Build/` files. It must also be served with the right `Content-Encoding`/`Content-Type` for Unity's compressed files and with CORS allowing `https://www.froglet.games`. `/play` then shows the launch button, and "Play in Browser" appears in the menu and as a fourth store card. While `build_root` is empty, `/play` says "Taking Off Soon", is `noindex` and stays out of the menu and sitemap.

**Update the vessels and game modes.** The home page's fleet and mode cards are copied from the game repo: run `python3 tools/sync_game_content.py --game ../cosmic-shore` (a checkout of `bleeding-edge`) and commit `_data/vessels.yml`, `_data/modes.yml` and `assets/vessels|modes/`. `--check` reports whether the site has fallen behind. Fix a placeholder blurb in `_data/content_overrides.yml`, or better, in the game.

**Test sign-ups.** "Request test access" on the Windows, iPhone and Android cards opens a form (`_includes/tester-signup.html`). Its backend is a Google Apps Script that emails Caleb and Shombith an Approve link and sends the tester a confirmation on approval: setup in `tools/tester-signup/README.md`, then put its URL in `_data/testers.yml` as `endpoint`. Until then the form opens the visitor's email app addressed to `fallback_to`.

**Fill a legal placeholder.** Pink boxed text on `/privacy`, `/support` or `/delete-my-data` is a value missing from `_data/legal.yml`. Fill the value there and the placeholder disappears. A few markers that only counsel can resolve are written inline in the page (search for `class="ph"`).

## Preview locally

```sh
gem install jekyll -v 3.10.0 jekyll-feed webrick
jekyll serve            # http://localhost:4000
jekyll serve --drafts   # include _drafts/
```

## Links

- **Community**: [Discord](https://discord.gg/wNfYVbJ9dR)
- **iOS beta**: [TestFlight](https://testflight.apple.com/join/9ReKxeGf)
