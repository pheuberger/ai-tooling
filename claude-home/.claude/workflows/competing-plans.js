export const meta = {
  name: 'competing-plans',
  description: 'Generate N divergent implementation plans from one spec, grade them blind with a judge panel, synthesize the winner + graft the best ideas from the rest',
  whenToUse: 'You have a spec/feature and want the strongest plan, not the first plan. Pass {spec, specFile, stances, judges, out, noCodebase, context} via args. Provide the spec inline (spec) OR as a file (specFile) OR point specFile at an existing plan doc to beat. Defaults: 3 stances, 3 judges, winner → PLAN.md.',
  phases: [
    { title: 'Spec', detail: 'materialize the spec all agents share' },
    { title: 'Generate', detail: 'one planner per stance, divergent, blind to each other' },
    { title: 'Grade', detail: 'judge panel scores all plans anonymized, by rubric' },
    { title: 'Synthesize', detail: 'single writer merges winner + best grafts → final plan' },
  ],
}

// --------------------------------------------------------------------------
// Args + defaults
// --------------------------------------------------------------------------
const A = args || {}
const DIR = '.competing-plans'
const OUT = A.out || 'PLAN.md'
const NO_CODEBASE = A.noCodebase === true
const CONTEXT_FILES = Array.isArray(A.context) ? A.context : (A.context ? [A.context] : [])

// Spec source: inline text (spec) and/or a file (specFile — may be an existing plan to beat)
const SPEC_INLINE = typeof A.spec === 'string' && A.spec.trim() ? A.spec.trim() : null
const SPEC_FILE = A.specFile || null
if (!SPEC_INLINE && !SPEC_FILE) {
  throw new Error('competing-plans: provide a spec — pass {spec: "..."} inline or {specFile: "path"}')
}
// Canonical spec path every agent reads.
const SPEC = SPEC_FILE || `${DIR}/SPEC.md`

// Divergent stances — the whole value is that these DISAGREE. Each forces a
// different optimization target so the plans genuinely compete.
const STANCE = {
  'mvp': "Optimize for the SHORTEST path to a working result. Minimal scope, fewest new dependencies, least new abstraction. Ship the smallest thing that satisfies the spec; explicitly defer everything non-essential. Bias to boring, proven tech and existing code.",
  'robust': "Optimize for PRODUCTION robustness. Handle edge cases, partial failures, race conditions, bad input, and concurrency. Build in observability (logging/metrics), validation, and graceful degradation. Assume this runs at scale and gets attacked.",
  'clean': "Optimize for long-term MAINTAINABILITY and architecture. Pick the design that will age best: clear seams, low coupling, high testability. Willing to refactor surrounding code to land the change cleanly rather than bolt it on.",
}
const DEFAULT_STANCES = ['mvp', 'robust', 'clean']
let STANCES = Array.isArray(A.stances) && A.stances.length ? A.stances : DEFAULT_STANCES
const stanceInstr = (s) => STANCE[s] || `Optimize for ${s}. Make every design decision serve that goal, even at the expense of others.`

// Judge panel size (independent graders; majority robustness).
const N_JUDGES = Math.max(1, A.judges || 3)

// Letter id per plan — what judges see. Stance↔letter mapping stays hidden from judges.
const LETTERS = STANCES.map((_, i) => String.fromCharCode(65 + i)) // A, B, C, ...
const planFile = (letter) => `${DIR}/plan-${letter}.md`

const codebaseRule = NO_CODEBASE
  ? 'You do NOT have codebase access. Plan on the spec alone; state assumptions explicitly.'
  : 'Use Read, Grep, Glob to ground the plan in the ACTUAL codebase — real file paths, real functions, real patterns. Use WebSearch to confirm any external dependency/API exists.'

const contextBlock = CONTEXT_FILES.length
  ? `\n## Additional context — read these files first:\n${CONTEXT_FILES.map((f) => `- ${f}`).join('\n')}\n`
  : ''

// Rubric axes — judged 1-5 each. Higher is always better.
const AXES = ['feasibility', 'completeness', 'simplicity', 'robustness', 'maintainability']

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    approach: { type: 'string', description: 'The plan in 2-3 sentences — the core strategy' },
    keyBets: { type: 'array', items: { type: 'string' }, description: 'The decisions this plan is betting on' },
    tradeoffs: { type: 'array', items: { type: 'string' }, description: 'What this plan sacrifices for its stance' },
  },
  required: ['approach', 'keyBets', 'tradeoffs'],
}

const axisProps = Object.fromEntries(AXES.map((ax) => [ax, { type: 'number', description: `${ax}, 1 (poor) to 5 (excellent)` }]))

const RUBRIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scores: {
      type: 'array',
      description: 'One entry per plan you reviewed.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          plan: { type: 'string', description: 'Plan letter (A/B/C/...)' },
          ...axisProps,
          overall: { type: 'number', description: 'Holistic quality 1-10 — your all-things-considered verdict, not just the axis average' },
          rationale: { type: 'string', description: 'Why this score — concrete strengths/weaknesses' },
        },
        required: ['plan', ...AXES, 'overall', 'rationale'],
      },
    },
    ranking: { type: 'array', items: { type: 'string' }, description: 'Plan letters best→worst' },
    steal: {
      type: 'array',
      description: 'Best ideas worth grafting into the winner regardless of which plan they came from.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fromPlan: { type: 'string' },
          idea: { type: 'string' },
        },
        required: ['fromPlan', 'idea'],
      },
    },
  },
  required: ['scores', 'ranking', 'steal'],
}

const SYNTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    winner: { type: 'string', description: 'Winning plan letter' },
    grafted: {
      type: 'array',
      description: 'Ideas pulled in from non-winning plans',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { fromPlan: { type: 'string' }, idea: { type: 'string' } },
        required: ['fromPlan', 'idea'],
      },
    },
    rationale: { type: 'string', description: 'Why this base won and what was grafted' },
  },
  required: ['winner', 'grafted', 'rationale'],
}

// --------------------------------------------------------------------------
// Phase 0 — Materialize the spec every agent shares
// --------------------------------------------------------------------------
phase('Spec')
await agent(
  `Set up the shared spec for a competing-plans run.\n\n` +
  `1. Create the working dir: mkdir -p "${DIR}"\n` +
  (SPEC_FILE
    ? `2. The spec already lives at "${SPEC_FILE}". Confirm it exists and is non-empty. If missing, STOP and report — do not invent one.\n`
    : `2. Write the following spec verbatim to "${SPEC}":\n\n<<<SPEC\n${SPEC_INLINE}\nSPEC\n\n`) +
  `Return a one-line confirmation including the spec path and rough size.`,
  { label: 'spec', phase: 'Spec' },
)

// --------------------------------------------------------------------------
// Phase 1 — Generate divergent plans (parallel, blind to each other)
// --------------------------------------------------------------------------
phase('Generate')
const plans = await parallel(STANCES.map((stance, i) => () => {
  const letter = LETTERS[i]
  return agent(
    `You are writing a complete, standalone implementation plan for the spec below. Other planners are writing competing plans in parallel — you cannot see theirs. Make yours the best version of YOUR stance.\n\n` +
    `## Spec — read this file first\n${SPEC}\n${contextBlock}\n` +
    `## Your stance: ${stance}\n${stanceInstr(stance)}\n\n` +
    `## Grounding\n${codebaseRule}\n\n` +
    `## Rules\n` +
    `1. Commit fully to your stance — a sharply opinionated plan beats a hedged one. The judges want genuinely different options.\n` +
    `2. Write a real, buildable plan: concrete steps, real file paths/functions, data shapes, sequencing, and a testing approach. Specific enough to hand to an implementer.\n` +
    `3. Do NOT name your stance or mention "MVP/robust/clean" or that this is one of several plans. Write it as THE plan — a neutral, standalone document. (Graders see it blind.)\n` +
    `4. Write the full plan to "${planFile(letter)}". Markdown, headed sections.\n\n` +
    `Return the structured summary.`,
    { label: `plan:${stance}`, phase: 'Generate', schema: PLAN_SCHEMA },
  ).then((r) => (r ? { ...r, stance, letter } : null))
}))
const builtPlans = plans.filter(Boolean)
if (builtPlans.length < 2) throw new Error(`competing-plans: only ${builtPlans.length} plan(s) generated — need at least 2 to compete`)
const builtLetters = builtPlans.map((p) => p.letter)
log(`Generated ${builtPlans.length} plans: ${builtPlans.map((p) => `${p.letter}=${p.stance}`).join(', ')}`)

