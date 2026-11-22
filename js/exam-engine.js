/**
 * Core Exam Engine for EduLab 2025 (Bộ GD&ĐT 2025 Format)
 * - Official 3-part progressive scoring
 * - Exam shuffling & option key remapping
 * - Strict JSON exam validator/parser
 * - Deadline & formatting utilities
 */

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

export function formatScoreVN(n) {
  const num = Number(n) || 0;
  return num.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1').replace('.', ',');
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function formatDateTimeVN(isoOrLocal) {
  if (!isoOrLocal) return 'Không giới hạn';
  const d = new Date(isoOrLocal);
  if (Number.isNaN(d.getTime())) return String(isoOrLocal);
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} • ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function getDeadlineStatus(dueAt) {
  if (!dueAt) return { expired: false, urgent: false, label: 'Không giới hạn hạn nộp' };
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return { expired: false, urgent: false, label: String(dueAt) };
  const diffMs = due.getTime() - Date.now();
  if (diffMs <= 0) {
    return { expired: true, urgent: false, label: 'Đã quá hạn nộp' };
  }
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays >= 1) {
    return { expired: false, urgent: diffDays <= 1, label: `Còn ${diffDays} ngày ${diffHours % 24} giờ` };
  }
  if (diffHours >= 1) {
    return { expired: false, urgent: true, label: `Còn ${diffHours} giờ ${diffMin % 60} phút` };
  }
  return { expired: false, urgent: true, label: `Còn ${Math.max(1, diffMin)} phút` };
}

