NodeJS Prototype Specification (MicroDYN CPS Tool)

Reference: PsycometricToolSpecification.md (3 microworlds; phases for knowledge acquisition, knowledge application, strategy-use log indicators)

Goals & Scope: Local/offline web app to deliver 3 parallel MicroDYN microworlds, capture fine-grain logs, score 8 items per microworld, aggregate to 3 dimension scores (Knowledge Acquisition, Knowledge Application, Strategy Use), produce learner view (3-bar profile + brief narrative) and admin exports (CSV/JSON). Not for grading/selection; diagnostic only.

Tech Stack:

Runtime: Node.js 20 LTS.
Web server: Express 5 (JSON API + static frontend).
Frontend: lightweight React served statically; slider UI for inputs/outputs + causal-diagram canvas.
Persistence: local JSON/SQLite.
Tests: Lint: ESLint + Prettier.
Domain Model:

Microworld: { id, name, inputs[3], outputs[3], effectMatrixB[3][3], targets: {outputId: value}, phaseDurations: {exploreMs, controlMs} }
TrialEvent: { sessionId, microworldId, phase: 'explore'|'control', stepIndex, timestamp, type: 'START_ITEM'|'MOVE_SLIDER'|'CLICK_APPLY'|'CLICK_NEXT'|'DRAW_ARROW', payload }
CausalDiagram: { arrows: [{ fromInputId, toOutputId, polarity: +1|-1, magnitude: 1|2|3 }] }
Responses: { mcq: { item5, item6 }, finalOutputs: { outputId: number }, diagram }
Scores: item-level S1..S8 per microworld + aggregates (KAm, KAppm, SUm, KAtotal, KApptotal, SUtotal).
Feedback: { dimensionBands: { KA, KApp, SU }, narrative: string }.
Session Flow:

Session created → anonymous token, microworld order randomized.
For each microworld:
Phase 1 (explore, timer): sliders active, outputs update per effectMatrix; logs every slider move.
Diagram entry: user draws arrows + polarity + magnitude.
Phase 2 (control, timer): target values shown; user adjusts inputs up to 6 steps, outputs recompute per step; final confirm.
MCQs for Item5/Item6 shown after control.
Repeat across 3 microworlds; submit to scoring; show 3-bar profile.
Computation Rules (backend):

System dynamics: outputs = clamp(outputs + B * deltaInputs) with rounding rules per spec (define in config; default linear, no noise).
Item scoring (per microworld m):
S1 (Topology): max(0, TP-FP) where TP matches true links, FP spurious.
S2 (Polarity): count of correct sign on true links drawn.
S3 (Magnitude): count of correct magnitude on true links drawn.
S4 (Control target): 2 if all targets met, 1 if partial, 0 otherwise.
S5: MCQ (option B) → 1/0.
S6: MCQ (option C) → 1/0.
S7 (VOTAT): 1 if ≥3 valid single-input trials in explore logs.
S8 (Systematic sequence): 1 if any run of 3 consecutive single-input trials covers all three inputs once.
Dimension per microworld: KA = S1+S2+S3; KApp = S4+S5+S6; SU = S7+S8.
Aggregate across microworlds: sums of each dimension.
Bands (configurable after pilot): map raw → percentile → {Emerging, Developing, Proficient, Advanced}.
APIs (JSON):

POST /api/session → { sessionId, microworldOrder, config }.
GET /api/microworld/:id → microworld config (no answers).
POST /api/event → log TrialEvent (buffered write, encrypted flush).
POST /api/diagram → save CausalDiagram for session/microworld.
POST /api/control-final → { finalOutputs, mcq }.
POST /api/score → computes items + aggregates, returns scores + feedback.
Admin: GET /admin/export?format=csv|json (auth via secret), returns sessions, logs, scores.
Health: GET /health (no auth).
Frontend Requirements:

Responsive layout (≥1024x768 target).
Components: SliderPanel (inputs), OutputPanel (live values), Timer, DiagramBuilder (drag/drop arrows with sign/magnitude picker), MCQModal, ProgressBar (3 microworlds), SummaryProfile (bars).
Accessibility: keyboard slider control, aria labels, visible timer, clear instructions per spec.
Offline-first: assets bundled; fetch only local APIs.
Prevent tab switching/refresh loss: unload warning; auto-save events.
Logging & Storage:

Event buffer in browser; flush every N events or 5s; retry with backoff.
Server writes per-session log file {sessionId}.log.jsonl
Clock sync: server timestamps events on receipt; client sends clientTime for drift inspection.
Data retention configurable; secure file perms.

Config & Seeding:

config/microworlds.json: three microworld definitions (inputs/outputs labels, effect matrix, targets, timers).
config/scoring.json: timer limits, band cut scores, step limits (e.g., 6 control steps), diagram rules (max arrows).
Seed script to load configs into SQLite if used; fallback to JSON files.

Build & Deployment:

Scripts: npm run dev, build (frontend+backend), start (node dist/index.js), test, lint.
Packaging: single Node process serving static dist + API; no external DB required for prototype.
Deployment target: local laptop/PC; optional Dockerfile (node:20-alpine) with volume mount for data.