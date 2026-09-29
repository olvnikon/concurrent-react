# Profiling walkthrough: evidence, not a schematic

The saved Transition run contains React's **Interrupted Render** event followed
by urgent work and a later Transition commit. The indivisible-call run contains
long main-thread tasks despite using a Transition. Suspense waiting is captured
separately from CPU-heavy rendering.

## What was captured

[Original metadata](../evidence/community-call/capture-metadata.json):
23 September 2026, Microsoft Edge 153.0.4234.48, headless, viewport 1440 × 1000,
React/React DOM 19.3.0 **development**, Strict Mode off, no CPU throttling.

Search uses 120 rows × 2 ms deliberate CPU cost, ordinary vs Transition; the
indivisible variant moves the nominal 240 ms cost into one component call.
Playwright typed `ab` with a requested 30 ms gap. The actual second handler time
depends on the blocked page and automation. These are **scripted inputs**, not
measured physical keystroke latency, INP, or a statistically controlled benchmark.

Suspense uses UI clicks, a deliberate 500 ms automation wait, then resolution.
The actual request-to-resolve intervals include automation overhead. There is no
network latency measurement.

Artifacts:

- [Ordinary search trace](../evidence/community-call/search-ordinary.json.gz)
- [Transition search trace](../evidence/community-call/search-transition.json.gz)
- [Indivisible search trace](../evidence/community-call/search-indivisible.json.gz)
- [Urgent Suspense trace](../evidence/community-call/suspense-urgent.json.gz)
- [Transition Suspense trace](../evidence/community-call/suspense-transition.json.gz)
- [Search screenshot](../evidence/community-call/search.png)

Each trace has a sibling `*-commits.json` containing programmatic `<Profiler>`
callbacks. These are **not React DevTools extension exports**. Nested Search and
SlowResults profilers report the same commit; group by `commitTime` rather than
counting callbacks or summing overlapping durations. Original metadata's `commits`
field is a callback count; its row-workload fields apply only to search. The
recorder now uses explicit names and scenario-specific workload for future runs.
Original evidence is preserved unchanged.

## Read the saved traces

Load a trace in the browser DevTools **Performance** panel. If that browser
does not accept compressed JSON directly, decompress a copy of the `.json.gz`
first. Enable/show custom tracks if needed. Look for React's **Scheduler**
track group and `call:` User Timing marks. Track presentation depends on the
browser; the captured underlying events have been inspected programmatically,
but importing these files through the interactive DevTools UI is still a manual
rehearsal step.

The React Scheduler phases in these files use `TimeStamp` events with
`args.data.trackGroup` starting with `Scheduler`. Merely searching
`blink.user_timing` misses them. Component entries and our input marks also
appear in User Timing.

Reproduce the extracted observations without importing the UI:

```sh
node demos/tools/analyze-traces.mjs
# For a later capture:
node demos/tools/analyze-traces.mjs evidence/community-call/<capture-id>
```

All times below are milliseconds **relative to the first call: input/request
mark in that file**, rounded to one decimal. They are not the absolute times
shown on the imported trace ruler. Render spans can include yielded gaps.

## 1. Ordinary search: the baseline

In `search-ordinary.json.gz`:

| Event                  | Relative time |
| ---------------------- | ------------- |
| Input handler for a    | 0.0           |
| Blocking Render        | 0.2–247.7     |
| Commit begins          | 247.7         |
| Input handler for ab   | 292.1         |
| Second Blocking Render | 292.2–536.6   |
| Second commit begins   | 536.6         |

The browser trace includes main-thread RunTask durations of about 257.3 and
249.7 ms. The Profiler log has four callbacks but **two distinct commit times**.

Say: “The input and expensive results updates travel together in this baseline.”
Do not say “all React updates always block”; this is specifically an ordinary
update from the controlled input handler in this example.

## 2. Transition: actual interruption

In `search-transition.json.gz`:

| Event                              | Relative time |
| ---------------------------------- | ------------- |
| Input handler for a                | 0.0           |
| Urgent Blocking Render             | 0.3–0.7       |
| Urgent commit begins               | 0.7           |
| Transition Interrupted Render span | 6.3–50.5      |
| Input handler for ab               | 50.3          |
| Second urgent Blocking Render      | 50.5–51.0     |
| Second urgent commit begins        | 51.0          |
| New Transition Render span         | 52.5–306.3    |
| Transition commit begins           | 306.3         |