export function defaultDueAtInput(daysFromNow = 7) {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59`;
}

/**
 * Validate and normalize an imported JSON exam (or array of exams)
 */
export function parseImportedExams(rawText) {
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (err) {
    throw new Error('File không đúng định dạng JSON hợp lệ: ' + err.message);
  }

  const list = Array.isArray(data) ? data : [data];
  const validated = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') {
      throw new Error('Cấu trúc đề thi không hợp lệ.');
    }
    const part1 = Array.isArray(item.part1) ? item.part1 : [];
    const part2 = Array.isArray(item.part2) ? item.part2 : [];
    const part3 = Array.isArray(item.part3) ? item.part3 : [];

    if (part1.length + part2.length + part3.length === 0) {
      throw new Error('Đề thi phải có ít nhất 1 câu hỏi trong part1, part2 hoặc part3.');
    }

    const cleanP1 = part1.map((q, idx) => {
      if (!q.stem || !Array.isArray(q.options) || q.options.length < 2) {
        throw new Error(`Phần I - Câu ${idx + 1} thiếu đề bài hoặc danh sách đáp án (options).`);
      }
      const keys = ['A', 'B', 'C', 'D'];
      const options = q.options.slice(0, 4).map((opt, oi) =>
        typeof opt === 'string'
          ? { key: keys[oi], text: opt }
          : { key: String(opt.key || keys[oi]).toUpperCase(), text: String(opt.text ?? '') }
      );
      const ans = String(q.answer || 'A').trim().toUpperCase();
      return {
        id: q.id || `imp-p1-${idx + 1}-${Math.random().toString(36).slice(2, 5)}`,
        topic: q.topic || 'Phần I',
        stem: String(q.stem),
        figureHtml: q.figureHtml || '',
        options,
        answer: ans,
        explanation: q.explanation || '',
      };
    });

    const cleanP2 = part2.map((q, idx) => {
      if (!q.stem || !Array.isArray(q.statements) || q.statements.length !== 4) {
        throw new Error(`Phần II - Câu ${idx + 1} phải có đủ 4 mệnh đề a, b, c, d (statements).`);
      }
      const labels = ['a', 'b', 'c', 'd'];
      const statements = q.statements.map((st, si) => ({
        key: String(st.key || labels[si]).toLowerCase(),
        text: String(st.text ?? ''),
        answer: Boolean(st.answer),
      }));
      return {
        id: q.id || `imp-p2-${idx + 1}-${Math.random().toString(36).slice(2, 5)}`,
        topic: q.topic || 'Phần II',
        stem: String(q.stem),
        figureHtml: q.figureHtml || '',
        statements,
        explanation: q.explanation || '',
      };
    });

    const cleanP3 = part3.map((q, idx) => {
      if (!q.stem || q.answer === undefined || q.answer === null || String(q.answer).trim() === '') {
        throw new Error(`Phần III - Câu ${idx + 1} thiếu đề bài hoặc đáp án số (answer).`);
      }
      return {
        id: q.id || `imp-p3-${idx + 1}-${Math.random().toString(36).slice(2, 5)}`,
        topic: q.topic || 'Phần III',
        stem: String(q.stem),
        figureHtml: q.figureHtml || '',
        answer: String(q.answer).trim(),
        explanation: q.explanation || '',
      };
    });

    const scoring = {
      part1PerQuestion: Number(item.scoring?.part1PerQuestion) || 0.25,
      part2Progressive:
        Array.isArray(item.scoring?.part2Progressive) && item.scoring.part2Progressive.length === 5
          ? item.scoring.part2Progressive.map(Number)
          : [0, 0.1, 0.25, 0.5, 1.0],
      part3PerQuestion: Number(item.scoring?.part3PerQuestion) || 0.5,
    };

    validated.push({
      id: (item.id ? String(item.id) : 'custom') + '-' + Date.now().toString(36).slice(-4),
      title: String(item.title || 'Đề thi tự nạp (Chuẩn BGD 2025)'),
      subject: String(item.subject || 'Toán học 12'),
      code: String(item.code || 'CUSTOM'),
      durationMinutes: Math.max(1, Number(item.durationMinutes) || 90),
      description: String(
        item.description ||
          `Ngân hàng tự nạp gồm ${cleanP1.length} câu Phần I, ${cleanP2.length} câu Phần II, ${cleanP3.length} câu Phần III.`
      ),
      isBuiltin: false,
      scoring,
      part1: cleanP1,
      part2: cleanP2,
      part3: cleanP3,
    });
  }

  return validated;
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function prepareExamInstance(exam, { shuffle = false } = {}) {
  const clone = structuredClone(exam);
  if (!shuffle) return clone;

  const keys = ['A', 'B', 'C', 'D'];
  clone.part1 = shuffleArray(clone.part1).map((q) => {
    const shuffledOpts = shuffleArray(q.options);
    let newAnswer = q.answer;
    const remapped = shuffledOpts.map((opt, idx) => {
      const nextKey = keys[idx] || opt.key;
      if (opt.key === q.answer) newAnswer = nextKey;
      return { ...opt, key: nextKey };
    });
    return { ...q, options: remapped, answer: newAnswer };
  });

  clone.part2 = shuffleArray(clone.part2);
  clone.part3 = shuffleArray(clone.part3);
  return clone;
}

export function normalizeShortAnswer(value) {
  if (value === null || value === undefined) return '';
  let s = String(value).trim().replace(/\s+/g, '');
  if (!s) return '';
  const numStr = s.replace(/,/g, '.');
  const parsed = Number(numStr);
  if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
    return String(parsed === 0 ? 0 : parsed);
  }
  return s.toLowerCase();
}

export function formatShortAnswerSlots(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/\./g, ',')
    .slice(0, 4);
  const slots = ['', '', '', ''];
  for (let i = 0; i < cleaned.length; i++) {
    slots[i] = cleaned[i];
  }
  return slots;
}

export function gradeExam(exam, answers) {
  const scoring = exam.scoring || {
    part1PerQuestion: 0.25,
    part2Progressive: [0, 0.1, 0.25, 0.5, 1.0],
    part3PerQuestion: 0.5,
  };

  let p1Score = 0;
  let p1Correct = 0;
  const p1Details = (exam.part1 || []).map((q) => {
    const userAns = answers?.part1?.[q.id] || null;
    const isCorrect = userAns === q.answer;
    const earned = isCorrect ? scoring.part1PerQuestion : 0;
    if (isCorrect) p1Correct++;
    p1Score += earned;
    return { id: q.id, userAns, correctAns: q.answer, isCorrect, earned, max: scoring.part1PerQuestion };
  });
  const p1Max = (exam.part1 || []).length * scoring.part1PerQuestion;

  let p2Score = 0;
  let p2FullCorrect = 0;
  let p2TotalStatementsRight = 0;
  const p2MaxPerQ = scoring.part2Progressive[4] ?? 1.0;

  const p2Details = (exam.part2 || []).map((q) => {
    const userMap = answers?.part2?.[q.id] || {};
    let rightCount = 0;
    const statementResults = q.statements.map((st) => {
      const uVal = userMap[st.key];
      const isRight = typeof uVal === 'boolean' && uVal === st.answer;
      if (isRight) rightCount++;
      return {
        key: st.key,
        userVal: typeof uVal === 'boolean' ? uVal : null,
        correctVal: st.answer,
        isRight,
      };
    });
    const earned = scoring.part2Progressive[rightCount] ?? 0;
    p2Score += earned;
    p2TotalStatementsRight += rightCount;
    if (rightCount === 4) p2FullCorrect++;
    return { id: q.id, rightCount, earned, max: p2MaxPerQ, statementResults };
  });
  const p2Max = (exam.part2 || []).length * p2MaxPerQ;

  let p3Score = 0;
  let p3Correct = 0;
  const p3Details = (exam.part3 || []).map((q) => {
    const rawUser = answers?.part3?.[q.id] || '';
    const isCorrect =
      rawUser.trim() !== '' && normalizeShortAnswer(rawUser) === normalizeShortAnswer(q.answer);
    const earned = isCorrect ? scoring.part3PerQuestion : 0;
    if (isCorrect) p3Correct++;
    p3Score += earned;
    return { id: q.id, userAns: rawUser, correctAns: q.answer, isCorrect, earned, max: scoring.part3PerQuestion };
  });
  const p3Max = (exam.part3 || []).length * scoring.part3PerQuestion;

  const round2 = (n) => Math.round(n * 100) / 100;
  const totalScore = round2(p1Score + p2Score + p3Score);
  const maxScore = round2(p1Max + p2Max + p3Max);

  return {
    totalScore,
    maxScore,
    percent: maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0,
    part1: { score: round2(p1Score), max: round2(p1Max), correct: p1Correct, total: (exam.part1 || []).length, details: p1Details },
    part2: {
      score: round2(p2Score),
      max: round2(p2Max),
      fullCorrect: p2FullCorrect,
      totalStatementsRight: p2TotalStatementsRight,
      totalStatements: (exam.part2 || []).length * 4,
      total: (exam.part2 || []).length,
      details: p2Details,
    },
    part3: { score: round2(p3Score), max: round2(p3Max), correct: p3Correct, total: (exam.part3 || []).length, details: p3Details },
  };
}
