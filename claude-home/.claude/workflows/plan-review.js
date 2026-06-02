export const meta = {
  name: 'plan-review',
  description: 'Self-healing plan refinement: parallel multi-lens critique → single-writer merge → polish → summary',
  whenToUse: 'Harden an implementation plan before building. Workflow port of the ralph-plan bash tool. Pass {plan, questions, light, lenses, noCodebase, context, sparringCmds, rounds} via args; defaults to PLAN.md.',
  phases: [
    { title: 'Snapshot', detail: 'copy original plan for the diff' },
    { title: 'Sparring', detail: 'optional external-model critique, integrated' },
    { title: 'Critique', detail: 'one read-only agent per lens, structured findings' },
    { title: 'Merge', detail: 'single writer applies fixes, logs ambiguous questions' },
    { title: 'Polish', detail: 'consistency + prose/code reconciliation pass' },
    { title: 'Summary', detail: 'structured what-changed report' },
  ],
}

// --------------------------------------------------------------------------
// Args + defaults (mirrors ralph-plan flags)
// --------------------------------------------------------------------------
const A = args || {}
const PLAN = A.plan || 'PLAN.md'
const QUESTIONS = A.questions || 'PLAN-QUESTIONS.md'
const ORIG = `${PLAN}.orig`
const NO_CODEBASE = A.noCodebase === true
const ROUNDS = Math.max(1, A.rounds || 1)
const CONTEXT_FILES = Array.isArray(A.context) ? A.context : (A.context ? [A.context] : [])
const SPARRING_CMDS = Array.isArray(A.sparringCmds) ? A.sparringCmds : (A.sparringCmds ? [A.sparringCmds] : [])

// Lens instructions — verbatim from ralph-plan
const LENS = {
  'feasibility': "Can this be built as described? Look for technical impossibilities, unrealistic estimates, missing prerequisites, and dependencies that don't exist. Use WebSearch to verify external dependencies, APIs, and third-party tools referenced in the plan actually exist and work as described.",
  'gaps-and-edge-cases': "What's missing? Look for unhandled error cases, race conditions, partial failures, unhandled workflows, missing validation, and implicit assumptions.",
  'security-and-risk': "Look for injection vectors, secrets handling issues, auth gaps, blast radius concerns, supply chain risks, and insufficient input validation.",
  'maintainability': "Evaluate testability, abstraction quality, coupling, observability, and future-proofing. Look for code that will be hard to debug, extend, or operate.",
  'scope-and-priorities': "Is the scope bounded? Separate MVP from nice-to-have. Look for contradictions, premature decisions, gold-plating, and features that should be deferred.",
  'pragmatic-security': "Light, pragmatic security review. Focus on: secrets/credentials accidentally logged or persisted, obvious injection vectors on user-facing inputs, missing auth or authorization on destructive or sensitive operations, and unsafe defaults. Skip deep threat modeling, supply chain analysis, and blast-radius modeling — flag those only if egregious.",
  'simplicity-and-clarity': "Optimize for low cognitive load and minimal scope. Look for: scope creep beyond the stated goal, premature abstraction, unnecessary configurability or layering, gold-plating, and structures that a new reader would not grok in one pass. Prefer fewer moving parts, clearer names, and inlined logic over indirection. Flag anything that adds surface area without clear payoff.",
}
const DEFAULT_LENSES = ['feasibility', 'gaps-and-edge-cases', 'security-and-risk', 'maintainability', 'scope-and-priorities']
const LIGHT_LENSES = ['feasibility', 'gaps-and-edge-cases', 'pragmatic-security', 'simplicity-and-clarity']

let LENSES = Array.isArray(A.lenses) && A.lenses.length ? A.lenses : (A.light ? LIGHT_LENSES : DEFAULT_LENSES)
// Custom lens names with no preset instruction get a generic one
const lensInstr = (l) => LENS[l] || `Focus on ${l}. Identify issues, gaps, and risks through this lens.`

const codebaseRule = NO_CODEBASE
  ? 'You do NOT have codebase access. Evaluate the plan on its own merits.'
  : 'Use Read, Grep, Glob to verify plan claims against the actual codebase. For the feasibility lens, use WebSearch to confirm external dependencies/APIs exist.'

