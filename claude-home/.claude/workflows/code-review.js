export const meta = {
  name: 'code-review',
  description: 'Final branch code review: parallel persona critique → adversarial verify each finding → single dedup-aware filer → ship verdict',
  whenToUse: 'Review git diff <base>..HEAD before shipping. Workflow port of the ralph-review bash tool, plus an adversarial verify pass the bash version lacks. Pass {base, light, tag, plan, noPlan, verifiers} via args; defaults to base=main, full mode.',
  phases: [
    { title: 'Preflight', detail: 'resolve base ref, confirm a diff exists, detect plan' },
    { title: 'Review', detail: 'one read-only persona per lens, structured findings' },
    { title: 'Verify', detail: 'adversarial refute pass per finding, majority vote' },
    { title: 'File', detail: 'single writer dedups vs vima and files confirmed tickets' },
  ],
}

// --------------------------------------------------------------------------
// Args + defaults (mirrors ralph-review flags)
// --------------------------------------------------------------------------
const A = args || {}
const BASE = A.base || 'main'
const LIGHT = A.light === true
const TAG = A.tag || ''
const PLAN_FILE = A.plan || 'PLAN.md'
const NO_PLAN = A.noPlan === true
const VERIFIERS = Math.max(1, A.verifiers || 3) // refuters per finding
const tagFlag = TAG ? `--tags ${TAG}` : ''

// --------------------------------------------------------------------------
// Personas — ported verbatim from prompts/final-review-*.md, adapted to
// RETURN findings instead of filing tickets (a later stage files them).
// --------------------------------------------------------------------------
const FULL = {
  security: {
    role: 'security reviewer',
    focus:
      '- OWASP top 10 vulnerabilities\n' +
      '- Injection flaws (command, SQL, XSS, template)\n' +
      '- Authentication and authorization weaknesses\n' +
      '- Secrets, credentials, or API keys in code\n' +
      '- Dependency vulnerabilities or insecure imports\n' +
      '- Insecure file operations or path traversal',
    fixType: 'bug', fixPriority: 1, kaizen: true,
    pass: 'SECURITY_PASS', issues: 'SECURITY_ISSUES',
  },
  integration: {
    role: 'integration reviewer',
    focus:
      '- Cross-ticket state integrity (do changes from different tickets work together?)\n' +
      '- Broken interfaces (function signatures, API contracts, type mismatches)\n' +
      '- Conflicting assumptions between different changes\n' +
      '- Race conditions or ordering issues\n' +
      '- Missing integration glue (imports, config, wiring)',
    fixType: 'bug', fixPriority: 2, kaizen: true,
    pass: 'INTEGRATION_PASS', issues: 'INTEGRATION_ISSUES',
  },
  patterns: {
    role: 'codebase patterns reviewer',
    focus:
      '- Code duplication vs existing utilities (did the agent rewrite something that already exists?)\n' +
      '- Pattern and convention violations (naming, file structure, error handling style)\n' +
      '- Library reuse vs rolling own (existing deps that should have been used?)\n' +
      '- Conflicting or redundant dependencies added\n' +
      '- Style consistency with the rest of the codebase',
    fixType: 'task', fixPriority: 3, kaizen: true,
    pass: 'PATTERNS_PASS', issues: 'PATTERNS_ISSUES',
  },
}

const LIGHT_PERSONAS = {
  'pragmatic-security': {
    role: 'pragmatic security reviewer (light, high-signal)',
    focus:
      '- Secrets, credentials, or API keys accidentally committed or logged\n' +
      '- Obvious injection vectors on user-facing inputs (command, SQL, template)\n' +
      '- Missing auth or authorization on destructive or sensitive operations\n' +
      '- Unsafe defaults (open ACLs, disabled TLS verification, eval of untrusted input)\n' +
      '- Path traversal on user-controlled file paths\n' +
      'SKIP deep threat modeling, supply chain, theoretical risks. If unsure whether exploitable, do NOT report.',
    fixType: 'bug', fixPriority: 1, kaizen: false,
    pass: 'SECURITY_PASS', issues: 'SECURITY_ISSUES',
  },
  'integration-light': {
    role: 'pragmatic integration reviewer (light, high-signal)',
    focus:
      '- Broken interfaces (function signatures, API contracts, type mismatches)\n' +
      '- Missing integration glue (imports, config, wiring)\n' +
      '- Obvious cross-change conflicts (incompatible state assumptions)\n' +
      '- Clear bugs in changed code (off-by-one, null deref, wrong operator)\n' +
      'SKIP subtle races, theoretical ordering, style nits, conventions, plan adherence. If unsure it is broken, do NOT report.',
    fixType: 'bug', fixPriority: 2, kaizen: false,
    pass: 'INTEGRATION_PASS', issues: 'INTEGRATION_ISSUES',
  },
}

