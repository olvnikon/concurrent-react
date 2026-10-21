# Concurrent React community call

Five small lessons: Scheduler, Fiber, lanes/rebasing, real React search, and
Suspense. The teaching models and real React examples are explicitly labeled.

## Run the lesson host

```sh
npm ci
npm run dev
```

Open the printed localhost URL. Use Node 22.12+; verified with 22.17.1.
React and React DOM are pinned to **19.3.0**.

- [Demo guide](docs/demo-guide.md): lesson steps, code walkthroughs and simplifications.
- [Slide text](docs/community-call-slides.md): 22 slides with speaker notes and demo cues,
  including requestIdleCallback and step-by-step MiniSuspense.
- [Accuracy review](docs/accuracy-review.md): source checks and caveats for suggested articles.
- [Profiling walkthrough](docs/profiling-walkthrough.md): five captured real React
  traces, observed interruption, and exact recording/rehearsal instructions.
- [Implementation progress](docs/community-call-implementation-plan.md): completed
  work and remaining manual DevTools/presenter rehearsal steps.

```sh
npm test                  # original 10 checks + 10 isolated-model tests
npm run models            # executable minimal internals walkthroughs
npm run test:browser       # headless Edge functional rehearsal
npm run build
npm run build:profiling
npm run format            # Prettier, respecting protected reference folders
npm run format:check
```

Use `npm run preview` after the desired build. `npm run record` creates a new
timestamped evidence folder. The guide documents prerequisites and scope.
Neither `react/` nor `react-source-v19.3.0/` may be modified or formatted.

## Original research and standalone miniature

React **19.3.0**, tag `v19.3.0`, commit `1d34f91dfde6bba84d08b683aaba164c7194dacb`.
Source baseline checked 18 September 2026; package finalized 19 September 2026.

## Start here

- `concurrent-react-research-dossier.md`: all 30 research topics, immutable source references, diagrams, implementation analysis and teaching code. The standalone context pack is also reproduced at its end.
- `concurrent-react-context-pack.md`: dense independent reference for another conversation. Upload this when the full dossier is unnecessary.
- `mini-concurrent-react-demo.html`: standalone interactive teaching renderer. Open directly in a modern browser; no server, network requests or package installation is required.
- `examples/mini-concurrent-react.mjs`: the integrated miniature renderer.
- `examples/mechanisms.mjs`: isolated Suspense, store-consistency and commit teaching helpers.
- `examples/verify.mjs`: deterministic behavioral verification.
- `source-manifest.json`: 68 source-file hashes, line counts, sizes and immutable URLs.
- `source-references.json`: the 79 source reference locations used in the dossier.
- `react-source-v19.3.0/`: selected original React repository files, including the upstream MIT license. This is a source-reading subset, not a complete buildable React checkout.
- `evidence/`: release/tag metadata and verification results.

## Run the standalone miniature

1. Open `mini-concurrent-react-demo.html` in a browser.
2. Press **Run a → ab**. This injects the second update in a later task after the first transition yield.
3. Observe the urgent input commit, yielded candidate, abandoned draft, rebasing and final results commit.
4. Select **First row blocks 100 ms** to demonstrate that the 5 ms checkpoint budget cannot interrupt a running function.
5. Type manually to exercise real browser input tasks. Typing during a scripted
   replay cancels that replay and leaves your input in control. Inspect
   `mini-react:` User Timing marks in the browser Performance panel if desired.

The visible trace is diagnostic UI outside the renderer. It refreshes through rAF while the candidate is paused; result cards update only in the synchronous commit adapter. Frame callbacks are counted, not presented as measured paints.

## Run verification

Use a recent Node.js version supporting ES modules and `Array.prototype.findLast`:

```sh
node examples/verify.mjs
```

Expected result: **10 behavioral checks passed**. These cover ordered rebasing
with noncommutative actions; urgent publication before transition completion;
draft abandonment without update loss; continuation of unchanged work; updates
arriving after a snapshot; a 100 ms indivisible unit overrunning the budget;
external-store snapshot inconsistency; Suspense retention/listener
deduplication; preserving fallback state; and a resolved-resource retry.

## What the miniature intentionally changes

The implementation uses a fixed Search/Input/Results/Row tree, one object-state queue, two toy lane bits, an explicit query-only Results bailout and a FIFO MessageChannel scheduler. One microtask coordinates its single root. The host adapter publishes a whole finished snapshot synchronously.

It is not React and does not import React. It omits production hooks, generic key reconciliation, lane groups/expiration/entanglement, async Actions, `isPending`, optimistic reversion, error boundaries, multiple roots, hydration and View Transition commit orchestration. Its separate Suspense helper catches raw thenables and assumes a successful result commits immediately; it does not integrate the production Fiber boundary/unwind protocol.

Same-lane updates arriving after a draft starts remain queued and can be processed by a subsequent render. This intentionally simple snapshot policy is not the complete React concurrent-update algorithm. The scheduler's injected `postTask` option means an arbitrary host-callback enqueue function for testing, not specifically the browser `scheduler.postTask` API.

## Verification boundaries

The ten engine checks, JavaScript syntax checks, HTML element-reference checks,
source hash verification and source-line/reference integrity checks passed. The
page's replay, automated input, interruption, and final DOM state were exercised
in headless Microsoft Edge 153.0.4234.48 without CPU throttling. Its visual
layout was not reviewed, and React's upstream suites were not run. The proposed
real-React profiling designs in the original dossier are not benchmark results.
The new lesson host has separate measured recordings and verification boundaries
documented in the profiling walkthrough above. A manual React DevTools extension
capture and complete live presentation rehearsal are still pending.

The dossier distinguishes public contracts, current implementation, history and experimental features. Timing illustrations are not browser scheduling guarantees. React's bundled source retains its original license; the teaching code is an original educational reconstruction.