const contextBlock = CONTEXT_FILES.length
  ? `\n## Additional context — read these files first:\n${CONTEXT_FILES.map((f) => `- ${f}`).join('\n')}\n`
  : ''

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------
const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lens: { type: 'string' },
    fixes: {
      type: 'array',
      description: 'Fixable issues: missing detail, vague language, gaps, contradictions, prose/code mismatch. Each is a concrete edit for the merge agent to apply.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          location: { type: 'string', description: 'Heading or a short verbatim quote identifying where in the plan' },
          problem: { type: 'string' },
          edit: { type: 'string', description: 'The concrete change to make — what to add/rewrite/remove, precisely enough to apply without further judgment' },
        },
        required: ['location', 'problem', 'edit'],
      },
    },
    questions: {
      type: 'array',
      description: 'Ambiguous issues needing human judgment (multiple valid approaches, business decisions). NOT prose/code mismatches — those are always fixes.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'string' },
          context: { type: 'string', description: 'Why it matters, the trade-offs' },
          default: { type: 'string', description: 'What you would do if forced to choose, and why' },
        },
        required: ['question', 'context', 'default'],
      },
    },
  },
  required: ['lens', 'fixes', 'questions'],
}

const MERGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    editsApplied: { type: 'number' },
    questionsLogged: { type: 'number' },
    questionsResolved: { type: 'number' },
    notes: { type: 'string', description: 'Most significant edits, and any findings deliberately skipped (conflicting/wrong) with why' },
  },
  required: ['editsApplied', 'questionsLogged', 'notes'],
}

// --------------------------------------------------------------------------
// Phase 0 — Snapshot original (for the summary diff)
// --------------------------------------------------------------------------
phase('Snapshot')
await agent(
  `Copy the plan file to a snapshot so a before/after diff can be produced later.\n` +
  `Run: cp "${PLAN}" "${ORIG}"\n` +
  `Also ensure the questions file exists: touch "${QUESTIONS}"\n` +
  `If "${PLAN}" does not exist, STOP and report that — do not create it.\n` +
  `Return a one-line confirmation.`,
  { label: 'snapshot', phase: 'Snapshot' },
)

// --------------------------------------------------------------------------
// Phase 1 — External sparring (optional, sequential single-writer)
// Each external reviewer's feedback is integrated into the plan in place.
// --------------------------------------------------------------------------
if (SPARRING_CMDS.length) {
  phase('Sparring')
  for (let s = 0; s < SPARRING_CMDS.length; s++) {
    const cmd = SPARRING_CMDS[s]
    await agent(
      `An external (non-Claude) reviewer should critique the plan, then you integrate the valid feedback.\n\n` +
      `## Step 1 — get external feedback\n` +
      `Pipe the plan into the external reviewer with a 300s timeout and capture its output:\n` +
      `  timeout 300 ${cmd} < "${PLAN}"   (you may need to craft a critique prompt around the plan content — read "${PLAN}" first and feed it a prompt asking for a critical review).\n` +
      `If the command is missing, times out, or returns empty, skip integration and report that — do NOT edit the plan.\n` +
      `If the output exceeds ~50k chars, use only the first 50k.\n\n` +
      `## Step 2 — integrate (you are the ONLY writer)\n` +
      `For each piece of feedback: if valid and fixable → edit "${PLAN}". If valid but ambiguous → append to "${QUESTIONS}" (Q/Context/Default format). If wrong or already addressed → skip.\n` +
      `External reviewers lack codebase context — verify claims against the codebase before acting (${NO_CODEBASE ? 'codebase access is OFF — judge on plan merits' : 'use Read/Grep/Glob'}).\n` +
      `Make surgical edits. Do NOT remove content unless contradicted. Never shrink the plan drastically.\n` +
      `Return a brief summary of what you integrated and what you skipped.`,
      { label: `spar:${cmd.split(' ')[0]}`, phase: 'Sparring' },
    )
  }
}