const PLAN_PERSONA = {
  role: 'plan adherence reviewer',
  focus:
    '- Are all planned features/changes implemented?\n' +
    '- Missing requirements or unimplemented items?\n' +
    '- Scope creep (work not in the plan)?\n' +
    '- Requirement misinterpretations?\n' +
    '- Were deviations from the plan beneficial and justified?',
  fixType: 'task', fixPriority: 2, kaizen: true,
  pass: 'PLAN_PASS', issues: 'PLAN_ISSUES',
}

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------
const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    persona: { type: 'string' },
    verdict: { type: 'string', enum: ['PASS', 'ISSUES'] },
    summary: { type: 'string', description: '2-4 sentence summary of scope, key files, notable findings or their absence' },
    fixes: {
      type: 'array',
      description: 'Issues INTRODUCED by this diff that should block or be fixed. Empty if none.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'Short imperative, e.g. "command injection in deploy path"' },
          type: { type: 'string', enum: ['bug', 'task'] },
          priority: { type: 'number', description: '1=critical … 4=backlog' },
          problem: { type: 'string', description: "What's wrong and how to fix it" },
          acceptance: { type: 'string', description: 'How to verify the fix' },
          evidence: { type: 'string', description: 'file:line and the specific diff hunk that proves the issue' },
        },
        required: ['title', 'type', 'priority', 'problem', 'acceptance', 'evidence'],
      },
    },
    kaizen: {
      type: 'array',
      description: 'Pre-existing improvements in surrounding code NOT introduced by this diff. Genuinely useful only — no nits. Empty in light mode.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          problem: { type: 'string', description: "What's wrong and why it matters" },
          acceptance: { type: 'string' },
          evidence: { type: 'string', description: 'file:line' },
        },
        required: ['title', 'problem', 'acceptance', 'evidence'],
      },
    },
  },
  required: ['persona', 'verdict', 'summary', 'fixes', 'kaizen'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    refuted: { type: 'boolean', description: 'true if the finding is wrong, not real, or miscategorized' },
    reasoning: { type: 'string', description: 'One or two sentences citing the diff' },
  },
  required: ['refuted', 'reasoning'],
}

const FILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    filed: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['fix', 'kaizen'] },
          id: { type: 'string' },
          priority: { type: 'number' },
          title: { type: 'string' },
          persona: { type: 'string' },
        },
        required: ['kind', 'id', 'priority', 'title', 'persona'],
      },
    },
    skippedDuplicates: { type: 'number' },
  },
  required: ['filed', 'skippedDuplicates'],
}

// --------------------------------------------------------------------------
// Phase 0 — Preflight: resolve base, confirm diff, detect plan
// --------------------------------------------------------------------------
phase('Preflight')
const PREFLIGHT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    baseRef: { type: 'string', description: 'resolved base commit sha (merge-base for branches, direct for commits/tags)' },
    baseKind: { type: 'string', enum: ['branch', 'commit', 'missing'] },
    hasChanges: { type: 'boolean' },
    shortstat: { type: 'string' },
    planExists: { type: 'boolean' },
  },
  required: ['baseRef', 'baseKind', 'hasChanges', 'shortstat', 'planExists'],
}
const pre = await agent(
  `Resolve the review base and confirm there is something to review. Do NOT modify anything.\n\n` +
  `Base ref input: "${BASE}".\n` +
  `1. If "${BASE}" is not a valid commit/branch/tag, set baseKind="missing" and stop.\n` +
  `2. If "${BASE}" is a local or remote branch: baseKind="branch", baseRef = \`git merge-base HEAD "${BASE}"\`.\n` +
  `   Otherwise (commit sha or tag): baseKind="commit", baseRef = \`git rev-parse "${BASE}^{commit}"\`.\n` +
  `3. hasChanges = is \`git diff --name-only <baseRef>..HEAD\` non-empty.\n` +
  `4. shortstat = output of \`git diff --shortstat <baseRef>..HEAD\` (trimmed).\n` +
  `5. planExists = does the file "${PLAN_FILE}" exist.\n` +
  `Return the structured result.`,
  { label: 'preflight', phase: 'Preflight', schema: PREFLIGHT_SCHEMA },
)