// --------------------------------------------------------------------------
// Phase 2 — Judge panel (parallel, blind, rubric)
// Each judge scores every plan; mapping of letter→stance is hidden.
// --------------------------------------------------------------------------
phase('Grade')
const plansList = builtLetters.map((l) => `- Plan ${l}: ${planFile(l)}`).join('\n')
const judgments = (await parallel(Array.from({ length: N_JUDGES }, (_, j) => () =>
  agent(
    `You are judge ${j + 1} of ${N_JUDGES} on a panel grading competing implementation plans for the same spec. You are independent — score on your own judgment.\n\n` +
    `## Spec\n${SPEC}\n\n` +
    `## Plans to grade (read all)\n${plansList}\n` +
    `Plan letters are arbitrary labels — order implies nothing. You do not know who wrote which.\n${contextBlock}\n` +
    `## How to grade\n` +
    `1. Read the spec, then read every plan in full.\n` +
    `2. ${NO_CODEBASE ? 'Judge on the spec and plan merits alone.' : 'Spot-check claims against the real codebase (Read/Grep/Glob) — reward plans grounded in reality, penalize hand-waving.'}\n` +
    `3. Score EACH plan 1-5 on every axis (higher=better): ${AXES.join(', ')}. Then give a holistic overall 1-10.\n` +
    `4. Rank all plans best→worst. Be discriminating — avoid ties and middling scores; the point is to separate them.\n` +
    `5. List the best ideas worth stealing into the eventual winner, with which plan each came from.\n\n` +
    `Return your structured judgment.`,
    { label: `judge:${j + 1}`, phase: 'Grade', schema: RUBRIC_SCHEMA },
  )
))).filter(Boolean)
if (!judgments.length) throw new Error('competing-plans: all judges failed')

// Aggregate scores across the panel (plain JS — no agent needed).
const agg = {}
for (const l of builtLetters) agg[l] = { letter: l, overall: 0, axes: Object.fromEntries(AXES.map((a) => [a, 0])), n: 0, firsts: 0 }
for (const jm of judgments) {
  for (const s of (jm.scores || [])) {
    const a = agg[s.plan]
    if (!a) continue
    a.overall += s.overall || 0
    for (const ax of AXES) a.axes[ax] += s[ax] || 0
    a.n += 1
  }
  if (jm.ranking && jm.ranking[0] && agg[jm.ranking[0]]) agg[jm.ranking[0]].firsts += 1
}
const board = Object.values(agg).map((a) => ({
  letter: a.letter,
  stance: builtPlans.find((p) => p.letter === a.letter)?.stance,
  avgOverall: a.n ? +(a.overall / a.n).toFixed(2) : 0,
  axisAvgs: Object.fromEntries(AXES.map((ax) => [ax, a.n ? +(a.axes[ax] / a.n).toFixed(2) : 0])),
  firstPlaceVotes: a.firsts,
})).sort((x, y) => y.avgOverall - x.avgOverall || y.firstPlaceVotes - x.firstPlaceVotes)
const leader = board[0].letter
const allSteals = judgments.flatMap((jm) => jm.steal || [])
log(`Scoreboard: ${board.map((b) => `${b.letter}(${b.stance})=${b.avgOverall} [${b.firstPlaceVotes}🥇]`).join('  ')}`)

// --------------------------------------------------------------------------
// Phase 3 — Synthesize: winner as base, graft the best stolen ideas
// --------------------------------------------------------------------------
phase('Synthesize')
const synth = await agent(
  `You are producing the FINAL implementation plan by taking the panel's winning plan as the base and grafting in the best ideas from the others.\n\n` +
  `## Spec\n${SPEC}\n\n` +
  `## The competing plans\n${plansList}\n\n` +
  `## Panel results\n` +
  `Aggregate scoreboard (best first):\n\`\`\`json\n${JSON.stringify(board, null, 2)}\n\`\`\`\n` +
  `Leading plan by score: ${leader}\n\n` +
  `Ideas the judges flagged as worth stealing:\n\`\`\`json\n${JSON.stringify(allSteals, null, 2)}\n\`\`\`\n\n` +
  `## Instructions\n` +
  `1. Read the spec and all plan files.\n` +
  `2. Take plan ${leader} as the base (override only if reading them convinces you another plan is clearly stronger — say so in rationale).\n` +
  `3. Graft in the "steal" ideas that genuinely improve the plan AND fit coherently. Reject grafts that fight the base plan's design or contradict the spec — incoherent franken-plan is worse than a clean one.\n` +
  `4. Resolve any contradictions the grafts introduce. The result must read as ONE coherent plan, not a stitched-together pile.\n` +
  `5. Write the final plan to "${OUT}". Keep it implementer-ready: concrete steps, real paths, testing approach.\n\n` +
  `Return which plan you used as base, what you grafted (with source), and why.`,
  { label: 'synthesize', phase: 'Synthesize', schema: SYNTH_SCHEMA },
)

log(`Winner: plan ${synth?.winner || leader} → ${OUT} · grafted ${synth?.grafted?.length || 0} idea(s)`)
return {
  out: OUT,
  spec: SPEC,
  workdir: DIR,
  stances: builtPlans.map((p) => ({ letter: p.letter, stance: p.stance })),
  scoreboard: board,
  winner: synth?.winner || leader,
  grafted: synth?.grafted || [],
  rationale: synth?.rationale,
  planSummaries: builtPlans,
}
