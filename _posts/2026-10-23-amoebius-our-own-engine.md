---
title: "Amoebius: building our own engine, one script at a time"
title_html: 'Amoebius: building <span class="gradient-text">our own engine</span>'
description: "Why we started Amoebius, Froglet's own game engine, what it is for, and what it can already do: the real Cosmic Shore, booting and playing, without Unity."
category: Dev Log
author: shombith
image: /assets/blog/amoebius/launcher-start.webp
image_alt: "The Amoebius launcher's Play page, with the START and START ONLINE buttons"
---

Cosmic Shore is made in Unity, and it will ship from Unity. But since June there has been a second way to run it: **Amoebius**, an engine we are writing ourselves. This post is about why I started it, what it is for, and what it does today.

## Why I started it

Almost all of our work now goes through Claude sessions. An agent writes the change, and then a person opens Unity, waits for it to import, presses Play, watches, and pastes the errors back. The agent can write code all day. It can't open the editor, look at the screen, or play a match. So every change waits on one of us.

I wanted a loop where that wait goes away: the agent builds the game, runs it, looks at it, drives it, reads the errors and fixes them, with no human in the middle. You can't get that loop out of an engine you don't own. So the idea was simple, and a bit crazy: rebuild the engine under the game.

When we wrote the plan down in June, the goal was this:

> Remake the entire game, wholly ours, without any dependency on Unity or anything else that prevents you from developing in your own loop without a human's involvement. We want everything replicated. Lose nothing.

Owning the stack matters for us beyond the loop. An engine we write is one we can read top to bottom, fix ourselves, and shape around one game.

## What Amoebius is

Amoebius is a C# engine on .NET 10 that lives next to the game, in the same repository. The important part is what it does *not* do: it does not rewrite Cosmic Shore. It compiles the game's own scripts, the same `Assets/_Scripts` that Unity builds, live, and runs them. It reads Unity's own scene, prefab and asset files. When someone changes the game in Unity, Amoebius runs that change too.

It started under the name Prisma; we renamed it Amoebius on October 9.

<figure>
  <img src="/assets/blog/amoebius/launcher-start.webp" alt="The Amoebius launcher's Play page, with START and START ONLINE" loading="lazy">
  <figcaption>The Amoebius launcher. START pulls the branch, builds the game and runs it offline; START ONLINE signs in to our live UGS project, as the Unity build does.</figcaption>
</figure>

You start it from the launcher, `Amoebius.exe`. Its pages cover the whole working day: PLAY, BUILD, PROJECT, GIT, an AGENT page where Claude works inside the engine, an EDITOR with tools, data and models, TRACKS (a record of every run's problems, performance and audio), a BOARD of open bugs and tasks, SETTINGS and a CONSOLE.

## What it can do today

As of our last measurement in October:

- **The game runs unmodified.** All 2,090 of the game's script files compile and run as they are. A boot goes Bootstrap, then sign-in, then the main menu, then a match, with zero errors.
- **It reads Unity's files.** 36 build scenes load straight from Unity's scene files. Our asset tool, `cs-asset`, can edit those files and write them back byte for byte, which we checked across 2,030 of them.
- **It draws the game.** OpenGL 3.3 (and GLES 3.0 for phones), with MSAA, ACES tone mapping, bloom, skyboxes, skinned meshes and our prism fields.
- **It sounds like the game.** FMOD with our real sound banks.
- **It plays online.** Through Unity Gaming Services Lobby and Relay, over a UDP transport we wrote ourselves.
- **It runs on Windows and Linux**, builds an Android APK, and exports for iOS.
- **It is tested.** About 1,600 engine tests, plus 352 of the game's own edit-mode tests ported over.
- **An agent can drive it.** An MCP server lets Claude build the game, start it, take screenshots, click and steer, find objects and read their live values. That is the loop I wanted.

<figure>
  <img src="/assets/blog/amoebius/menu-in-amoebius.webp" alt="Cosmic Shore's main menu running in Amoebius" loading="lazy">
  <figcaption>Cosmic Shore's main menu, running in Amoebius from the same scene and scripts the Unity build uses.</figcaption>
</figure>

<figure>
  <img src="/assets/blog/amoebius/skim-race-in-amoebius.webp" alt="A Skim Race photo finish running in Amoebius" loading="lazy">
  <figcaption>A Skim Race finish, played in Amoebius.</figcaption>
</figure>

## What it can't do yet

Plenty. This is honest-work-in-progress, not a replacement:

- **Shaders.** 19 of the game's 81 shaders have a proper translation so far. The rest draw with a stand-in.
- **Particles** are not drawn yet.
- **Speed.** The heaviest scene we measure dropped from about 150 ms a frame to 22–26 ms, but that is still slower than Unity.
- **Phones** build, but they aren't where the PC version is.

## Where it's going

We split the road into two milestones:

1. **Gameplay parity, Q2 2027.** Amoebius and the Unity build should be impossible to tell apart in a blind test.
2. **Unity-free development, Q1 2028.** One whole three-week release cycle without anyone opening Unity.

Between here and there sit checkpoints for visuals, physics, audio, UI and text, online play and performance. The foundations, the parity harness that compares the two engines, and a tool that finds which change broke a match are done; the rest are in progress.

To be clear about what this means for the game: **Unity stays the engine Cosmic Shore ships on.** Leaving Unity for good is a long-term goal, not a plan for next year. There are legal questions and a lot of porting between here and there. Until then, Amoebius has one job: to be good for this game, and to make the team faster at making it.

If you build engines, or you are just curious how this works, come say hi on Discord. I'm always happy to talk about it.