if (!pre || pre.baseKind === 'missing') {
  log(`Base ref not found: ${BASE} — aborting.`)
  return { aborted: 'base-ref-not-found', base: BASE }
}
if (!pre.hasChanges) {
  log(`No changes between ${BASE} and HEAD — nothing to review.`)
  return { aborted: 'no-changes', base: BASE, baseRef: pre.baseRef }
}
const BASE_REF = pre.baseRef
const usePlan = !LIGHT && !NO_PLAN && pre.planExists
log(`base ${BASE} (${pre.baseKind} ${BASE_REF.slice(0, 7)}) · ${pre.shortstat}${usePlan ? ` · plan ${PLAN_FILE}` : ''}`)

// Build the active persona set (usePlan already implies !LIGHT)
const personas = Object.entries(LIGHT ? LIGHT_PERSONAS : FULL).map(([key, p]) => ({ key, ...p }))
if (usePlan) personas.push({ key: 'plan', ...PLAN_PERSONA })

// --------------------------------------------------------------------------
// Review prompt builder
// --------------------------------------------------------------------------
const reviewPrompt = (p) =>
  `You are a ${p.role} performing a final review of changes on this branch. REVIEW ONLY — do NOT modify code, do NOT create or touch tickets. Another agent files findings later.\n\n` +
  `## Scope\nRun: git diff ${BASE_REF}..HEAD\nReview every change through your lens.\n\n` +
  `## Lens: ${p.key}\n${p.focus}\n` +
  (p.key === 'plan'
    ? `\n## Original plan (read it): ${PLAN_FILE}\nCompare the diff against this plan.\n`
    : '') +
  `\n## Classify each issue\n` +
  `- A FIX is an issue INTRODUCED by this diff. Default type=${p.fixType}, priority=${p.fixPriority} (raise/lower priority by real severity). Each fix needs evidence: file:line and the diff hunk proving it.\n` +
  (p.kaizen
    ? `- A KAIZEN is a pre-existing issue in surrounding code NOT introduced by this diff, worth fixing. Only genuinely useful improvements — no stylistic nits, no theoretical risks.\n`
    : `- Do NOT report kaizen in light mode. Keep signal high — only file what's clearly real and impactful.\n`) +
  `- If unsure whether something is real, leave it out. Precision over recall.\n\n` +
  `Write your 2-4 sentence summary, set verdict=ISSUES if you found any fixes (kaizen does not affect verdict), else PASS. Return structured findings.`

// --------------------------------------------------------------------------
// Phases 1+2 — Review (parallel persona) → Verify (adversarial, per finding)
// Pipeline: each persona's findings start verifying the moment that persona
// finishes — no barrier between review and verify.
// --------------------------------------------------------------------------
const reviewed = await pipeline(
  personas,
  (p) => agent(reviewPrompt(p), { label: `review:${p.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }),
  (findings, p) => {
    if (!findings) return { persona: p.key, summary: '(review failed)', verdict: 'PASS', fixes: [], kaizen: [] }
    const items = [
      ...(findings.fixes || []).map((f) => ({ ...f, kind: 'fix' })),
      ...(findings.kaizen || []).map((f) => ({ ...f, kind: 'kaizen', priority: 4 })),
    ]
    if (!items.length) return { ...findings, persona: p.key, confirmed: [] }
    return parallel(items.map((item) => () =>
      // VERIFIERS independent refuters; finding survives only on majority "real"
      parallel(Array.from({ length: VERIFIERS }, (_, i) => () =>
        agent(
          `Adversarially verify a code-review finding. Your DEFAULT is refuted=true — only set refuted=false if the evidence clearly holds. Do NOT edit anything.\n\n` +
          `## The diff under review\nRun: git diff ${BASE_REF}..HEAD\n\n` +
          `## Finding (${item.kind}, from the ${p.key} lens)\n` +
          `Title: ${item.title}\nProblem: ${item.problem}\nEvidence claimed: ${item.evidence}\n\n` +
          `## Decide\n` +
          (item.kind === 'fix'
            ? `Is this a REAL issue ACTUALLY INTRODUCED by this diff (present at the cited location, caused by these changes)? If it's pre-existing, not in the diff, not actually wrong, or the evidence misreads the code → refuted=true.`
            : `Is this a REAL pre-existing issue worth fixing, NOT introduced by this diff, and not a stylistic nit? If trivial, speculative, or actually introduced by the diff → refuted=true.`) +
          `\nReturn your verdict.`,
          { label: `verify:${p.key}:${item.title.slice(0, 28)}`, phase: 'Verify', schema: VERDICT_SCHEMA },
        )
      )).then((votes) => {
        const real = votes.filter(Boolean).filter((v) => !v.refuted).length
        return { item, survives: real > VERIFIERS / 2, votes: votes.filter(Boolean).length, real }
      })
    )).then((results) => ({
      ...findings,
      persona: p.key,
      confirmed: results.filter((r) => r.survives).map((r) => r.item),
      killed: results.filter((r) => !r.survives).length,
    }))
  },
)