// --------------------------------------------------------------------------
// Phases 2+3 — Critique (parallel, read-only) → Merge (single writer)
// Looped per round; each round re-critiques the merged plan (self-healing).
// --------------------------------------------------------------------------
let totalEdits = 0
for (let r = 1; r <= ROUNDS; r++) {
  if (ROUNDS > 1) log(`Round ${r}/${ROUNDS}`)

  phase('Critique')
  const findings = (await parallel(LENSES.map((lens) => () =>
    agent(
      `You are a plan reviewer. REVIEW ONLY — do NOT edit any file. Another agent applies fixes.\n\n` +
      `## Your lens: ${lens}\n${lensInstr(lens)}\n\n` +
      `## Files\n- Plan: ${PLAN}\n- Open questions (already logged — do NOT re-log these): ${QUESTIONS}\n${contextBlock}\n` +
      `## Rules\n` +
      `1. Read the plan thoroughly through your lens. Read the questions file so you don't duplicate existing questions.\n` +
      `2. ${codebaseRule}\n` +
      `3. Classify each issue:\n` +
      `   - Fixable (missing detail, vague language, gap, contradiction, prose/code mismatch) → emit a 'fixes' entry with a precise, ready-to-apply edit.\n` +
      `   - Prose vs code mismatch is ALWAYS a fix, never a question — name which side is correct in the edit.\n` +
      `   - Ambiguous (needs human judgment, multiple valid approaches, business decision) → emit a 'questions' entry.\n` +
      `4. Do NOT propose removing content unless it's contradicted by other content. Do NOT invent scope or speculative features.\n` +
      `5. Surgical, concise edits that preserve the plan's voice and structure.\n\n` +
      `Return your structured findings.`,
      { label: `lens:${lens}`, phase: 'Critique', schema: FINDINGS_SCHEMA },
    )
  ))).filter(Boolean)

  const allFixes = findings.flatMap((f) => (f.fixes || []).map((x) => ({ ...x, lens: f.lens })))
  const allQs = findings.flatMap((f) => (f.questions || []).map((x) => ({ ...x, lens: f.lens })))

  if (!allFixes.length && !allQs.length) {
    log(`Round ${r}: no findings — converged.`)
    break
  }

  phase('Merge')
  const merge = await agent(
    `You are the SINGLE WRITER for this plan. Apply the fixes below and log the open questions. No other agent is editing concurrently.\n\n` +
    `## Files\n- Plan to edit: ${PLAN}\n- Open questions file (append/dedup): ${QUESTIONS}\n\n` +
    `## Fixes to apply (${allFixes.length}) — from parallel lens reviews\n` +
    `\`\`\`json\n${JSON.stringify(allFixes, null, 2)}\n\`\`\`\n\n` +
    `## Ambiguous questions to log (${allQs.length})\n` +
    `\`\`\`json\n${JSON.stringify(allQs, null, 2)}\n\`\`\`\n\n` +
    `## Instructions\n` +
    `1. Read "${PLAN}" in full first.\n` +
    `2. Apply each fix with a surgical Edit. If two fixes conflict, reconcile them — keep the plan internally consistent. If a fix is wrong, already done, or would harm the plan, SKIP it and note why.\n` +
    `3. Append each question to "${QUESTIONS}" in this format (skip exact duplicates of what's already there):\n` +
    `   Q: <question>\n   Context: <why it matters / trade-offs>\n   Default: <what you'd do if forced, and why>\n` +
    `4. If applying edits resolves a question already in the file, remove that question and count it as resolved.\n` +
    `5. CORRUPTION GUARD: never delete large sections or drastically shrink the plan. Preserve voice and structure.\n\n` +
    `Return the counts and notes.`,
    { label: 'merge', phase: 'Merge', schema: MERGE_SCHEMA },
  )
  totalEdits += (merge?.editsApplied || 0)
}

// --------------------------------------------------------------------------
// Phase 4 — Final polish (single writer)
// --------------------------------------------------------------------------
phase('Polish')
await agent(
  `Final consistency pass on a plan refined through multiple review rounds.\n\n` +
  `## Files\n- Plan: ${PLAN}\n- Open questions: ${QUESTIONS}\n\n` +
  `## Instructions\n` +
  `1. Read the plan end-to-end and fix:\n` +
  `   - Internal contradictions (edits from different lenses may conflict)\n` +
  `   - PROSE vs CODE mismatches — for every code snippet, verify it implements what the surrounding prose says; if they disagree, determine which is correct and fix the other. Highest priority.\n` +
  `   - Inconsistent terminology, formatting issues, redundant sections\n` +
  `2. Clean up "${QUESTIONS}": remove duplicates, remove questions the plan now answers, group related ones, format as numbered markdown with severity tags. Overwrite the file.\n` +
  `Output: "Refinement complete. [N] open questions remain."`,
  { label: 'polish', phase: 'Polish' },
)

// --------------------------------------------------------------------------
// Phase 5 — Change summary (read-only, returned to caller)
// --------------------------------------------------------------------------
phase('Summary')
const summary = await agent(
  `Summarize the changes made during plan refinement. Print the summary as your output — do NOT write it to a file.\n\n` +
  `## Files\n- Original plan: ${ORIG}\n- Refined plan: ${PLAN}\n- Open questions: ${QUESTIONS}\n\n` +
  `Read all three, diff original vs refined, and produce EXACTLY this markdown structure (1-2 sentences per bullet, omit empty sections):\n\n` +
  `## What changed\n\n### Added\n- ...\n\n### Removed\n- ...\n\n### Changed\n- ... (and why)\n\n### Open questions (need your input)\n- one bullet per question from the questions file\n\n` +
  `If the questions file is empty: "None — all questions were resolved during refinement." Keep it scannable; substance over formatting tweaks.`,
  { label: 'summary', phase: 'Summary' },
)

log(`Plan refinement complete. Refined: ${PLAN} · Questions: ${QUESTIONS} · Original snapshot: ${ORIG}`)
return { plan: PLAN, questions: QUESTIONS, original: ORIG, rounds: ROUNDS, lenses: LENSES, totalEdits, summary }
