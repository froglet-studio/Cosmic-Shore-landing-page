#!/usr/bin/env python3
"""Put the Fleet Codex on the website, and the game lists the Arcade and Arena pages draw, from the game repo.

    python3 tools/sync_fleet_codex.py --game ../cosmic-shore             # rebuild /fleet-codex/ and _data/games.yml
    python3 tools/sync_fleet_codex.py --from-dir <a built codex folder>  # take fleet.json + img/ already built
    python3 tools/sync_fleet_codex.py --check                            # exit 1 if _data/games.yml is stale

The Fleet Codex is the studio's book of the fleet (game repo Docs/FleetCodex/): every vessel, its four
abilities and their upgrades, the games it teaches, its controls and its recent changes, read from the
shipped assets by Tools/Build/fleet_codex.py. This site draws it itself on the Vessels page (#codex, js/codex.js)
from fleet-codex/fleet.json and fleet-codex/img/, so the data is rebuilt here from the game, never edited by hand.
/fleet-codex/ only redirects to /vessels/#codex: the studio's artifact page is not served (Shombith, 2026-11-23).

What it writes (this repo):
  - fleet-codex/: fleet.json and img/ (every image the data names), and index.html, a redirect to /vessels/#codex;
  - _data/fleet.yml: every vessel the codex lists, in its order, with a blurb and the largest picture there is
    (the site's 960x540 hangar art from tools/sync_game_content.py, else the codex's own preview);
  - _data/games.yml: every arcade and arena card in the codex, one entry per game mode, with its element,
    the hulls on the card, its intensities, a short blurb and its card art (fleet-codex/img/cards/).

Blurbs are the game's own card text, cut at a sentence end. _data/content_overrides.yml `modes:`
replaces one where the game's text is a placeholder.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

import yaml

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(SITE, "fleet-codex")
GAMES = os.path.join(SITE, "_data", "games.yml")
FLEET = os.path.join(SITE, "_data", "fleet.yml")
ELEMENTS = ["Time", "Charge", "Mass", "Space"]
BLURB_LIMIT = 150
# The Arena page's order: Regatta teaches Time, Broadside Charge, Brood Rush Mass and Space together.
ARENA_ORDER = ["Regatta", "Broadside", "BroodRush", "AstroLeague"]

def blurb(text):
    text = re.sub(r"\s+", " ", text.replace(" - ", " – ")).strip()
    out = ""
    for s in re.split(r"(?<=[.!?])\s+", text):
        if len(out) >= 70 and len(out) + len(s) > BLURB_LIMIT:
            break
        out += (" " if out else "") + s
    return out


def intensity(card):
    lo, hi = (card.get("intensity") or [0, 0])[:2]
    return "I%d–I%d" % (lo, hi) if lo and hi and lo != hi else ("I%d" % lo if lo else "")


def games_from(fleet, overrides):
    """One entry per game mode across every vessel's cards, with every hull that carries that card."""
    by_mode = {}
    for v in fleet["vessels"]:
        for c in v.get("cards", []):
            g = by_mode.setdefault(c["mode"], dict(card=c, hulls=[], vessel=v))
            if v["name"] not in g["hulls"]:
                g["hulls"].append(v["name"])
    arcade, arena = [], []
    for mode, g in by_mode.items():
        c = g["card"]
        rosters = c.get("rosters") or []
        if "ArenaGames" not in rosters and "ArcadeGames" not in rosters:
            continue
        els = [e for e in c.get("elements") or [] if e in ELEMENTS]
        text = overrides.get(c["name"]) or c.get("description") or ""
        item = {
            "mode": mode, "name": c["name"], "element": els[0] if els else "Party", "elements": els or ["Party"],
            "hulls": g["hulls"], "intensity": intensity(c), "blurb": blurb(text),
            # a card with no art of its own shows its first hull in the default livery, never a blank tile
            "image": "/fleet-codex/" + c["art"] if c.get("art") else hull_image(g["vessel"], fleet),
        }
        if "ArenaGames" in rosters:
            item["description"] = re.sub(r"\s+", " ", text.replace(" - ", " – ")).strip()
            arena.append(item)
        else:
            arcade.append(item)
    arcade.sort(key=lambda g: ((ELEMENTS + ["Party"]).index(g["element"]), g["name"]))
    arena.sort(key=lambda g: (ARENA_ORDER.index(g["mode"]) if g["mode"] in ARENA_ORDER else 99, g["name"]))
    return {"arcade": arcade, "arena": arena}


