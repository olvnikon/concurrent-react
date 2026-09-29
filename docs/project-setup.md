# Project setup assessment

Reviewed on 23 September 2026. This is an initialization assessment, not a full
technical audit of the research or a browser validation report.

## What is already here

| Material                                    | Role and current state                                                                                                                                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/concurrent-react-deep-talk-topics.md` | Detailed talk outline, proposed demos, profiling plan, and source-reading path. Use it as the coverage inventory, not a requirement to show every topic live.                                                                 |
| Root context pack and research dossier      | Extensive research labeled against React 19.3.0. Their copies in `docs/` are byte-identical at setup.                                                                                                                         |
| `examples/mini-concurrent-react.mjs`        | An integrated teaching engine with two toy lanes, a persistent update queue, Fiber traversal, a FIFO host scheduler, and snapshot commits. It does not import React.                                                          |
| `examples/mechanisms.mjs`                   | Separate simplified Suspense, store-consistency, and commit helpers. Suspense is not integrated into the miniature Fiber engine.                                                                                              |
| `examples/verify.mjs`                       | Nine deterministic behavioral checks; all passed during this assessment.                                                                                                                                                      |
| `mini-concurrent-react-demo.html`           | Standalone teaching page with embedded engine code, workload controls, an interruption replay, and User Timing marks. Browser behavior remains unverified in this assessment.                                                 |
| `react-source-v19.3.0/`                     | Reference subset: all 68 files match the SHA-256 hashes in `source-manifest.json`. This confirms consistency with the local manifest, not independent release provenance.                                                     |
| `react/`                                    | Read-only upstream clone. Observed HEAD: `d083ec1da1e5252abd3ddfdde6dfbc09701a2c51`; no tag exactly matches HEAD. It differs from the research commit `1d34f91dfde6bba84d08b683aaba164c7194dacb`. Its working tree was clean. |
| `package.json`                              | Minimal placeholder, without a real React app, dependencies, or a working test script.                                                                                                                                        |
| `evidence/`                                 | Historical verification and release metadata. Preserve the distinction between recorded and newly reproduced checks.                                                                                                          |
| `concurrent-react-research-bundle/`         | Empty directory at setup.                                                                                                                                                                                                     |

Project files were already untracked at the start of this assessment. No existing
content was cleaned up or reorganized. The `react/` clone is ignored by the parent
repository, so the parent Git status alone does not verify its condition.

## Instructions added

The root `AGENTS.md` records the project purpose, read-only source boundaries,
context entry points, teaching conventions, evidence requirements, and slide
format. It is deliberately small enough to apply across tasks without requiring
a full research reread. Workflow-specific skills can be added once a repeatable
need emerges. This follows the recommendation to keep repository instructions
focused and load supporting guidance when relevant in
[OpenAI's guidance on instructions and skills](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra).

## Suggested first collection

Build toward five compact teaching units. Each can contain a small mechanism
example and, where helpful, a real React comparison. These are proposed next
steps; no new demos or slide text were implemented during initialization.

| Unit                         | Main question                                           | Demonstration                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Yielding and its limits   | When can the browser regain control?                    | Small cooperative work units versus one long function; task continuation versus a microtask chain.                                              |
| 2. Fiber and publication     | How can traversal pause without exposing half a result? | Step through child/sibling/return links, pause a draft, then publish the finished result.                                                       |
| 3. Priority and interruption | How can input stay responsive while results lag?        | Real React input with slow results: baseline versus Transition; an isolated lane/queue example explains ordered rebasing.                       |
| 4. Suspense and retry        | What happens when a render cannot finish yet?           | Tiny pending-resource/boundary model, then a real React comparison of urgent and Transition updates around already revealed content.            |
| 5. Read the recording        | What actually happened on the main thread?              | Profile the real examples; identify input, render work, task boundaries, commits, and browser layout/paint. Include the indivisible-work limit. |

Use the integrated miniature as a later synthesis or source of extracted examples.
It introduces too many mechanisms at once to serve as the first explanation.
Keep commit/layout bottlenecks and deeper topics such as external stores, hydration,
Activity, and View Transitions as optional extensions until talk duration is chosen.

For the implementation phase, a small React app with a lightweight local dev
server is a reasonable default. Choose the runtime version explicitly against
the intended source baseline before scaffolding. No framework, dependencies, or
build tools were installed during this step.

## Skills worth using

Visualize, Computer Use, Presentations, and Skill Creator are already available
in this session. The two project-specific skills below were subsequently added
under `.agents/skills/`; no plugin installation is needed.

| Skill                         | Appropriate use                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visualize:visualize`         | Explore Fiber links, queue rebasing, and task timelines interactively during preparation. Put final runnable teaching examples in the repository.                                 |
| `computer-use:computer-use`   | Rehearse browser interactions and inspect the visible demos when browser validation is requested. Use a recording workflow that actually exposes the required profiling evidence. |
| `presentations:Presentations` | Create and visually verify a PowerPoint or Google Slides deck when requested. Plain Markdown slide text can be written directly.                                                  |
| `skill-creator`               | Package a recurring project workflow after an example establishes the desired format.                                                                                             |

Added **`react-teaching-example`** at
`.agents/skills/react-teaching-example/SKILL.md`:

- Trigger: creating or materially revising an educational React demo.
- Deliverables: one learning question, runnable code, replay steps, expected
  observation, source mapping, simplifications, and appropriate verification.
- Reference: use `AGENTS.md` for project-wide rules rather than duplicating them.

Added **`react-trace-review`** at
`.agents/skills/react-trace-review/SKILL.md`: record the environment,
inspect a supplied trace, separate observed
events from inferred React behavior, and produce a short presenter walkthrough.
Avoid creating a skill for every internal concept; Fiber, lanes, and Suspense
are subject matter, not necessarily separate reusable workflows. Invoke the new
skills as `$react-teaching-example` and `$react-trace-review`, or let the agent
select them for matching tasks. Both remain subject to available recording tools;
the trace skill can provide capture instructions when capture is unavailable.

## Suggested next task

Build the yielding/indivisible-work example first, with a real browser rehearsal
and a short explanation. Use that completed example to settle the code style,
interaction pattern, and presenter notes before expanding the collection.
