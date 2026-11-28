/**
 * Safe Zero-Dependency Parametric Variable Engine for `/on-tap`
 * Mirrors `review_xlsx.py` 1-to-1 so built-in lessons and Excel-imported lessons
 * share the exact same `BienSo` + `{{expr}}` syntax!
 *
 * Syntax examples for `vars` (`BienSo`):
 *   "u1 = 1 [-3..5]; d = 3 [2..6, !=0]; m = 12 [8..12]"
 *   "u1 = 3 [1..5]; q = 2 {-3, -2, 2, 3}; n = 7 [4..7]"
 *
 * Template placeholders:
 *   `{{expr}}` inside question, options, answer, explanation.
 *   Supports: + - * / ^ ( ), abs, round, floor, ceil, sqrt, min, max, signed, paren
 */

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Parse a `BienSo` specification string into ordered variable descriptors:
 * [{ name, fixed, kind: 'range' | 'list', min, max, excludeZero, choices }]
 */
export function parseParamVarsSpec(varsStr) {
  const specs = [];
  const raw = String(varsStr || '').trim();
  if (!raw) return specs;

  const chunks = raw.split(/\s*;\s*/).filter(Boolean);
  for (const chunk of chunks) {
    const m = chunk.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(-?\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!m) continue;
    const name = m[1];
    const fixed = Number(m[2].replace(',', '.'));
    const rest = (m[3] || '').trim();

    // Discrete set: {-3, -2, 2, 3}
    const listMatch = rest.match(/^\{([^}]+)\}$/);
    if (listMatch) {
      const choices = listMatch[1]
        .split(/\s*,\s*/)
        .map((s) => Number(s.trim().replace(',', '.')))
        .filter((n) => Number.isFinite(n));
      specs.push({
        name,
        fixed,
        kind: 'list',
        choices: choices.length ? choices : [fixed],
      });
      continue;
    }

    // Integer range: [-5..8] or [-5..8, !=0]
    const rangeMatch = rest.match(/^\[(-?\d+)\s*(?:\.\.|to|:)\s*(-?\d+)(?:\s*,\s*(.*))?\]$/i);
    if (rangeMatch) {
      const lo = Math.min(Number(rangeMatch[1]), Number(rangeMatch[2]));
      const hi = Math.max(Number(rangeMatch[1]), Number(rangeMatch[2]));
      const flags = (rangeMatch[3] || '').toLowerCase();
      const excludeZero = flags.includes('!=0') || flags.includes('<>0') || flags.includes('khac0') || flags.includes('nonzero');
      specs.push({
        name,
        fixed,
        kind: 'range',
        min: lo,
        max: hi,
        excludeZero,
      });
      continue;
    }

    // Constant only (no random domain)
    specs.push({
      name,
      fixed,
      kind: 'list',
      choices: [fixed],
    });
  }
  return specs;
}

export function getFixedVarValues(varsSpec) {
  const specs = Array.isArray(varsSpec) ? varsSpec : parseParamVarsSpec(varsSpec);
  const env = {};
  for (const sp of specs) env[sp.name] = sp.fixed;
  return env;
}

export function sampleRandomVarValues(varsSpec) {
  const specs = Array.isArray(varsSpec) ? varsSpec : parseParamVarsSpec(varsSpec);
  const env = {};
  for (const sp of specs) {
    if (sp.kind === 'list') {
      const pool = sp.choices?.length ? sp.choices : [sp.fixed];
      env[sp.name] = pool[Math.floor(Math.random() * pool.length)];
    } else if (sp.kind === 'range') {
      const pool = [];
      for (let v = sp.min; v <= sp.max; v++) {
        if (sp.excludeZero && v === 0) continue;
        pool.push(v);
      }
      env[sp.name] = pool.length ? pool[Math.floor(Math.random() * pool.length)] : sp.fixed;
    } else {
      env[sp.name] = sp.fixed;
    }
  }
  return env;
}

