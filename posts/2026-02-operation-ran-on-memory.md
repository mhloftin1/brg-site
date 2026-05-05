---
title: "The File Was Fine. The Foundation Wasn't."
slug: 2026-02-operation-ran-on-memory
date: 2026-04-21
tags:
  - Manufacturing
  - Systems
  - Exit Readiness
summary: "A mid-size trailer manufacturer called us about a broken JSON file. We fixed it in a week. Then we kept looking — and found a production system running on institutional memory, a data foundation that couldn't support the software sitting on top of it, and a 28% formula error baked into every quote."
---

A mid-size trailer manufacturer called us about a broken JSON file.

Their configure-price-quote system, the software that turns a custom order into a bill of materials, had stalled. The person keeping it running was an intern with some computer skills, propping up a CPQ system the original consultants had built and walked away from. He'd been backing up the one employee with the institutional knowledge to make any of it work.

Then he left. The company had a signed contract, a non-functioning system, and our number.

We made it work. About a week.

Then we kept looking.

---

## What we found

The JSON file was a symptom. The actual problem sat three layers deeper.

The CPQ's raw material formulas were hardcoded. Static numbers. They didn't scale when a customer ordered a larger or smaller trailer, so every order required manual correction. We verified this across 230 production cuts and found a 28% overcalculation baked into the formulas. Every quote inflated. Every bill of materials wrong. Every correction was a person on the floor compensating for math the system should have handled.

The data foundation underneath, the translation table linking vendor part numbers to internal inventory codes, was, by the client's own assessment, roughly 90% incorrect. The team wasn't working from bad data by accident. The system had never been built to hold accurate data in the first place.

One person carried the institutional knowledge for how the numbers should actually work. The playbook hadn't been built to scale, so she was answering different people at different times with nothing documented behind her. The company had a good problem: customers wanted the product. The delivery infrastructure hadn't kept up.

This was an operations problem wearing a software mask. The previous contractor missed it.


The consultants who installed the CPQ sold the software as the answer. They oversold what the configuration could do and never understood the manufacturing process underneath it.

This is the standard pattern. A business hits a growth constraint. Someone sells them technology. The technology gets layered on top of broken processes. The technology fails. The business blames the software.

The software wasn't the issue. Nobody had done the work to figure that out before recommending it.


This is where BRG works differently.

Most consultancies define scope and cost upfront. They have frameworks, deliverable templates, standardized assessments. That structure protects margins by limiting discovery. It works for the consultancy. It doesn't work for the client when the real problem is bigger than the presenting symptom.

We do the opposite. We invest in research into the specific situation before we recommend anything. No frameworks pulled off a shelf. No predetermined solution. We look at the whole thing and report what we find, including when what we find is bigger than what we were called about.

In this case, the manufacturer called about a broken file. We found a production system running on institutional memory, a data foundation that couldn't support the software sitting on top of it, and a team doing the work despite the systems they had to use.

That research changed the engagement. It also gave the client something they didn't have when we started: an honest picture of where they stood. Not a sales pitch for more software. Not a pre-scoped project with artificial boundaries. A basis for deciding what to do next.

## What we built

- 537 item codes validated from scratch
- 111 manufacturing terms standardized across departments
- 38 departments, 32 units of measure, and 27 vendor terms mapped into a clean, auditable data structure
- 28% formula error corrected, the one inflating every quote and flowing through every production order
- Data foundation rebuilt to a state the software can actually run on

Each of those has standalone value. The assessment is what unlocked them and what will unlock the next round. Without the research to see the full scope, any one fix would have been a patch on a system that still didn't work. The client now has a clear picture of what's been addressed, what's still open, and the real options going forward, including whether their current software is the right tool or whether a custom build makes more sense.


Hughes didn't have a people problem. The institutional knowledge lived in one person's head because the playbook hadn't been built to scale. The team wasn't playing from the same page because the page didn't exist.

This is invisible until someone does the research to surface it. Owner-led businesses in this position don't need another software salesperson, and they don't need a consultant arriving with a pre-built framework. They need someone who will do the work to understand what's actually happening before telling them what to do about it.


If you're looking at a client's books and seeing inventory differences you can't explain, or helping someone prepare for a transaction and realizing the operations won't survive due diligence, the problem may not be what it looks like on the surface.

Your clients trust you. You see things other advisors don't. But interconnected operational problems, where data, software, processes, and people all interact, fall outside most advisory scopes. That isn't a criticism. These problems cross boundaries that no single discipline covers.

That's our work. We research the situation and build the operational foundation that makes your advice implementable. When your client is in a better position, so are you.

If a client of yours is blaming software for something that smells operational, send them our way. We'll do the work to figure out what's actually wrong.
