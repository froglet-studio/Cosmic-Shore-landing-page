#!/usr/bin/env python3
"""Copy the game's vessels and game modes onto the website, from the game repo itself.

    python3 tools/sync_game_content.py --game ../cosmic-shore            # write _data + images
    python3 tools/sync_game_content.py --game ../cosmic-shore --check    # exit 1 if the site is stale

What it reads (game repo `froglet-studio/cosmic-shore`, any branch; bleeding-edge is the live one):
  - the Hangar roster, Assets/_SO_Assets/Classes/SO_Classlist_Classes.asset: every vessel a player
    can pick, in the game's order, with each class's Name, Description and PreviewImage (the hangar preview art, 960x540);
  - the game lists Assets/_SO_Assets/Games/GameLists/{ArcadeGames,ArenaGames,MissionGames}.asset:
    every mode card in each menu, with its DisplayName, Description, Vessels, player range and
    CardBackground (the /cardart render).

What it writes (this repo):
  - _data/vessels.yml and _data/modes.yml, which index.html renders;
  - assets/vessels/<slug>.webp (960x540) and assets/modes/<slug>.webp (768x510): the large view;
  - assets/vessels/thumbs/<slug>.webp (256x144) and assets/modes/thumbs/<slug>.webp (192x128): the pickers.

Card text is the game's own. Each card shows a "blurb": the description's opening sentences, cut
at the first sentence end past ~90 characters. _data/content_overrides.yml replaces a blurb where the
game's text is a placeholder or missing, and `trailers` gives a vessel a YouTube trailer (it is read
here, never written).
"""
import argparse
import glob
import io
import os
import re
import sys

import yaml
from PIL import Image

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VESSEL_SIZE, VESSEL_THUMB = (960, 540), (256, 144)
MODE_SIZE, MODE_THUMB = (768, 510), (192, 128)
BLURB_LIMIT = 240


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def load_asset(path):
    """The top-level fields of a Unity .asset's MonoBehaviour, as a dict.

    Read by hand rather than with a YAML parser: Unity wraps long plain strings onto continuation
    lines without quoting them, and a continuation line holding ": " is not valid YAML, so PyYAML
    refuses descriptions the editor reads fine. Values come back as: a string (quotes and \\uXXXX
    escapes resolved, wrapped lines joined), an int, a {fileID, guid} reference, or a list of them.
    """
    fields, key, buf = {}, None, []
    ref_re = re.compile(r"\{fileID: (-?\d+)(?:, guid: (\w+))?")

    def scalar(raw):
        raw = raw.strip()
        if raw.startswith('"') and raw.endswith('"') and len(raw) > 1:
            raw = yaml.safe_load(raw)                # a quoted scalar alone is valid YAML
        elif raw.startswith("'") and raw.endswith("'") and len(raw) > 1:
            raw = raw[1:-1].replace("''", "'")
        m = ref_re.match(raw)
        if m:
            return {"fileID": int(m.group(1)), "guid": m.group(2)}
        if re.fullmatch(r"-?\d+", raw):
            return int(raw)
        return raw

    def flush():
        if key is None:
            return
        if buf and isinstance(buf, list) and buf and buf[0] == "__list__":
            fields[key] = [scalar(x) for x in buf[1:]]
        else:
            fields[key] = scalar(" ".join(x.strip() for x in buf)) if buf else ""

    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        m = re.match(r"^  ([A-Za-z_][\w]*):(?: (.*))?$", line)
        if m:
            flush()
            key, rest = m.group(1), m.group(2)
            buf = [rest] if rest else []
        elif key and line.startswith("  - ") and (not buf or buf[0] == "__list__"):
            if not buf:
                buf = ["__list__"]
            buf.append(line[4:])
        elif key and line.startswith("    ") and buf and buf[0] != "__list__":
            buf.append(line)
        elif key and line.startswith("    "):
            pass                                     # a nested mapping's body: not needed here
        elif line.startswith("---") or not line.startswith(" "):
            flush()
            key, buf = None, []
    flush()
    return fields


class GuidIndex:
    def __init__(self, root):
        self.map = {}
        for meta in glob.glob(os.path.join(root, "Assets", "**", "*.meta"), recursive=True):
            with open(meta, encoding="utf-8", errors="replace") as f:
                for line in f:
                    if line.startswith("guid: "):
                        self.map[line[6:].strip()] = meta[:-5]
                        break

    def path(self, ref):
        if isinstance(ref, dict) and ref.get("guid"):
            return self.map.get(ref["guid"])
        return None


def blurb(text):
    """The description's opening sentences: at least ~90 characters (so "Urchins only." is never a
    card's whole text), stopping at the first sentence end past that; one long run is cut at a word."""
    text = " ".join((text or "").split())
    out = ""
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        out = (out + " " + sentence).strip()
        if len(out) >= 90:
            break
    if len(out) > BLURB_LIMIT:
        out = out[:BLURB_LIMIT].rsplit(" ", 1)[0].rstrip(",;:-") + "…"
    return out


def seats(description):
    m = re.match(r"\s*(Two|Three|Four) seats", description or "")
    return {"Two": 2, "Three": 3, "Four": 4}[m.group(1)] if m else 1