Expand Main thread and correlate `performWorkUntilDeadline` callbacks with
the Transition activity. Multiple host callbacks occur inside the render span.
The 44.2 ms interrupted span is **not one uninterrupted 44.2 ms callback**.
No RunTask exceeding 50 ms appears in this captured run.

The six Profiler callbacks correspond to **three distinct commit times**.
SlowResults' urgent-pass actualDuration is zero in these logs; the final result
render is about 243.4 ms. This is consistent with the unchanged-props memo bailout.
Use the React track's explicit interruption event as the interruption evidence,
not the missing intermediate query in the committed UI.

Say: “Urgent work can take over while a results draft is in progress; the later
finished draft commits.” Do not turn this sample into a guaranteed scheduling
latency or a fixed number of renders.

## 3. Transition plus one long function: the limit

In `search-indivisible.json.gz`, the second input mark appears at 255.6 ms.
The first Transition Render spans 6.4–252.4 ms, with a commit at 252.4 ms.
Two RunTask events take about **243.3 and 242.4 ms**. Scheduler
`performWorkUntilDeadline` callbacks include the long calls.

The underlying component function cannot be interrupted. A Transition changes
the treatment of the state update; it does not split arbitrary JavaScript.
This run has eight Profiler callbacks across four distinct commit times.

Do not frame 255.6 ms as a measured user's input delay: automation's dispatch
is also affected by page activity. The long tasks directly establish blocking.

## 4. Suspense: waiting is not rendering

Compare the two Suspense traces and the separate browser assertions.

- **Urgent:** initial Blocking Render/Commit occur near the request. A later
  Suspense render at 4.4 ms is followed by a `Throttled` span (5.2–304.6 ms).
  Resolve is marked at 527.6 ms; a commit begins at 528.4 ms.
- **Transition:** a short `Prewarm` span starts at 4.0 ms, then `Suspended` spans
  5.0–535.2 ms. Resolve is marked at 535.0 ms. Transition rendering resumes at
  537.4 ms and its commit begins at 538.3 ms.

The functional browser check confirms fallback for urgent replacement and
retained Article A for Transition replacement, then Article B after resolving.
The trace alone is not a screenshot of those states. The extra urgent control
state commits are expected; not every commit represents new article content.

Say: “This long Suspended span is elapsed waiting time, not continuous CPU work.”
The extra retries/throttling are real React policy omitted from our miniature;
do not infer a universal fallback delay from this run.

## Capture on the presentation machine

1. `npm run dev`; open Search in Edge/Chrome with React DevTools installed.
   Confirm React version, build label, Strict Mode setting, row cost and distribution.
2. Reset **before** recording. In React DevTools **Profiler**, record typing
   `a` then `b`, then stop. Inspect committed component work and export the profile.
3. Repeat the interaction in browser **Performance**, with React Performance
   Tracks visible. Find input, Blocking/Transition work, Scheduler host tasks,
   render and commit, then browser layout/paint events if present.
4. Repeat ordinary, Transition, and indivisible variants with identical row cost.
   Record throttling and whether input is manual. Keep captures short.
5. Reset to revealed A for each Suspense comparison. Record load, wait, resolve.
   Do not start one comparison from fallback and the other from revealed content.
6. If using a production-like build, run `npm run build:profiling` and
   `npm run preview`. The profiling alias is configured in `vite.config.mjs`.
   Build success has been checked; the supplied traces use development mode.

For automated recapture, `npm run record` writes a new timestamped directory
under `evidence/community-call/`; it preserves existing traces. Do not expect
each rerun to interrupt at the same moment.

The browser records and programmatic Profiler logs exist. **A React DevTools
extension export, interactive trace-import rehearsal and manual typing rehearsal
remain pending.** No toy trace is offered as a substitute.

## Interpretation boundaries and sources

Commit callbacks measure committed React work; they do not reveal all abandoned
rendering. A React “Waiting for Paint” label is not a direct paint measurement.
Inspect browser rendering events separately. Do not add nested profiler durations,
equate wall-clock spans with CPU time, or claim concurrency reduced total work.

See [Profiler](https://react.dev/reference/react/Profiler) and
[React Performance Tracks](https://react.dev/reference/dev-tools/react-performance-tracks).
The [demo guide](demo-guide.md#pinned-source-map) links the pinned Scheduler,
work-loop, hooks and Suspense sources used to explain these recordings.