def hull_image(v, fleet):
    """The codex picture of a hull for a card: the default domain's livery (an opaque scene, readable on any theme),
    else the plain preview (a transparent hull that disappears on a dark card), else nothing."""
    dom = (fleet.get("palette") or {}).get("default", "Jade")
    for rel in ((v.get("domainImages") or {}).get(dom), v.get("image")):
        if rel and os.path.exists(os.path.join(OUT, rel)):
            return "/fleet-codex/" + rel
    return ""


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def fleet_from(fleet, overrides_all):
    """The codex's listed vessels (those with an element map), crews last, as the Vessels page shows them."""
    vo = overrides_all.get("vessels") or {}
    trailers = overrides_all.get("trailers") or {}
    listed = [v for v in fleet["vessels"] if (v.get("status") or {}).get("hasMap")]
    listed.sort(key=lambda v: (((v.get("crew") or {}).get("seats") or 1) > 1, v.get("id", 0)))
    out = []
    for v in listed:
        sl = slug(v["name"])
        big, thumb = "/assets/vessels/%s.webp" % sl, "/assets/vessels/thumbs/%s.webp" % sl
        codex_img = hull_image(v, fleet)
        image = big if os.path.exists(SITE + big) else codex_img
        crew = v.get("crew") or {}
        item = {"key": v["key"], "name": v["name"], "seats": crew.get("seats") or 1, "crew": crew.get("names") or [],
                "blurb": blurb(vo.get(v["name"]) or v.get("description") or ""), "image": image,
                "thumb": thumb if os.path.exists(SITE + thumb) else image}
        if trailers.get(v["name"]):
            item["trailer"] = trailers[v["name"]]
        out.append(item)
    return out


def render(data, fleet):
    head = ("# GENERATED by tools/sync_fleet_codex.py from the Fleet Codex (game commit %s, %s); do not edit by hand.\n"
            "# Card text: the game's own; _data/content_overrides.yml `modes:` replaces a placeholder.\n"
            % (fleet.get("commit", "?"), fleet.get("generated", "?")))
    return head + yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=140)


REDIRECT = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Fleet Codex — Cosmic Shore</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="https://www.froglet.games/vessels/#codex">
<meta http-equiv="refresh" content="0; url=/vessels/#codex">
<script>location.replace('/vessels/#codex' + (location.hash.length > 1 ? '=' + location.hash.slice(1) : ''));</script>
</head><body><p>The Fleet Codex is on the <a href="/vessels/#codex">Vessels page</a>.</p></body></html>
"""


def missing_images(fleet):
    """Every img/ path fleet.json names that is not in fleet-codex/ (the Vessels page would draw it broken)."""
    refs = set(re.findall(r'"(img/[^"]+)"', json.dumps(fleet)))
    return sorted(r for r in refs if not os.path.exists(os.path.join(OUT, r)))


def copy_codex(src, game):
    """src: a folder holding fleet.json and img/ (fleet_codex.py --out). game: unused, kept for the call sites."""
    os.makedirs(OUT, exist_ok=True)
    if os.path.isdir(os.path.join(OUT, "img")):
        shutil.rmtree(os.path.join(OUT, "img"))
    shutil.copytree(os.path.join(src, "img"), os.path.join(OUT, "img"))
    shutil.copy(os.path.join(src, "fleet.json"), os.path.join(OUT, "fleet.json"))
    open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(REDIRECT)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--game", help="a checkout of the game repo; runs its Tools/Build/fleet_codex.py")
    ap.add_argument("--from-dir", help="a codex already built (fleet.json + img/), e.g. fleet_codex.py --out")
    ap.add_argument("--check", action="store_true", help="exit 1 if _data/games.yml does not match fleet-codex/fleet.json")
    a = ap.parse_args()
    overrides_all = yaml.safe_load(open(os.path.join(SITE, "_data", "content_overrides.yml"))) or {}
    overrides = overrides_all.get("modes") or {}
    if a.game and not a.check:
        build = os.path.join(SITE, ".codex-build")
        subprocess.run([sys.executable, os.path.join(a.game, "Tools/Build/fleet_codex.py"), "--out", build], check=True, cwd=a.game)
        copy_codex(build, a.game)
        shutil.rmtree(build, ignore_errors=True)
    elif a.from_dir and not a.check:
        copy_codex(a.from_dir, None)
    fleet = json.load(open(os.path.join(OUT, "fleet.json"), encoding="utf-8"))
    gone = missing_images(fleet)
    if gone:
        print("fleet-codex/ is missing %d image(s) fleet.json names, e.g. %s" % (len(gone), ", ".join(gone[:5])), file=sys.stderr)
        if a.check:
            return 1
    outs = {GAMES: render(games_from(fleet, overrides), fleet), FLEET: render(fleet_from(fleet, overrides_all), fleet)}
    if a.check:
        stale = [os.path.relpath(p, SITE) for p, t in outs.items() if not os.path.exists(p) or open(p, encoding="utf-8").read() != t]
        print("stale: %s; run tools/sync_fleet_codex.py" % ", ".join(stale) if stale else "games.yml and fleet.yml are current")
        return 1 if stale else 0
    for p, t in outs.items():
        open(p, "w", encoding="utf-8").write(t)
    g, f = yaml.safe_load(outs[GAMES]), yaml.safe_load(outs[FLEET])
    print("wrote _data/games.yml (%d arcade, %d arena games) and _data/fleet.yml (%d vessels)" % (len(g["arcade"]), len(g["arena"]), len(f)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