def render(src, dest, size, quality=78):
    im = Image.open(src).convert("RGB")
    # Cover-fit: fill the box, crop the overflow from the centre.
    scale = max(size[0] / im.width, size[1] / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    left, top = (im.width - size[0]) // 2, (im.height - size[1]) // 2
    im = im.crop((left, top, left + size[0], top + size[1]))
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    return dest, buf.getvalue()


def build(game):
    idx = GuidIndex(game)
    overrides = yaml.safe_load(open(os.path.join(SITE, "_data", "content_overrides.yml"))) or {}
    files = {}

    roster = load_asset(os.path.join(game, "Assets/_SO_Assets/Classes/SO_Classlist_Classes.asset"))
    class_names = {}
    vessels = []
    for ref in next(v for k, v in roster.items() if isinstance(v, list) and v and isinstance(v[0], dict)):
        path = idx.path(ref)
        if not path:
            continue
        c = load_asset(path)
        name = str(c.get("Name", "")).strip()
        class_names[ref["guid"]] = name
        s = slug(name)
        desc = " ".join(str(c.get("Description") or "").split())
        art = idx.path(c.get("PreviewImage"))
        image = thumb = None
        if art and os.path.exists(art):
            dest, data = render(art, f"assets/vessels/{s}.webp", VESSEL_SIZE)
            files[dest] = data
            image = "/" + dest
            dest, data = render(art, f"assets/vessels/thumbs/{s}.webp", VESSEL_THUMB, quality=72)
            files[dest] = data
            thumb = "/" + dest
        vessels.append({
            "name": name,
            "slug": s,
            "seats": seats(desc),
            "blurb": overrides.get("vessels", {}).get(name) or blurb(desc),
            "image": image,
            "thumb": thumb,
            "trailer": (overrides.get("trailers") or {}).get(name),
        })

    # Every class, not just the roster, so a mode naming a hull outside the Hangar still lists it.
    for path in glob.glob(os.path.join(game, "Assets/_SO_Assets/Classes/SO_Class_*.asset")):
        guid = next(g for g, p in idx.map.items() if p == path)
        class_names.setdefault(guid, str(load_asset(path).get("Name", "")).strip())

    modes = {}
    for key, list_name in (("arcade", "ArcadeGames"), ("arena", "ArenaGames"), ("missions", "MissionGames")):
        game_list = load_asset(os.path.join(game, f"Assets/_SO_Assets/Games/GameLists/{list_name}.asset"))
        refs = next(v for k, v in game_list.items() if isinstance(v, list) and v and isinstance(v[0], dict))
        rows = []
        for ref in refs:
            path = idx.path(ref)
            if not path:
                continue
            g = load_asset(path)
            name = str(g.get("DisplayName") or "").strip()
            if not name:
                continue
            s = slug(name)
            art = idx.path(g.get("CardBackground"))
            image = thumb = None
            if art and os.path.exists(art):
                dest, data = render(art, f"assets/modes/{s}.webp", MODE_SIZE)
                files[dest] = data
                image = "/" + dest
                dest, data = render(art, f"assets/modes/thumbs/{s}.webp", MODE_THUMB, quality=72)
                files[dest] = data
                thumb = "/" + dest
            lo, hi = g.get("MinPlayersAllowed"), g.get("MaxPlayersAllowed")
            rows.append({
                "name": name,
                "slug": s,
                "blurb": overrides.get("modes", {}).get(name) or blurb(str(g.get("Description") or "")),
                "vessels": [class_names[v["guid"]] for v in (g.get("Vessels") or [])
                            if isinstance(v, dict) and v.get("guid") in class_names],
                "players": (f"{lo}–{hi}" if lo != hi else str(lo)) if lo and hi else None,
                "image": image,
                "thumb": thumb,
            })
        modes[key] = rows

    header = ("# GENERATED by tools/sync_game_content.py from the game repo - do not edit by hand.\n"
              "# Fix a blurb in _data/content_overrides.yml, or the text in the game, then re-run.\n")
    files["_data/vessels.yml"] = (header + yaml.safe_dump(vessels, sort_keys=False, allow_unicode=True,
                                                          width=1000)).encode()
    files["_data/modes.yml"] = (header + yaml.safe_dump(modes, sort_keys=False, allow_unicode=True,
                                                        width=1000)).encode()
    return files


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--game", required=True, help="path to a checkout of froglet-studio/cosmic-shore")
    ap.add_argument("--check", action="store_true", help="report drift, write nothing")
    args = ap.parse_args()
    files = build(os.path.abspath(args.game))

    stale = []
    for rel, data in files.items():
        path = os.path.join(SITE, rel)
        old = open(path, "rb").read() if os.path.exists(path) else None
        if old != data:
            stale.append(rel)
            if not args.check:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "wb") as f:
                    f.write(data)
    # Images for vessels or modes the game no longer lists.
    for folder in ("assets/vessels", "assets/vessels/thumbs", "assets/modes", "assets/modes/thumbs"):
        for path in glob.glob(os.path.join(SITE, folder, "*.webp")):
            rel = os.path.relpath(path, SITE)
            if rel not in files:
                stale.append(rel + " (no longer in the game)")
                if not args.check:
                    os.remove(path)

    if args.check:
        if stale:
            print("STALE - re-run without --check:\n  " + "\n  ".join(stale))
            return 1
        print(f"up to date ({len(files)} files)")
        return 0
    print(f"wrote {len(stale)} of {len(files)} files" + ("" if not stale else ":\n  " + "\n  ".join(stale)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
