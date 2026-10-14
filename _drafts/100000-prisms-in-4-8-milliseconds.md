---
title: 100,000 Prisms in 4.8 Milliseconds
title_html: 100,000 Prisms in <span class="gradient-text">4.8 Milliseconds</span>
description: Every vessel leaves a trail of prisms, and a busy round piles up tens of thousands of them. Moving them to instanced rendering made them 12.9 times cheaper to draw.
category: Dev Log
role: Engineering
image: /assets/images/Image%20Sequence_018_0003.jpg
image_alt: Thousands of glowing prisms forming a coral-like structure
# DRAFT: written from Docs/PRISM_ECS_MIGRATION.md (status 2026-09-22). To publish, move to
# _posts/YYYY-MM-DD-100000-prisms-in-4-8-milliseconds.md and re-check the numbers.
---

Every vessel in Cosmic Shore paints the sky as it flies. Those trails aren't particles. Each one is a **prism**, a real object other pilots can skim past, crash into or steal. That's what makes the game feel like a shared canvas, and it's also what used to make a busy round crawl.

## Where the frames went

A full three-player Skim Race could end in single-digit frame rates. When we profiled it, the cost wasn't physics or AI. It was drawing and updating tens of thousands of individual prism objects, each with its own renderer.

> The fix wasn't a trick. It was drawing the prisms the way the GPU wants to draw them: in big batches.

### The instanced path

We moved prisms to instanced rendering, so one draw call can cover thousands of them, and moved their animation onto the GPU's clock instead of updating each prism every frame on the CPU.

- **103,823 prisms** in our lab scene now cost **4.8 ms** of CPU time, down from 61.9 ms. That's 12.9× faster.
- In the menu's living world, **8,436 prisms** draw in just **23** opaque draw calls.

![Orange, purple and green prism structures filling the screen](/assets/images/Image%20Sequence_027_0000.jpg)
*Every shape in this shot is built from prisms laid down by vessels and creatures.*

## What it unlocks

Cheaper prisms mean bigger worlds: denser coral, larger swarms and longer trails, on phones as well as PCs.