// =========================================================================
// SAFE RECURSIVE-DESCENT MATH EXPRESSION EVALUATOR (NO eval / Function!)
// =========================================================================

function tokenizeExpr(expr) {
  const tokens = [];
  let i = 0;
  const s = String(expr || '');
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push({ type: 'num', val: Number(s.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      tokens.push({ type: 'ident', val: s.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '*' && s[i + 1] === '*') {
      tokens.push({ type: 'op', val: '^' });
      i += 2;
      continue;
    }
    if ('+-*/^(),'.includes(ch)) {
      tokens.push({ type: ch === ',' ? 'comma' : ch === '(' || ch === ')' ? ch : 'op', val: ch });
      i++;
      continue;
    }
    throw new Error(`Unsupported token '${ch}'`);
  }
  return tokens;
}

export function evalSafeMathExpr(expr, env = {}) {
  const trimmed = String(expr || '').trim();
  if (!trimmed) return '';

  // Special string formatting helpers: signed(expr), paren(expr)
  const helperMatch = trimmed.match(/^(signed|paren)\s*\(([\s\S]+)\)$/);
  if (helperMatch) {
    const fn = helperMatch[1];
    const num = evalSafeMathExpr(helperMatch[2], env);
    if (typeof num !== 'number' || !Number.isFinite(num)) return String(num);
    const fmt = formatParamNumber(num);
    if (fn === 'signed') {
      if (num > 0) return `+ ${fmt}`;
      if (num < 0) return `- ${formatParamNumber(Math.abs(num))}`;
      return '';
    }
    if (fn === 'paren') {
      return num < 0 ? `(${fmt})` : fmt;
    }
  }

  const tokens = tokenizeExpr(trimmed);
  let pos = 0;

  const peek = () => tokens[pos] || null;
  const consume = () => tokens[pos++];

  function parseAddSub() {
    let left = parseMulDiv();
    while (peek()?.type === 'op' && (peek().val === '+' || peek().val === '-')) {
      const op = consume().val;
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseMulDiv() {
    let left = parseUnary();
    while (peek()?.type === 'op' && (peek().val === '*' || peek().val === '/')) {
      const op = consume().val;
      const right = parseUnary();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parseUnary() {
    if (peek()?.type === 'op' && (peek().val === '+' || peek().val === '-')) {
      const op = consume().val;
      const val = parseUnary();
      return op === '-' ? -val : val;
    }
    return parsePow();
  }

  function parsePow() {
    let base = parsePrimary();
    if (peek()?.type === 'op' && peek().val === '^') {
      consume();
      const exp = parseUnary();
      base = Math.pow(base, exp);
    }
    return base;
  }

  function parsePrimary() {
    const tok = peek();
    if (!tok) throw new Error('Unexpected end of expression');
    if (tok.type === 'num') {
      consume();
      return tok.val;
    }
    if (tok.type === 'ident') {
      consume();
      if (peek()?.type === '(') {
        consume();
        const args = [];
        if (peek()?.type !== ')') {
          args.push(parseAddSub());
          while (peek()?.type === 'comma') {
            consume();
            args.push(parseAddSub());
          }
        }
        if (peek()?.type !== ')') throw new Error('Missing closing parenthesis');
        consume();
        switch (tok.val.toLowerCase()) {
          case 'abs': return Math.abs(args[0]);
          case 'round': return Math.round(args[0]);
          case 'floor': return Math.floor(args[0]);
          case 'ceil': return Math.ceil(args[0]);
          case 'sqrt': return Math.sqrt(args[0]);
          case 'min': return Math.min(...args);
          case 'max': return Math.max(...args);
          default: throw new Error(`Unknown function ${tok.val}`);
        }
      }
      if (Object.prototype.hasOwnProperty.call(env, tok.val)) {
        return Number(env[tok.val]);
      }
      throw new Error(`Unknown variable ${tok.val}`);
    }
    if (tok.type === '(') {
      consume();
      const val = parseAddSub();
      if (peek()?.type !== ')') throw new Error('Missing closing parenthesis');
      consume();
      return val;
    }
    throw new Error(`Unexpected token ${tok.val}`);
  }

  const res = parseAddSub();
  if (pos < tokens.length) throw new Error('Trailing tokens in expression');
  return res;
}

export function formatParamNumber(num) {
  if (typeof num !== 'number' || !Number.isFinite(num)) return String(num ?? '');
  const clean = Math.abs(num) < 1e-10 ? 0 : Number(num.toPrecision(10));
  if (Number.isInteger(clean)) return String(clean);
  // Format with Vietnamese decimal comma, up to 2 decimals cleanly
  const rounded = Math.round(clean * 100) / 100;
  return String(rounded).replace('.', ',');
}

export function renderParamTemplate(tpl, env) {
  const s = String(tpl ?? '');
  if (!s.includes('{{')) return s;
  return s.replace(/\{\{([^{}]+)\}\}/g, (match, inner) => {
    try {
      const val = evalSafeMathExpr(inner, env);
      return typeof val === 'number' ? formatParamNumber(val) : String(val);
    } catch {
      return match;
    }
  });
}

/**
 * Generate a fresh randomized short-answer question from a lesson's parametric `shortAnswer` pool!
 * Guarantees the answer fits BGD 2025 4-box short-answer slots (<= 4 chars) and avoids repeating the previous prompt.
 */
export function getParametricShortAnswerPool(lesson) {
  const sas = lesson?.quizzes?.shortAnswer || [];
  return sas.filter(
    (q) => q && q.paramSpec && typeof q.paramSpec.vars === 'string' && q.paramSpec.vars.trim() !== ''
  );
}

export function generateRandomFromShortAnswers(lesson, { prevPrompt = '', prevSourceId = '' } = {}) {
  const pool = getParametricShortAnswerPool(lesson);
  if (!pool.length) return null;

  // Prefer picking a different question template when >= 2 exist
  const preferredPool =
    pool.length > 1 && prevSourceId ? pool.filter((q) => q.id !== prevSourceId) : pool;

  const tryPickFrom = (list) => {
    const picked = list[Math.floor(Math.random() * list.length)];
    const spec = picked.paramSpec;
    const varDefs = parseParamVarsSpec(spec.vars);
    const qTpl = spec.questionTemplate || picked.question || '';
    const aTpl = spec.answerTemplate || picked.correctAnswer || '';
    const eTpl = spec.explanationTemplate || picked.explanation || '';

    for (let attempt = 0; attempt < 45; attempt++) {
      const env = sampleRandomVarValues(varDefs);
      const ans = renderParamTemplate(aTpl, env).trim();
      const ansClean = ans.replace(/\s+/g, '');
      // Must fit 4-box short answer (digits, comma, minus, length 1..4)
      if (!ansClean || ansClean.length > 4 || !/^-?[0-9,]+$/.test(ansClean)) {
        continue;
      }
      const prompt = renderParamTemplate(qTpl, env);
      if (prompt === prevPrompt && attempt < 30) continue;
      const solution = renderParamTemplate(eTpl, env);
      return {
        sourceId: picked.id,
        prompt,
        answer: ansClean,
        solution,
      };
    }

    // Fallback to fixed values if random constraints were tight
    const fixedEnv = getFixedVarValues(varDefs);
    return {
      sourceId: picked.id,
      prompt: renderParamTemplate(qTpl, fixedEnv),
      answer: renderParamTemplate(aTpl, fixedEnv).trim(),
      solution: renderParamTemplate(eTpl, fixedEnv),
    };
  };

  const primary = tryPickFrom(preferredPool);
  if (primary && primary.prompt !== prevPrompt) return primary;
  return tryPickFrom(pool);
}