const personaResults = reviewed.filter(Boolean)
const confirmed = personaResults.flatMap((r) =>
  (r.confirmed || []).map((item) => ({ ...item, persona: r.persona })))
const killedTotal = personaResults.reduce((n, r) => n + (r.killed || 0), 0)
log(`personas ${personaResults.length} · confirmed ${confirmed.length} · refuted ${killedTotal}`)

// --------------------------------------------------------------------------
// Phase 3 — File: single writer dedups vs vima and files confirmed findings
// (barrier already reached — pipeline returned all verified findings)
// --------------------------------------------------------------------------
let fileResult = { filed: [], skippedDuplicates: 0 }
if (confirmed.length) {
  phase('File')
  fileResult = await agent(
    `You are the SINGLE WRITER filing confirmed review findings as vima tickets. No other agent is filing concurrently.\n\n` +
    `## Confirmed findings (already adversarially verified — all are real)\n` +
    `\`\`\`json\n${JSON.stringify(confirmed, null, 2)}\n\`\`\`\n\n` +
    `## Rules\n` +
    `1. First read existing titles: \`vima list | jq -r '.[].title'\`. Dedup BOTH against existing tickets AND across this batch (two personas may report the same issue in different words) — file each distinct issue once, count the rest as skippedDuplicates.\n` +
    `2. For a FIX:\n` +
    `   ID=$(vima create "Fix: <title>" --type <type> --priority <priority> ${tagFlag} --description "<problem>" --acceptance "<acceptance>" | tail -1 | jq -r '.id')\n` +
    `3. For a KAIZEN:\n` +
    `   ID=$(vima create "Kaizen: <title>" --type task --priority 4 --tags kaizen${TAG ? ` ${TAG}` : ''} --description "<problem>" --acceptance "<acceptance>" | tail -1 | jq -r '.id')\n` +
    `4. Do NOT modify code. Do NOT close or change ticket status. Only create tickets.\n` +
    `Return the filed tickets (with real ids) and the duplicate-skip count.`,
    { label: 'file', phase: 'File', schema: FILE_SCHEMA },
  )
}

// --------------------------------------------------------------------------
// Roll-up — ship verdict (mirrors ralph-review buckets)
// --------------------------------------------------------------------------
const filed = fileResult.filed || []
const fixes = filed.filter((t) => t.kind === 'fix')
const mustFix = fixes.filter((t) => t.priority === 1 || t.priority === 2)
const shouldFix = fixes.filter((t) => t.priority === 3)
const otherFix = fixes.filter((t) => t.priority > 3)
const kaizen = filed.filter((t) => t.kind === 'kaizen')
const deferrable = shouldFix.length + otherFix.length + kaizen.length

let verdict
if (mustFix.length) verdict = `blocked — ${mustFix.length} P1/P2 fix(es) must land before ship`
else if (deferrable) verdict = `ship-ready — no P1/P2 blockers; ${deferrable} deferrable ticket(s) filed`
else verdict = `clean — nothing filed`

log(`verdict: ${verdict}`)

return {
  base: BASE,
  baseRef: BASE_REF,
  mode: LIGHT ? 'light' : 'full',
  shortstat: pre.shortstat,
  personas: personaResults.map((r) => ({ persona: r.persona, verdict: r.verdict, summary: r.summary })),
  confirmed: confirmed.length,
  refuted: killedTotal,
  filed,
  skippedDuplicates: fileResult.skippedDuplicates || 0,
  buckets: {
    mustFix: mustFix.length,
    shouldFix: shouldFix.length,
    otherFix: otherFix.length,
    kaizen: kaizen.length,
  },
  shipReady: mustFix.length === 0,
  verdict,
}
