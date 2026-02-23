---
title: It Wasn’t a Software Problem
slug: 2026-03-it-wasn't-a-software-probem
date: 2026-02-23
tags:
  - AI
summary: Short Summary goes here.
---
![Factory](/images/weld-fab-shop-fullsize.jpg)

*Bowie Research Group*

A mid-size trailer manufacturer
called us about a data file.

Their configure-price-quote
system — the software that turns a custom order into a bill of materials — had
stalled. A previous contractor built it, walked away, and left behind code
nobody on the team could read or modify. They needed someone to make a JSON
import file work so they could get back to building trailers.

We made it work. Took about a
week.

Then we kept looking.

## What we found

The JSON file was a symptom.
The actual problem was three layers deeper.

The system’s formulas for raw
materials were hardcoded — static numbers that didn’t adjust when a customer
ordered a larger or smaller trailer. Every single order required manual
correction. We verified this across 230 production cuts and found a 28% overcalculation
error baked into the formulas. Every quote was inflated. Every bill of
materials was wrong. Every correction was someone on the team compensating for
math the system should have handled.

The data foundation — the
translation table linking vendor part numbers to internal inventory codes —
was, by the client’s own assessment, roughly 90% incorrect. The team wasn’t
working from bad data by accident. The system had never been built to hold accurate
data in the first place.

One person carried most of the
institutional knowledge for how the numbers should actually work. Not because
of any failure on her part — because the playbook hadn’t been built to scale.
She was answering to different people at different times with no documented
system behind her. The company had the best problem in business: they get
sales, people want their product. But the delivery infrastructure hadn’t kept
pace.

That’s not a software problem.
That’s an operations problem wearing a software mask.

## The previous contractor missed it

The manufacturer had been sold
their CPQ system as an answer. The contractor who implemented it oversold the
software’s capabilities and underdelivered on the configuration — without ever
understanding the manufacturing process underneath.

This happens constantly. A
business hits a growth constraint. Someone sells them technology to solve it.
The technology gets implemented on top of broken processes. The technology
fails. The business blames the software.

The software wasn’t the issue.
The process was. And nobody had done the work to figure that out before
recommending a solution.

## Research before diagnosis

This is where our approach
diverges from the standard consulting playbook.

Most consultancies define scope
and cost upfront. They have frameworks. Deliverable templates. Standardized
assessments designed to protect margins by limiting discovery. That works for
the consultancy. It doesn’t always work for the client — especially when the
real problem is bigger than the presenting symptom.

We do the opposite. We invest
in highly focused, highly personalized research into your specific situation
before we recommend anything. No cookie-cutter frameworks. No predetermined
solutions. We go in, look at everything, and report what we actually find —
even when it’s bigger than what you called us about.

In this case, the manufacturer
called about one broken file. What we found was a production system running on
institutional memory instead of documented processes. A data foundation that
couldn’t support the software sitting on top of it. A team doing excellent work
despite systems actively working against them.

That research period changed
the engagement. It also gave the client something they didn’t have before: a
clear, honest assessment of where they actually stood. Not a sales pitch for
more software. Not a pre-scoped project with artificial boundaries. A real
picture of the problem — and a basis for deciding what to do next.

## What we actually delivered

We validated 537 item codes
from scratch. Standardized 111 manufacturing terms across departments so the
entire team was working from the same vocabulary. Mapped 38 departments, 32
units of measure, and 27 vendor terms into a clean, auditable data structure.

We corrected the 28% formula
error that had been inflating every quote and cascading through every
production order. We rebuilt the data foundation their software needs to
actually function.

Each of those deliverables has
individual value. But the assessment is what unlocked them — and what will
unlock more. Without the research to see the full scope, any one of those fixes
would have been a patch on a system that still didn’t work. The client now has
a clear picture of what’s been addressed, what remains, and what the real
options are going forward — including whether their current software is even
the right tool, or whether a custom-built solution makes more sense.

## The structural problem nobody wants to talk about

Here’s the part that matters
for anyone advising businesses like this one.

This manufacturer didn’t have a
people problem. They had a structure problem. The institutional knowledge lived
in one person’s head because the playbook hadn’t been built to scale. The team
wasn’t playing from the same page because the page didn’t exist.

This is invisible until someone
does the research to surface it. And most owner-led businesses in this position
don’t need another software salesperson. They don’t need a consultant who shows
up with a pre-built framework. They need someone who will put in the work to
understand what’s actually happening before telling them what to do about it.

## Why this matters for you

If you’re an accountant looking
at a client’s books and seeing inventory discrepancies you can’t explain — or a
CPA helping someone prepare for a transaction and realizing the operations
won’t survive due diligence — the problem might not be what it looks like on
the surface.

Your clients trust you. You see
things other advisors don’t. But interconnected operational problems — where
the data, the software, the processes, and the team all interact — sit outside
most advisory scopes. That’s not a criticism. It’s a recognition that these
problems cross boundaries no single discipline covers.

That’s what we do. We go in,
research the situation, and build the operational foundation that makes your
advice implementable. When your clients are in a better spot, you’re in a
better spot.

We’re not here to take your
client relationship. We’re here to make it more valuable.

If you’ve got a client who
bought software that isn’t working the way it should, the problem might be
deeper than the software. *We can help figure out how deep.*

—

*Bowie Research Group*

Research. Build. Execute.
