import { api } from './api.js?v=20261123j';
import {
  escapeHtml,
  escapeAttr,
  parseVnDateOnlyToIso,
} from './exam-engine.js?v=20261123j';

const DAY_LABELS = {
  1: 'Thứ 2',
  2: 'Thứ 3',
  3: 'Thứ 4',
  4: 'Thứ 5',
  5: 'Thứ 6',
  6: 'Thứ 7',
};

const SESSION_LABELS = {
  sang: 'Sáng',
  chieu: 'Chiều',
};

const CLASS_COLORS = [
  { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' },
  { bg: '#ecfdf5', border: '#6ee7b7', text: '#047857' },
  { bg: '#fef3c7', border: '#fcd34d', text: '#b45309' },
  { bg: '#f5f3ff', border: '#c4b5fd', text: '#6d28d9' },
  { bg: '#fdf2f8', border: '#f9a8d4', text: '#be185d' },
  { bg: '#ecfeff', border: '#67e8f9', text: '#0e7490' },
];

function parseIsoDateLocal(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(2026, 8, 7);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toIsoDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function snapToMonday(iso) {
  const d = parseIsoDateLocal(iso);
  const wd = d.getDay();
  const diff = wd === 0 ? -6 : 1 - wd;
  return addDays(d, diff);
}

function formatVnMonthNum(m) {
  const n = Number(m);
  return n === 1 || n === 2 ? `0${n}` : String(n);
}

/** Vietnamese administrative date format: day 01-31, month 01/02 ONLY for Jan & Feb, 3..12 without leading zero */
function formatDateVNAdmin(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso || '');
  return `${m[3]}/${formatVnMonthNum(Number(m[2]))}/${m[1]}`;
}

function formatShortDateVNAdmin(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso || '');
  return `${m[3]}/${formatVnMonthNum(Number(m[2]))}`;
}

function monthKeyFromIso(iso) {
  return String(iso || '').slice(0, 7);
}

function formatMonthLabelVN(monthKey) {
  const m = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  return m ? `Tháng ${formatVnMonthNum(Number(m[2]))}/${m[1]}` : monthKey;
}

/** Normalize semester.timetables (supporting legacy semester.timetable) and compute effective week ranges */
function ensureTimetables(sem) {
  const firstWeek = Math.max(1, Number(sem.startWeek) || 1);
  const totalWeeks = Math.max(1, Math.min(30, Number(sem.totalWeeks) || 18));
  const lastWeek = firstWeek + totalWeeks - 1;
  const semSession = sem.session === 'chieu' ? 'chieu' : 'sang';

  if (!Array.isArray(sem.timetables) || sem.timetables.length === 0) {
    const legacySlots = Array.isArray(sem.timetable)
      ? sem.timetable.map((s) => ({
          dayOfWeek: Number(s.dayOfWeek),
          session: s.session || semSession,
          period: Number(s.period),
          classId: s.classId,
        }))
      : [];
    sem.timetables = [
      {
        id: 'tkb-1',
        name: 'TKB 1',
        fromWeek: firstWeek,
        slots: legacySlots,
      },
    ];
  }

  sem.timetables.forEach((t, idx) => {
    if (!t.id) t.id = `tkb-${idx + 1}`;
    if (!t.name) t.name = `TKB ${idx + 1}`;
    if (!Array.isArray(t.slots)) t.slots = [];
    t.fromWeek = Number(t.fromWeek) || firstWeek;
  });

  sem.timetables.sort((a, b) => a.fromWeek - b.fromWeek);
  sem.timetables[0].fromWeek = firstWeek;

  // Clamp subsequent TKB start weeks cleanly within (firstWeek+1 .. lastWeek) without duplicates
  for (let i = 1; i < sem.timetables.length; i++) {
    const minW = Math.min(lastWeek, sem.timetables[i - 1].fromWeek + 1);
    sem.timetables[i].fromWeek = Math.max(minW, Math.min(lastWeek, sem.timetables[i].fromWeek));
  }

  return sem.timetables.map((t, idx) => {
    const startW = idx === 0 ? firstWeek : t.fromWeek;
    const endW = idx < sem.timetables.length - 1 ? Math.max(startW, sem.timetables[idx + 1].fromWeek - 1) : lastWeek;
    const isLast = idx === sem.timetables.length - 1;
    const rangeShort = startW === endW ? `Tuần ${startW}` : `Tuần ${startW} – ${endW}`;
    const rangeLong = isLast
      ? `Từ Tuần ${startW} đến hết kì (Tuần ${endW})`
      : startW === endW
        ? `Tuần ${startW}`
        : `Từ Tuần ${startW} đến hết Tuần ${endW}`;
    return {
      ...t,
      index: idx,
      startWeek: startW,
      endWeek: endW,
      isLast,
      rangeShort,
      rangeLong,
    };
  });
}

function isMidtermLesson(item) {
  if (!item || item.isSpecialTopic) return false;
  if (item.isMidterm) return true;
  return /kiểm\s*tra\s*giữa\s*k[ìy]|kt\s*gk|kt\s*giữa\s*k[ìy]/i.test(String(item.lessonName || ''));
}

function stripPeriodSuffix(name) {
  return String(name || '')
    .replace(/\s*\(\s*(?:tiết\s*\d+[^)]*|tt)\s*\)\s*$/i, '')
    .trim();
}

function getClassColor(classId, classes) {
  const idx = Math.max(0, classes.findIndex((c) => c.id === classId));
  return CLASS_COLORS[idx % CLASS_COLORS.length];
}

/** Expand holiday entries (supporting both { date, note } and { id, name, startDate, endDate }) into Map<isoDate, label> */
function buildHolidayDateMap(holidays) {
  const map = new Map();
  for (const h of holidays || []) {
    if (h.startDate) {
      const s = parseIsoDateLocal(h.startDate);
      const e = parseIsoDateLocal(h.endDate || h.startDate);
      const label = h.name || h.note || 'Nghỉ lễ';
      let cur = s;
      let guard = 0;
      while (cur <= e && guard < 60) {
        map.set(toIsoDateLocal(cur), label);
        cur = addDays(cur, 1);
        guard++;
      }
    } else if (h.date) {
      map.set(h.date, h.name || h.note || 'Nghỉ lễ');
    }
  }
  return map;
}

// =========================================================
// CORE SCHEDULING ENGINE (SINGLE-SESSION + MULTI-TKB + AUTO CĐ)
// =========================================================
export function generateSemesterSchedule(semester, curriculumPlans) {
  const startMonday = snapToMonday(semester.startDate || '2026-09-07');
  const startWeek = Math.max(1, Number(semester.startWeek) || 1);
  const totalWeeks = Math.max(1, Math.min(30, Number(semester.totalWeeks) || 18));
  const termNumber = Number(semester.termNumber) === 2 ? 2 : 1;
  const semSession = semester.session === 'chieu' ? 'chieu' : 'sang';
  const classes = Array.isArray(semester.classes) ? semester.classes : [];
  const classById = new Map(classes.map((c) => [c.id, c]));
  const holidays = Array.isArray(semester.holidays) ? semester.holidays : [];
  const swaps = Array.isArray(semester.swaps) ? semester.swaps : [];
  const saturdayMidterms = Array.isArray(semester.saturdayMidterms) ? semester.saturdayMidterms : [];

  const tkbRanges = ensureTimetables(semester);
  // Pre-index each TKB version's slots and per-class weekly slot counts
  const indexedTkbs = tkbRanges.map((tr) => {
    const slotMap = new Map();
    const classWeeklyCount = new Map();
    for (const slot of tr.slots || []) {
      if (!classById.has(slot.classId)) continue;
      if (slot.session && slot.session !== semSession) continue;
      const dow = Number(slot.dayOfWeek);
      const period = Number(slot.period);
      const key = `${dow}|${period}`;
      if (!slotMap.has(key)) {
        slotMap.set(key, { classId: slot.classId, dayOfWeek: dow, period });
        classWeeklyCount.set(slot.classId, (classWeeklyCount.get(slot.classId) || 0) + 1);
      }
    }
    return { ...tr, slotMap, classWeeklyCount };
  });

  function getTkbForWeek(weekNum) {
    let picked = indexedTkbs[0];
    for (const t of indexedTkbs) {
      if (weekNum >= t.startWeek && weekNum <= t.endWeek) {
        picked = t;
        break;
      }
      if (weekNum >= t.startWeek) picked = t;
    }
    return picked;
  }

  const holidayMap = buildHolidayDateMap(holidays);

  // Build calendar map Mon (1) .. Sat (6)
  const allDays = [];
  const dayByIso = new Map();
  for (let w = 0; w < totalWeeks; w++) {
    const weekNumber = startWeek + w;
    for (let dow = 1; dow <= 6; dow++) {
      const d = addDays(startMonday, w * 7 + (dow - 1));
      const iso = toIsoDateLocal(d);
      const dayObj = {
        iso,
        dateVN: formatDateVNAdmin(iso),
        shortDateVN: formatShortDateVNAdmin(iso),
        monthKey: monthKeyFromIso(iso),
        weekNumber,
        weekIndex: w,
        dayOfWeek: dow,
        effectiveDow: dow,
        swapInfo: null,
        isHoliday: holidayMap.has(iso),
        holidayNote: holidayMap.get(iso) || '',
        slots: { 1: null, 2: null, 3: null, 4: null, 5: null },
      };
      allDays.push(dayObj);
      dayByIso.set(iso, dayObj);
    }
  }

  // Apply working-day swaps (dateA <-> dateB swap their effective timetable dayOfWeek)
  for (const sw of swaps) {
    const dA = dayByIso.get(sw.dateA);
    const dB = dayByIso.get(sw.dateB);
    if (!dA || !dB || dA.iso === dB.iso) continue;
    const prevA = dA.effectiveDow;
    const prevB = dB.effectiveDow;
    dA.effectiveDow = prevB;
    dB.effectiveDow = prevA;
    dA.swapInfo = {
      id: sw.id,
      otherIso: dB.iso,
      otherDateVN: dB.dateVN,
      otherShortDateVN: dB.shortDateVN,
      otherDowLabel: DAY_LABELS[dB.dayOfWeek],
      note: sw.note || '',
    };
    dB.swapInfo = {
      id: sw.id,
      otherIso: dA.iso,
      otherDateVN: dA.dateVN,
      otherShortDateVN: dA.shortDateVN,
      otherDowLabel: DAY_LABELS[dA.dayOfWeek],
      note: sw.note || '',
    };
  }

  // Index Saturday midterms by (date, period)
  const satMidtermSlotMap = new Map();
  const gradesWithSatMidterm = new Set();
  for (const mt of saturdayMidterms) {
    if (!mt.date || !Array.isArray(mt.periods) || mt.periods.length === 0) continue;
    gradesWithSatMidterm.add(String(mt.grade));
    const sortedPeriods = [...mt.periods].map(Number).sort((a, b) => a - b);
    sortedPeriods.forEach((p, idx) => {
      satMidtermSlotMap.set(`${mt.date}|${p}`, {
        midterm: mt,
        partIndex: idx,
      });
    });
  }

  // Prepare per-grade Regular PPCT and Chuyên đề PPCT queues
  const gradeMidtermLessons = new Map();
  const gradeRegularPlans = new Map();
  const gradeSpecialPlans = new Map();

  for (const g of ['10', '11', '12']) {
    const rawList = Array.isArray(curriculumPlans?.[g]) ? curriculumPlans[g] : [];
    const termList = rawList.filter((it) => Number(it.term || 1) === termNumber);

    const regularList = termList
      .filter((it) => !it.isSpecialTopic)
      .sort((a, b) => (Number(a.ppct) || 0) - (Number(b.ppct) || 0));
    const specialList = termList
      .filter((it) => Boolean(it.isSpecialTopic))
      .sort((a, b) => (Number(a.ppct) || 0) - (Number(b.ppct) || 0));

    const midItems = regularList.filter(isMidtermLesson);
    gradeMidtermLessons.set(g, midItems);
    gradeSpecialPlans.set(g, specialList);

    if (gradesWithSatMidterm.has(g) && midItems.length > 0) {
      const pulledSet = new Set(midItems.slice(0, 2));
      gradeRegularPlans.set(
        g,
        regularList.filter((it) => !pulledSet.has(it))
      );
    } else {
      gradeRegularPlans.set(g, regularList);
    }
  }

  // After swaps are applied, mark each class's LAST chronological slot of each week as Chuyên đề (when >= 4 periods/week)
  const weeklySpecialSlotKeys = new Set();
  for (let w = 0; w < totalWeeks; w++) {
    const wDays = allDays.slice(w * 6, w * 6 + 6);
    const activeTkb = getTkbForWeek(startWeek + w);
    const lastSlotByClass = new Map();

    for (const day of wDays) {
      for (let period = 1; period <= 5; period++) {
        if (satMidtermSlotMap.has(`${day.iso}|${period}`)) continue;
        const slotCfg = activeTkb?.slotMap?.get(`${day.effectiveDow}|${period}`);
        if (!slotCfg) continue;
        const weeklySlots = activeTkb.classWeeklyCount.get(slotCfg.classId) || 0;
        if (weeklySlots >= 4) {
          lastSlotByClass.set(slotCfg.classId, `${day.iso}|${period}`);
        }
      }
    }

    for (const key of lastSlotByClass.values()) {
      weeklySpecialSlotKeys.add(key);
    }
  }

  const regCursors = new Map(classes.map((c) => [c.id, 0]));
  const spCursors = new Map(classes.map((c) => [c.id, 0]));
  const flatEntries = [];

  for (const day of allDays) {
    const activeTkb = getTkbForWeek(day.weekNumber);

    for (let period = 1; period <= 5; period++) {
      const mtHit = satMidtermSlotMap.get(`${day.iso}|${period}`);
      if (mtHit) {
        const mt = mtHit.midterm;
        const gradeStr = String(mt.grade);
        const midPool = gradeMidtermLessons.get(gradeStr) || [];
        const matchedPpct = midPool[mtHit.partIndex] || null;
        const gradeClasses = classes.filter((c) => String(c.grade) === gradeStr);
        const classLabel =
          gradeClasses.length > 0
            ? `Khối ${gradeStr} (${gradeClasses.map((c) => c.name).join(', ')})`
            : `Khối ${gradeStr}`;
        const termRoman = Number(mt.term || termNumber) === 2 ? 'II' : 'I';
        const defaultTitle = `Kiểm tra giữa kì ${termRoman} — Khối ${gradeStr} (Tiết ${mtHit.partIndex + 1})`;
        const entry = {
          type: 'midterm',
          midtermId: mt.id,
          date: day.iso,
          dateVN: day.dateVN,
          monthKey: day.monthKey,
          weekNumber: day.weekNumber,
          dayOfWeek: day.dayOfWeek,
          session: mt.session || semSession,
          period,
          grade: gradeStr,
          classId: null,
          className: classLabel,
          ppct: matchedPpct?.ppct ?? null,
          isSpecialTopic: false,
          lessonName: matchedPpct?.lessonName || mt.title || defaultTitle,
          note: matchedPpct?.note || `Kiểm tra chung Khối ${gradeStr} (Tiết ${mtHit.partIndex + 1})`,
          chapter: matchedPpct?.chapter || '',
          equipment: matchedPpct?.equipment || '',
          isMidterm: true,
        };
        day.slots[period] = entry;
        flatEntries.push(entry);
        continue;
      }

      if (day.isHoliday) continue;

      const slotCfg = activeTkb?.slotMap?.get(`${day.effectiveDow}|${period}`);
      if (!slotCfg) continue;
      const cls = classById.get(slotCfg.classId);
      if (!cls) continue;

      const gradeStr = String(cls.grade);
      const regPlan = gradeRegularPlans.get(gradeStr) || [];
      const spPlan = gradeSpecialPlans.get(gradeStr) || [];
      const regIdx = regCursors.get(cls.id) || 0;
      const spIdx = spCursors.get(cls.id) || 0;
      const weeklySlots = activeTkb.classWeeklyCount.get(cls.id) || 0;

      // Default rule: the LAST chronological slot of the week (after swaps) is always Chuyên đề (CĐ)
      const wantsSpecial = weeklySpecialSlotKeys.has(`${day.iso}|${period}`);
      let pickSpecial = false;
      if (wantsSpecial && spIdx < spPlan.length) {
        pickSpecial = true;
      } else if (regIdx >= regPlan.length && weeklySlots >= 4 && spIdx < spPlan.length) {
        pickSpecial = true;
      } else if (regIdx >= regPlan.length) {
        continue;
      }

      if (pickSpecial) {
        const lesson = spPlan[spIdx];
        spCursors.set(cls.id, spIdx + 1);
        const entry = {
          type: 'lesson',
          date: day.iso,
          dateVN: day.dateVN,
          monthKey: day.monthKey,
          weekNumber: day.weekNumber,
          dayOfWeek: day.dayOfWeek,
          session: semSession,
          period,
          grade: gradeStr,
          classId: cls.id,
          className: cls.name,
          ppct: lesson.ppct,
          isSpecialTopic: true,
          lessonName: lesson.lessonName,
          note: lesson.note || '',
          chapter: lesson.chapter || '',
          equipment: '', // Chuyên đề không dùng đồ dùng dạy học
          isMidterm: false,
        };
        day.slots[period] = entry;
        flatEntries.push(entry);
      } else {
        const lesson = regPlan[regIdx];
        regCursors.set(cls.id, regIdx + 1);
        const entry = {
          type: 'lesson',
          date: day.iso,
          dateVN: day.dateVN,
          monthKey: day.monthKey,
          weekNumber: day.weekNumber,
          dayOfWeek: day.dayOfWeek,
          session: semSession,
          period,
          grade: gradeStr,
          classId: cls.id,
          className: cls.name,
          ppct: lesson.ppct,
          isSpecialTopic: false,
          lessonName: lesson.lessonName,
          note: lesson.note || '',
          chapter: lesson.chapter || '',
          equipment: lesson.equipment || '',
          isMidterm: isMidtermLesson(lesson),
        };
        day.slots[period] = entry;
        flatEntries.push(entry);
      }
    }
  }

  // Group into weeks and determine whether Saturday needs to be visible for each week
  const weeks = [];
  for (let w = 0; w < totalWeeks; w++) {
    const wDays = allDays.slice(w * 6, w * 6 + 6);
    const sat = wDays[5];
    const satHasEvents =
      Boolean(sat) &&
      (Boolean(sat.swapInfo) ||
        Object.values(sat.slots).some((s) => s !== null));
    const weekNum = startWeek + w;
    const wkTkb = getTkbForWeek(weekNum);
    weeks.push({
      weekNumber: weekNum,
      weekIndex: w,
      tkbName: wkTkb?.name || 'TKB 1',
      startDateVN: wDays[0]?.dateVN || '',
      endDateVN: (satHasEvents ? wDays[5] : wDays[4])?.dateVN || '',
      startShortVN: wDays[0]?.shortDateVN || '',
      endShortVN: (satHasEvents ? wDays[5] : wDays[4])?.shortDateVN || '',
      satHasEvents,
      days: wDays,
      visibleDays: satHasEvents ? wDays : wDays.slice(0, 5),
    });
  }

  return {
    session: semSession,
    tkbRanges,
    weeks,
    allDays,
    flatEntries,
  };
}

/**
 * Generate Sổ đồ dùng dạy học grouped by month (only periods with non-empty equipment;
 * Chuyên đề periods never appear because equipment is empty).
 */
export function generateMonthlyEquipment(schedule) {
  const byMonth = new Map();

  for (const e of schedule.flatEntries) {
    if (e.isSpecialTopic) continue;
    const equip = String(e.equipment || '').trim();
    if (!equip) continue;

    if (!byMonth.has(e.monthKey)) {
      byMonth.set(e.monthKey, []);
    }
    const rows = byMonth.get(e.monthKey);
    const prev = rows[rows.length - 1];

    const canMerge =
      prev &&
      prev.date === e.date &&
      prev.session === e.session &&
      prev.className === e.className &&
      prev.equipment.toLowerCase() === equip.toLowerCase();

    if (canMerge) {
      prev.periods.push(e.period);
      if (!prev.lessonNames.includes(e.lessonName)) {
        prev.lessonNames.push(e.lessonName);
      }
    } else {
      rows.push({
        date: e.date,
        dateVN: e.dateVN,
        session: e.session,
        sessionLabel: SESSION_LABELS[e.session] || 'Sáng',
        periods: [e.period],
        lessonNames: [e.lessonName],
        equipment: equip,
        className: e.className,
        isMidterm: e.isMidterm,
      });
    }
  }

  return Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monthKey, rows]) => ({
      monthKey,
      monthLabel: formatMonthLabelVN(monthKey),
      rows: rows.map((r) => {
        const periodStr = `Tiết ${r.periods.join(',')}`;
        const colTime = `${periodStr} | ${r.sessionLabel} | ${r.dateVN}`;
        const colTimeHtml = `${escapeHtml(periodStr)} <span class="tl-pipe">|</span> ${escapeHtml(r.sessionLabel)} <span class="tl-pipe">|</span> ${escapeHtml(r.dateVN)}`;
        let displayLesson = r.lessonNames[0];
        if (r.lessonNames.length > 1) {
          const bases = [...new Set(r.lessonNames.map(stripPeriodSuffix))];
          if (bases.length === 1) {
            displayLesson = `${bases[0]} (${r.lessonNames.length} tiết)`;
          } else {
            displayLesson = r.lessonNames.join('; ');
          }
        }
        return {
          ...r,
          colTime,
          colTimeHtml,
          displayLesson,
        };
      }),
    }));
}

// =========================================================
// CONTROLLER
// =========================================================
export function createTeachingLogController({ rootEl, uiHelpers, onRouteChange }) {
  const { showToast, openModal, closeModal } = uiHelpers;

  const state = {
    data: null,
    subTab: 'log', // 'log' | 'actual' | 'equipment' | 'tkb' | 'plan'
    selectedWeekIdx: 0,
    weekPillsScrollLeft: null,
    centerActiveWeekOnce: true,
    actualScope: 'grade:10',
    selectedActualKey: '',
    equipMonthFilter: 'all',
    equipClassFilter: 'all',
    planGrade: '10',
    planTerm: 1,
    planMode: 'regular', // 'regular' (Chính khóa) | 'special' (Chuyên đề)
    tkbBrushClassId: '',
    activeTkbId: '',
  };

  function findCurrentWeekIndex(sem) {
    if (!sem) return 0;
    const startMonday = snapToMonday(sem.startDate || '2026-09-07');
    const totalWeeks = Math.max(1, Math.min(30, Number(sem.totalWeeks) || 18));
    const todayIso = toIsoDateLocal(new Date());
    for (let w = 0; w < totalWeeks; w++) {
      const wStart = toIsoDateLocal(addDays(startMonday, w * 7));
      const wEnd = toIsoDateLocal(addDays(startMonday, w * 7 + 6));
      if (todayIso >= wStart && todayIso <= wEnd) return w;
    }
    const lastEnd = toIsoDateLocal(addDays(startMonday, (totalWeeks - 1) * 7 + 6));
    if (todayIso > lastEnd) return totalWeeks - 1;
    return 0;
  }

  function getActiveSemester() {
    if (!state.data?.semesters?.length) return null;
    const found = state.data.semesters.find((s) => s.id === state.data.activeSemesterId);
    return found || state.data.semesters[0];
  }

  async function persist(toastMsg = '') {
    try {
      const res = await api.saveTeachingLog(state.data);
      if (res?.teachingLog) state.data = res.teachingLog;
      if (toastMsg) showToast(toastMsg, 'success');
      render();
    } catch (err) {
      showToast(err.message || 'Không thể lưu dữ liệu Sổ báo giảng.', 'error');
    }
  }

  async function init(routeOpts = null) {
    if (routeOpts?.subTab && ['log', 'actual', 'equipment', 'tkb', 'plan'].includes(routeOpts.subTab)) {
      state.subTab = routeOpts.subTab;
    }
    try {
      const res = await api.getTeachingLog();
      state.data = res.teachingLog;
      const sem = getActiveSemester();
      if (sem) {
        if (!state.tkbBrushClassId && sem.classes?.length) {
          state.tkbBrushClassId = sem.classes[0].id;
        }
        state.selectedWeekIdx = findCurrentWeekIndex(sem);
        state.centerActiveWeekOnce = true;
      }
      render();
    } catch (err) {
      rootEl.innerHTML = `<div class="card panel-card" style="text-align:center; padding:40px; color:var(--danger);">${escapeHtml(err.message || 'Không thể tải Sổ báo giảng.')}</div>`;
    }
  }

  function render() {
    if (!state.data) return;
    const sem = getActiveSemester();
    if (!sem) return;

    const prevPills = rootEl.querySelector('.tl-week-pills');
    if (prevPills) {
      state.weekPillsScrollLeft = prevPills.scrollLeft;
    }

    const schedule = generateSemesterSchedule(sem, state.data.curriculumPlans || {});
    const monthlyEquip = generateMonthlyEquipment(schedule);
    if (state.selectedWeekIdx >= schedule.weeks.length) {
      state.selectedWeekIdx = Math.max(0, schedule.weeks.length - 1);
    }

    const semSession = sem.session === 'chieu' ? 'chieu' : 'sang';
    const semSessionLabel = SESSION_LABELS[semSession];
    const totalEquipRows = monthlyEquip.reduce((acc, m) => acc + m.rows.length, 0);
    const tkbRanges = schedule.tkbRanges || ensureTimetables(sem);
    if (!state.activeTkbId || !tkbRanges.some((t) => t.id === state.activeTkbId)) {
      state.activeTkbId = tkbRanges[0]?.id || '';
    }
    const primaryTkbSlots = (tkbRanges[0]?.slots || []).filter(
      (s) => !s.session || s.session === semSession
    ).length;
    const tkbBadgeText = tkbRanges.length > 1 ? `${tkbRanges.length} TKB` : `${primaryTkbSlots} tiết/tuần`;

    rootEl.innerHTML = `
      <div class="tl-shell">
        <!-- Semester Bar -->
        <div class="tl-topbar card">
          <div class="tl-topbar-left">
            <label for="selSemester" class="tl-mini-lbl">Học kì làm việc</label>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <select id="selSemester" class="input-control input-compact" style="min-width:260px; font-weight:700;">
                ${state.data.semesters
                  .map(
                    (s) =>
                      `<option value="${escapeAttr(s.id)}" ${s.id === sem.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
                  )
                  .join('')}
              </select>
              <span class="badge badge-p1">Buổi ${semSessionLabel}</span>
              <button type="button" class="btn btn-primary btn-sm" id="btnNewSemester">+ Tạo học kì mới</button>
              ${
                state.data.semesters.length > 1
                  ? `<button type="button" class="btn btn-danger-outline btn-sm" id="btnDeleteSemester">Xóa kì</button>`
                  : ''
              }
            </div>
          </div>

          <div class="tl-topbar-stats">
            <div class="tl-stat-pill"><strong>${sem.classes?.length || 0}</strong> lớp</div>
            <div class="tl-stat-pill"><strong>${schedule.flatEntries.length}</strong> tiết đã xếp</div>
            <div class="tl-stat-pill"><strong>${sem.holidays?.length || 0}</strong> đợt nghỉ</div>
            <div class="tl-stat-pill"><strong>${sem.saturdayMidterms?.length || 0}</strong> buổi KT GK</div>
          </div>
        </div>

        <!-- 5 Sub-tabs -->
        <div class="subtab-bar">
          <button class="subtab-btn ${state.subTab === 'log' ? 'active' : ''}" data-tl-tab="log">
            Sổ báo giảng <span class="badge badge-neutral">${schedule.weeks.length} tuần</span>
          </button>
          <button class="subtab-btn ${state.subTab === 'actual' ? 'active' : ''}" data-tl-tab="actual">
            Thực tế
          </button>
          <button class="subtab-btn ${state.subTab === 'equipment' ? 'active' : ''}" data-tl-tab="equipment">
            Sổ đồ dùng <span class="badge badge-neutral">${totalEquipRows}</span>
          </button>
          <button class="subtab-btn ${state.subTab === 'tkb' ? 'active' : ''}" data-tl-tab="tkb">
            Thời khóa biểu <span class="badge badge-neutral">${tkbBadgeText}</span>
          </button>
          <button class="subtab-btn ${state.subTab === 'plan' ? 'active' : ''}" data-tl-tab="plan">
            Kế hoạch dạy học
          </button>
        </div>

        <div id="tlBody">
          ${state.subTab === 'log' ? renderLogView(sem, schedule) : ''}
          ${state.subTab === 'actual' ? renderActualView(sem, schedule) : ''}
          ${state.subTab === 'equipment' ? renderEquipmentView(sem, monthlyEquip) : ''}
          ${state.subTab === 'tkb' ? renderTkbView(sem, tkbRanges) : ''}
          ${state.subTab === 'plan' ? renderPlanView() : ''}
        </div>
      </div>
    `;

    bindEvents(sem, schedule, monthlyEquip);
  }

  // =========================================================
  // SUB-TAB 1: SỔ BÁO GIẢNG (1 BUỔI DUY NHẤT, ẨN T7 MẶC ĐỊNH)
  // =========================================================
  function renderLogWeekGridHtml(sem, schedule, week) {
    if (!week) {
      return `<div class="card panel-card" style="text-align:center; padding:36px;">Chưa có dữ liệu tuần học.</div>`;
    }

    const classes = sem.classes || [];
    const visibleDays = week.visibleDays;
    const sessionLabel = SESSION_LABELS[schedule.session] || 'Sáng';
    const todayIso = toIsoDateLocal(new Date());
    const privateNotes = sem.privateNotes && typeof sem.privateNotes === 'object' ? sem.privateNotes : {};

    const rowsHtml = [];
    for (let period = 1; period <= 5; period++) {
      const tds = visibleDays.map((day) => {
        const entry = day.slots[period];
        const todayCls = day.iso === todayIso ? ' is-today-col' : '';
        const privNote = String(privateNotes[`${day.iso}|${period}`] || '').trim();
        const privNoteBadgeHtml = privNote
          ? `
            <div class="tl-slot-priv-note tl-no-print" title="${escapeAttr(privNote)}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              <span>${escapeHtml(privNote)}</span>
            </div>
          `
          : '';

        if (entry && entry.type === 'midterm') {
          return `
            <td class="tl-cell is-midterm-cell${todayCls}">
              <div class="tl-slot-card is-midterm is-clickable" role="button" tabindex="0" data-slot-iso="${escapeAttr(day.iso)}" data-slot-period="${period}">
                <div class="tl-slot-head">
                  <span class="badge badge-p2">KT GK • Khối ${escapeHtml(entry.grade)}</span>
                  <button type="button" class="tl-slot-x" data-del-sat-mt="${escapeAttr(entry.midtermId)}" title="Xóa lịch kiểm tra giữa kì">×</button>
                </div>
                <div class="tl-slot-title">${escapeHtml(entry.lessonName)}</div>
                <div class="tl-slot-meta">
                  ${entry.ppct != null ? `PPCT ${entry.ppct} • ` : ''}${escapeHtml(entry.className)}
                </div>
                ${privNoteBadgeHtml}
              </div>
            </td>
          `;
        }

        if (day.isHoliday) {
          if (period === 1) {
            return `
              <td class="tl-cell is-holiday-cell${todayCls}" rowspan="5">
                <div class="tl-holiday-banner">
                  <span class="badge badge-warning">NGHỈ LỄ</span>
                  <div class="tl-holiday-note">${escapeHtml(day.holidayNote || 'Nghỉ lễ')}</div>
                </div>
              </td>
            `;
          }
          return '';
        }

        if (entry) {
          const col = getClassColor(entry.classId, classes);
          return `
            <td class="tl-cell${todayCls}">
              <div class="tl-slot-card is-clickable ${entry.isSpecialTopic ? 'is-special-card' : ''}" role="button" tabindex="0" data-slot-iso="${escapeAttr(day.iso)}" data-slot-period="${period}" style="background:${col.bg}; border-color:${col.border};">
                <div class="tl-slot-head">
                  <span class="tl-class-tag" style="color:${col.text};">${escapeHtml(entry.className)}</span>
                  <span class="tl-ppct-tag ${entry.isSpecialTopic ? 'is-cd' : ''}">
                    ${entry.isSpecialTopic ? `CĐ${entry.ppct}` : `Tiết ${entry.ppct}`}
                  </span>
                </div>
                <div class="tl-slot-title">${escapeHtml(entry.lessonName)}</div>
                ${privNoteBadgeHtml}
              </div>
            </td>
          `;
        }

        return `<td class="tl-cell is-empty${todayCls}"></td>`;
      });

      rowsHtml.push(`
        <tr>
          <th class="tl-period-col">Tiết ${period}</th>
          ${tds.join('')}
        </tr>
      `);
    }

    return `
      <div class="card tl-grid-card">
        <div class="tl-grid-scroll">
          <table class="tl-table" id="tlWeekTable">
            <thead>
              <tr>
                <th class="tl-period-col">Buổi ${sessionLabel}</th>
                ${visibleDays
                  .map((d) => {
                    const isToday = d.iso === todayIso;
                    return `
                  <th class="tl-day-head ${d.isHoliday ? 'is-holiday' : ''} ${d.dayOfWeek === 6 ? 'is-saturday' : ''} ${isToday ? 'is-today' : ''}">
                    <div class="tl-day-title-row">
                      <span style="display:inline-flex; align-items:center; gap:6px;">
                        <strong>${DAY_LABELS[d.dayOfWeek]}</strong>
                        ${isToday ? `<span class="tl-today-badge">Hôm nay</span>` : ''}
                      </span>
                      <span class="tl-day-date" style="margin-top:0;">${d.dateVN}</span>
                    </div>
                    ${
                      d.swapInfo
                        ? `<div class="tl-swap-pill">⇄ Đổi với ${d.swapInfo.otherShortDateVN} (${DAY_LABELS[d.effectiveDow]})</div>`
                        : ''
                    }
                  </th>
                `;
                  })
                  .join('')}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml.join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderLogView(sem, schedule) {
    const week = schedule.weeks[state.selectedWeekIdx] || schedule.weeks[0];
    if (!week) {
      return `<div class="card panel-card" style="text-align:center; padding:36px;">Chưa có dữ liệu tuần học.</div>`;
    }

    const todayIso = toIsoDateLocal(new Date());
    const swapsList = sem.swaps || [];
    const holidaysList = sem.holidays || [];
    const midtermsList = sem.saturdayMidterms || [];
    const totalModsCount = holidaysList.length + swapsList.length + midtermsList.length;

    return `
      <!-- Full-width Week Bar + Single Gear Icon Button -->
      <div class="tl-week-bar">
        <div class="tl-mobile-week-picker">
          <button
            type="button"
            class="tl-week-nav-btn"
            id="btnPrevWeekMobile"
            ${state.selectedWeekIdx <= 0 ? 'disabled' : ''}
            aria-label="Tuần trước"
          >‹</button>
          <select id="selMobileWeek" class="input-control input-compact tl-mobile-week-select" aria-label="Chọn tuần">
            ${schedule.weeks
              .map((w, idx) => {
                const monIso = w.days?.[0]?.iso || '';
                const sunIso = monIso ? toIsoDateLocal(addDays(parseIsoDateLocal(monIso), 6)) : '';
                const isCurWeek = Boolean(monIso && todayIso >= monIso && todayIso <= sunIso);
                return `<option value="${idx}" ${idx === state.selectedWeekIdx ? 'selected' : ''}>Tuần ${w.weekNumber} (${w.startShortVN} – ${w.endShortVN})${isCurWeek ? ' • Hiện tại' : ''}</option>`;
              })
              .join('')}
          </select>
          <button
            type="button"
            class="tl-week-nav-btn"
            id="btnNextWeekMobile"
            ${state.selectedWeekIdx >= schedule.weeks.length - 1 ? 'disabled' : ''}
            aria-label="Tuần sau"
          >›</button>
        </div>

        <div class="tl-week-pills">
          ${schedule.weeks
            .map((w, idx) => {
              const monIso = w.days?.[0]?.iso || '';
              const sunIso = monIso ? toIsoDateLocal(addDays(parseIsoDateLocal(monIso), 6)) : '';
              const isCurWeek = Boolean(monIso && todayIso >= monIso && todayIso <= sunIso);
              return `
            <button
              type="button"
              class="tl-week-btn ${idx === state.selectedWeekIdx ? 'active' : ''} ${isCurWeek ? 'is-current-week' : ''}"
              data-pick-week="${idx}"
            >
              <strong>Tuần ${w.weekNumber}</strong>
              <span>${w.startShortVN} – ${w.endShortVN}</span>
            </button>
          `;
            })
            .join('')}
        </div>

        <button
          type="button"
          class="tl-gear-btn ${totalModsCount > 0 ? 'has-mods' : ''}"
          id="btnOpenScheduleGearModal"
          aria-label="Cài đặt lịch dạy, nghỉ lễ, hoán đổi và kiểm tra giữa kì"
          title="Điều chỉnh lịch dạy (Nghỉ lễ, Hoán đổi, Kiểm tra giữa kì)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          ${totalModsCount > 0 ? `<span class="tl-gear-badge">${totalModsCount}</span>` : ''}
        </button>
      </div>

      <!-- Main Weekly Grid Host (swapped in-place on week change for zero jitter!) -->
      <div id="tlWeekGridHost">
        ${renderLogWeekGridHtml(sem, schedule, week)}
      </div>
    `;
  }

  // =========================================================
  // SUB-TAB 2: THỰC TẾ (ĐỒNG BỘ TRỰC TIẾP VỚI SỔ BÁO GIẢNG, MẶC ĐỊNH 3 CHÍNH + 1 CĐ)
  // =========================================================
  function getActualGradeFromScope(sem, scope) {
    if (scope.startsWith('grade:')) return scope.slice(6);
    if (scope.startsWith('class:')) {
      const cid = scope.slice(6);
      const cls = (sem.classes || []).find((c) => c.id === cid);
      return cls ? String(cls.grade) : '10';
    }
    return '10';
  }

  function ensureActualPlanObj(sem, scope) {
    sem.actualPlans = sem.actualPlans || {};
    if (!sem.actualPlans[scope]) {
      sem.actualPlans[scope] = {
        regularPerWeek: 3,
        extraPerWeek: 1,
        cells: {},
      };
    }
    const obj = sem.actualPlans[scope];
    obj.regularPerWeek = 3;
    obj.extraPerWeek = 1;
    obj.cells = obj.cells || {};
    return obj;
  }

  function buildActualWeekRows(sem, schedule, scope) {
    const classes = sem.classes || [];
    const grade = getActualGradeFromScope(sem, scope);
    const termNum = Number(sem.termNumber) === 2 ? 2 : 1;

    let targetClass = null;
    if (scope.startsWith('class:')) {
      const cid = scope.slice(6);
      targetClass = classes.find((c) => c.id === cid) || null;
    } else {
      targetClass = classes.find((c) => String(c.grade) === grade) || null;
    }

    // Fallback to static curriculum plan only when this semester has no class in that grade
    const fallbackReg = (state.data.curriculumPlans?.[grade] || [])
      .filter((it) => Number(it.term || 1) === termNum && !it.isSpecialTopic)
      .sort((a, b) => (Number(a.ppct) || 0) - (Number(b.ppct) || 0));
    const fallbackSp = (state.data.curriculumPlans?.[grade] || [])
      .filter((it) => Number(it.term || 1) === termNum && Boolean(it.isSpecialTopic))
      .sort((a, b) => (Number(a.ppct) || 0) - (Number(b.ppct) || 0));
    let fbRegIdx = 0;
    let fbSpIdx = 0;

    return schedule.weeks.map((week, wIdx) => {
      const regEntries = [];
      const spEntries = [];

      if (targetClass) {
        for (const day of week.days) {
          for (let p = 1; p <= 5; p++) {
            const entry = day.slots[p];
            if (!entry) continue;
            const matches =
              entry.classId === targetClass.id ||
              (entry.type === 'midterm' && String(entry.grade) === String(targetClass.grade));
            if (!matches) continue;
            if (entry.isSpecialTopic) spEntries.push(entry);
            else regEntries.push(entry);
          }
        }
      } else {
        for (let i = 0; i < 3; i++) {
          if (fbRegIdx < fallbackReg.length) regEntries.push(fallbackReg[fbRegIdx++]);
        }
        if (fbSpIdx < fallbackSp.length) spEntries.push(fallbackSp[fbSpIdx++]);
      }

      const regCount = Math.max(3, regEntries.length);
      const spCount = Math.max(1, spEntries.length);
      const slots = [];

      for (let i = 0; i < regCount; i++) {
        const it = regEntries[i] || null;
        slots.push({
          sIdx: slots.length,
          cellKey: `${wIdx}:${slots.length}`,
          isSpecial: false,
          tietLabel: it && it.ppct != null ? String(it.ppct) : '',
          lessonName: it ? it.lessonName : '',
          note: it ? it.note || '' : '',
        });
      }

      for (let i = 0; i < spCount; i++) {
        const it = spEntries[i] || null;
        slots.push({
          sIdx: slots.length,
          cellKey: `${wIdx}:${slots.length}`,
          isSpecial: true,
          tietLabel: it && it.ppct != null ? `CĐ${it.ppct}` : 'CĐ',
          lessonName: it ? it.lessonName : '',
          note: '', // Tiết CĐ chỉ hiển thị tên bài, không hiển thị ghi chú
        });
      }

      return { week, wIdx, slots };
    });
  }

  function renderActualView(sem, schedule) {
    const classes = sem.classes || [];
    const scope = state.actualScope || 'grade:10';
    const planObj = ensureActualPlanObj(sem, scope);
    const weekRows = buildActualWeekRows(sem, schedule, scope);

    const tbodyRows = [];
    weekRows.forEach(({ week, wIdx, slots }) => {
      const slotsPerWeek = slots.length;
      const covered = new Set();

      slots.forEach((slot) => {
        const { sIdx, cellKey, isSpecial, tietLabel, lessonName, note } = slot;
        const cellData = planObj.cells[cellKey] || { text: '', highlight: false, span: 1 };

        const maxSpan = slotsPerWeek - sIdx;
        const span = Math.max(1, Math.min(maxSpan, Number(cellData.span) || 1));
        if (!covered.has(sIdx) && span > 1) {
          for (let k = 1; k < span; k++) covered.add(sIdx + k);
        }

        const weekTd =
          sIdx === 0
            ? `<td class="tl-act-week-col" rowspan="${slotsPerWeek}">
                <strong>${week.weekNumber}</strong>
                <div class="tl-act-week-dates">${week.startShortVN} – ${week.endShortVN}</div>
              </td>`
            : '';

        const tietTd = `<td class="tl-act-tiet-col ${isSpecial ? 'is-extra-slot' : ''}">${escapeHtml(tietLabel)}</td>`;

        const khdhTd = `<td class="tl-act-ppct-col ${isSpecial ? 'is-extra-slot' : ''}">
          ${
            lessonName
              ? `<div>${escapeHtml(lessonName)}</div>${
                  !isSpecial && note ? `<div class="tl-plan-note">${escapeHtml(note)}</div>` : ''
                }`
              : ''
          }
        </td>`;

        let actualTd = '';
        if (!covered.has(sIdx)) {
          const canMergeDown = sIdx + span < slotsPerWeek;
          const isHl = Boolean(cellData.highlight);
          const isSel = state.selectedActualKey === cellKey;
          actualTd = `
            <td class="tl-act-edit-col ${isHl ? 'is-highlight' : ''} ${span > 1 ? 'is-merged' : ''} ${isSel ? 'is-selected' : ''}" rowspan="${span}">
              <div class="tl-act-cell-wrap">
                <textarea
                  class="tl-act-input ${isHl ? 'is-highlight' : ''}"
                  rows="${span > 1 ? Math.min(4, span) : 1}"
                  data-act-key="${cellKey}"
                  placeholder=""
                >${escapeHtml(cellData.text || '')}</textarea>
                <div class="tl-act-tools tl-no-print">
                  <button
                    type="button"
                    class="tl-act-tool-btn ${isHl ? 'is-hl-on' : ''}"
                    data-act-hl="${cellKey}"
                    title="${isHl ? 'Bỏ tô đỏ đậm' : 'Tô đỏ đậm'}"
                  >!</button>
                  ${
                    canMergeDown
                      ? `<button type="button" class="tl-act-tool-btn" data-act-merge="${cellKey}" title="Gộp với dòng dưới">↕</button>`
                      : ''
                  }
                  ${
                    span > 1
                      ? `<button type="button" class="tl-act-tool-btn" data-act-unmerge="${cellKey}" title="Tách ô">⇕</button>`
                      : ''
                  }
                </div>
              </div>
            </td>
          `;
        }

        tbodyRows.push(`
          <tr class="${sIdx === 0 && wIdx > 0 ? 'tl-act-week-start' : ''} ${isSpecial ? 'tl-act-extra-row' : ''}">
            ${weekTd}
            ${tietTd}
            ${khdhTd}
            ${actualTd}
          </tr>
        `);
      });
    });

    return `
      <div class="section-toolbar tl-no-print">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <select id="selActualScope" class="input-control input-compact" style="width:auto; min-width:190px; font-weight:700;">
            <optgroup label="Theo khối">
              <option value="grade:10" ${scope === 'grade:10' ? 'selected' : ''}>Chung Khối 10</option>
              <option value="grade:11" ${scope === 'grade:11' ? 'selected' : ''}>Chung Khối 11</option>
              <option value="grade:12" ${scope === 'grade:12' ? 'selected' : ''}>Chung Khối 12</option>
            </optgroup>
            ${
              classes.length > 0
                ? `<optgroup label="Theo từng lớp">
                    ${classes
                      .map(
                        (c) =>
                          `<option value="class:${escapeAttr(c.id)}" ${scope === `class:${c.id}` ? 'selected' : ''}>Lớp ${escapeHtml(c.name)} (Khối ${escapeHtml(c.grade)})</option>`
                      )
                      .join('')}
                  </optgroup>`
                : ''
            }
          </select>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary btn-sm" id="btnCopyKhdhToSelected">Sao chép từ KHDH</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btnExportActualCsv">Xuất Excel (.csv)</button>
          <button type="button" class="btn btn-primary btn-sm" id="btnPrintActual">In bảng Thực tế</button>
        </div>
      </div>

      <div class="card tl-grid-card">
        <div class="tl-grid-scroll">
          <table class="tl-actual-table">
            <thead>
              <tr>
                <th style="width:92px;">Tuần</th>
                <th style="width:70px;">Tiết</th>
                <th style="width:41%;">Nội dung theo KHDH</th>
                <th style="width:45%;">Nội dung thực tế</th>
              </tr>
            </thead>
            <tbody>
              ${tbodyRows.join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function exportActualCsv(sem, schedule) {
    const scope = state.actualScope || 'grade:10';
    const grade = getActualGradeFromScope(sem, scope);
    const planObj = ensureActualPlanObj(sem, scope);
    const weekRows = buildActualWeekRows(sem, schedule, scope);

    const lines = [['Tuần', 'Tiết', 'Nội dung theo KHDH', 'Nội dung thực tế']];
    weekRows.forEach(({ week, slots }) => {
      slots.forEach((slot) => {
        const cellData = planObj.cells[slot.cellKey] || { text: '' };
        lines.push([
          `Tuần ${week.weekNumber}`,
          slot.tietLabel,
          slot.lessonName,
          cellData.text || '',
        ]);
      });
    });
    const csv =
      '\uFEFF' +
      lines
        .map((row) => row.map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Noi-dung-thuc-te-Khoi${grade}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // =========================================================
  // SUB-TAB 3: SỔ ĐỒ DÙNG DẠY HỌC (TÁCH THEO THÁNG, 4 CỘT)
  // =========================================================
  function renderEquipmentView(sem, monthlyEquip) {
    const classNames = [...new Set(monthlyEquip.flatMap((m) => m.rows.map((r) => r.className)))];

    const filteredMonths = monthlyEquip
      .filter((m) => state.equipMonthFilter === 'all' || m.monthKey === state.equipMonthFilter)
      .map((m) => ({
        ...m,
        rows: m.rows.filter(
          (r) => state.equipClassFilter === 'all' || r.className === state.equipClassFilter
        ),
      }))
      .filter((m) => m.rows.length > 0);

    return `
      <div class="section-toolbar tl-no-print">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <select id="selEquipMonth" class="input-control input-compact" style="width:auto; min-width:175px;">
            <option value="all" ${state.equipMonthFilter === 'all' ? 'selected' : ''}>Tất cả các tháng (${monthlyEquip.length})</option>
            ${monthlyEquip
              .map(
                (m) =>
                  `<option value="${m.monthKey}" ${state.equipMonthFilter === m.monthKey ? 'selected' : ''}>${escapeHtml(m.monthLabel)} (${m.rows.length} mục)</option>`
              )
              .join('')}
          </select>
          <select id="selEquipClass" class="input-control input-compact" style="width:auto; min-width:165px;">
            <option value="all" ${state.equipClassFilter === 'all' ? 'selected' : ''}>Tất cả các lớp</option>
            ${classNames
              .map(
                (cn) =>
                  `<option value="${escapeAttr(cn)}" ${state.equipClassFilter === cn ? 'selected' : ''}>${escapeHtml(cn)}</option>`
              )
              .join('')}
          </select>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary btn-sm" id="btnExportEquipCsv">Xuất Excel (.csv)</button>
          <button type="button" class="btn btn-primary btn-sm" id="btnPrintEquip">In sổ đồ dùng</button>
        </div>
      </div>

      ${
        filteredMonths.length === 0
          ? `<div class="card panel-card" style="text-align:center; padding:40px; color:var(--text-muted);">
              Chưa có mục đồ dùng dạy học nào.
            </div>`
          : filteredMonths
              .map(
                (m) => `
              <div class="card tl-equip-month-card">
                <div class="tl-equip-month-head">
                  <h3>Sổ đồ dùng dạy học — ${escapeHtml(m.monthLabel)}</h3>
                  <span class="badge badge-p1">${m.rows.length} lượt</span>
                </div>
                <div style="overflow-x:auto;">
                  <table class="data-table tl-equip-table">
                    <thead>
                      <tr>
                        <th style="width:24%;">Tiết | Buổi | Ngày</th>
                        <th style="width:32%;">Tên bài</th>
                        <th style="width:32%;">Tên đồ dùng</th>
                        <th style="width:12%;">Lớp</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${m.rows
                        .map(
                          (r) => `
                        <tr>
                          <td class="tl-equip-time-col"><strong>${r.colTimeHtml}</strong></td>
                          <td class="tl-equip-lesson-col">
                            ${escapeHtml(r.displayLesson)}
                            ${r.isMidterm ? `<span class="badge badge-p2" style="margin-left:6px;">KT GK</span>` : ''}
                          </td>
                          <td class="tl-equip-name-col">${escapeHtml(r.equipment)}</td>
                          <td class="tl-equip-class-col"><span class="badge badge-p1">${escapeHtml(r.className)}</span></td>
                        </tr>
                      `
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `
              )
              .join('')
      }
    `;
  }

  // =========================================================
  // SUB-TAB 4: THỜI KHÓA BIỂU (1 BUỔI, HỖ TRỢ NHIỀU PHIÊN BẢN TKB THEO TUẦN)
  // =========================================================
  function renderTkbView(sem, tkbRanges) {
    const classes = sem.classes || [];
    const semSession = sem.session === 'chieu' ? 'chieu' : 'sang';
    const sessionLabel = SESSION_LABELS[semSession];
    const firstWeek = Math.max(1, Number(sem.startWeek) || 1);
    const totalWeeks = Math.max(1, Math.min(30, Number(sem.totalWeeks) || 18));
    const lastWeek = firstWeek + totalWeeks - 1;

    const activeTkb = tkbRanges.find((t) => t.id === state.activeTkbId) || tkbRanges[0];
    const tkbMap = new Map();
    for (const s of activeTkb?.slots || []) {
      if (s.session && s.session !== semSession) continue;
      tkbMap.set(`${s.dayOfWeek}|${s.period}`, { classId: s.classId });
    }
    const classById = new Map(classes.map((c) => [c.id, c]));

    const rowsHtml = [];
    for (let p = 1; p <= 5; p++) {
      const cells = [1, 2, 3, 4, 5].map((dow) => {
        const hit = tkbMap.get(`${dow}|${p}`);
        const cls = hit ? classById.get(hit.classId) : null;
        const col = cls ? getClassColor(cls.id, classes) : null;
        return `
          <td
            class="tl-tkb-cell ${cls ? 'has-class' : ''}"
            data-tkb-dow="${dow}"
            data-tkb-period="${p}"
            style="${cls ? `background:${col.bg};` : ''}"
          >
            ${
              cls
                ? `<span class="tl-tkb-pill" style="color:${col.text}; border-color:${col.border};">
                    ${escapeHtml(cls.name)}
                  </span>`
                : `<span class="tl-tkb-empty">—</span>`
            }
          </td>
        `;
      });
      rowsHtml.push(`<tr><th class="tl-period-col">Tiết ${p}</th>${cells.join('')}</tr>`);
    }

    // Allowed start weeks for editing an existing non-first TKB's fromWeek
    const usedStartWeeks = new Set(
      tkbRanges.filter((t) => t.id !== activeTkb.id).map((t) => t.startWeek)
    );
    const weekOptionsHtml = [];
    for (let w = firstWeek + 1; w <= lastWeek; w++) {
      if (usedStartWeeks.has(w)) continue;
      weekOptionsHtml.push(
        `<option value="${w}" ${activeTkb.startWeek === w ? 'selected' : ''}>Tuần ${w}</option>`
      );
    }

    return `
      <!-- Semester Setup Form -->
      <div class="card panel-card" style="margin-bottom:16px;">
        <h3>Thiết lập học kì</h3>
        <div class="tl-sem-config-grid is-7cols">
          <div class="form-group" style="margin-bottom:0;">
            <label>Tên học kì</label>
            <input id="cfgSemName" class="input-control input-compact" value="${escapeAttr(sem.name)}" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Học kì</label>
            <select id="cfgSemTerm" class="input-control input-compact">
              <option value="1" ${Number(sem.termNumber) === 1 ? 'selected' : ''}>Học kì I</option>
              <option value="2" ${Number(sem.termNumber) === 2 ? 'selected' : ''}>Học kì II</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Buổi dạy</label>
            <select id="cfgSemSession" class="input-control input-compact">
              <option value="sang" ${semSession === 'sang' ? 'selected' : ''}>Buổi Sáng</option>
              <option value="chieu" ${semSession === 'chieu' ? 'selected' : ''}>Buổi Chiều</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Tuần đầu</label>
            <input id="cfgSemStartWeek" type="number" min="1" max="40" class="input-control input-compact" value="${escapeAttr(sem.startWeek || 1)}" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Thứ 2 tuần đầu</label>
            <input id="cfgSemStartDate" type="text" maxlength="10" placeholder="dd/mm/yyyy" class="input-control input-compact" value="${escapeAttr(formatDateVNAdmin(sem.startDate || '2026-09-07'))}" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Số tuần</label>
            <input id="cfgSemWeeks" type="number" min="1" max="25" class="input-control input-compact" value="${escapeAttr(sem.totalWeeks || 18)}" />
          </div>
          <div style="display:flex; align-items:flex-end;">
            <button type="button" class="btn btn-primary btn-sm" id="btnSaveSemCfg" style="width:100%;">Lưu</button>
          </div>
        </div>
      </div>

      <!-- Class Brush & Multi-Version Mon-Fri TKB -->
      <div class="card panel-card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
          <h3 style="margin:0;">Thời khóa biểu — Buổi ${sessionLabel}</h3>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <button type="button" class="btn btn-secondary btn-sm" id="btnAddTkbVersion">+ Thêm TKB mới</button>
            <button type="button" class="btn btn-primary btn-sm" id="btnAddClass">+ Thêm lớp</button>
          </div>
        </div>

        <!-- TKB Version Bar (Effective Week Ranges) -->
        <div class="tl-tkb-ver-bar">
          ${tkbRanges
            .map((t) => {
              const isActive = t.id === activeTkb.id;
              const slotCnt = (t.slots || []).filter((s) => !s.session || s.session === semSession).length;
              return `
                <button type="button" class="tl-tkb-ver-btn ${isActive ? 'active' : ''}" data-pick-tkb="${escapeAttr(t.id)}">
                  <div class="tl-tkb-ver-top">
                    <strong>${escapeHtml(t.name)}</strong>
                    <span class="tl-tkb-ver-cnt">${slotCnt} tiết</span>
                  </div>
                  <div class="tl-tkb-ver-range">${escapeHtml(t.rangeShort)}</div>
                </button>
              `;
            })
            .join('')}
        </div>

        <div class="tl-tkb-range-strip">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span class="badge badge-p1">${escapeHtml(activeTkb.name)}</span>
            <span style="font-size:0.84rem; font-weight:600; color:var(--text-secondary);">
              Thời gian áp dụng: <strong>${escapeHtml(activeTkb.rangeLong)}</strong>
            </span>
          </div>
          ${
            activeTkb.index > 0
              ? `
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <label for="selActiveTkbFromWeek" style="font-size:0.8rem; font-weight:700; color:var(--text-secondary);">Áp dụng từ:</label>
                  <select id="selActiveTkbFromWeek" class="input-control input-compact" style="width:auto; min-width:105px;">
                    ${weekOptionsHtml.join('')}
                  </select>
                  <button type="button" class="btn btn-danger-outline btn-sm" id="btnDeleteTkbVersion">Xóa TKB</button>
                </div>
              `
              : ''
          }
        </div>

        <div class="tl-brush-bar">
          ${classes
            .map((c) => {
              const col = getClassColor(c.id, classes);
              const active = state.tkbBrushClassId === c.id;
              return `
                <div class="tl-brush-item ${active ? 'active' : ''}" data-brush-cls="${escapeAttr(c.id)}" style="${active ? `border-color:${col.text}; background:${col.bg};` : ''}">
                  <span class="tl-brush-dot" style="background:${col.text};"></span>
                  <strong>${escapeHtml(c.name)}</strong>
                  <span style="font-size:0.74rem; color:var(--text-muted);">Khối ${escapeHtml(c.grade)}</span>
                  <button type="button" class="tl-badge-x" data-del-cls="${escapeAttr(c.id)}" title="Xóa lớp">×</button>
                </div>
              `;
            })
            .join('')}
          <button type="button" class="tl-brush-item ${state.tkbBrushClassId === '' ? 'active' : ''}" data-brush-cls="">
            <span>Tẩy ô trống</span>
          </button>
        </div>

        <div class="tl-grid-scroll" style="margin-top:14px;">
          <table class="tl-table tl-tkb-table">
            <thead>
              <tr>
                <th class="tl-period-col">Buổi ${sessionLabel}</th>
                ${[1, 2, 3, 4, 5].map((d) => `<th>${DAY_LABELS[d]}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml.join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // =========================================================
  // SUB-TAB 5: KẾ HOẠCH DẠY HỌC (PPCT + NÚT CHUYỂN CHUYÊN ĐỀ)
  // =========================================================
  function renderPlanView() {
    const allPlans = state.data.curriculumPlans || {};
    const isSpecial = state.planMode === 'special';
    const rawGrade = (allPlans[state.planGrade] || []).filter(
      (it) => Number(it.term || 1) === state.planTerm
    );
    const gradeList = rawGrade
      .filter((it) => Boolean(it.isSpecialTopic) === isSpecial)
      .sort((a, b) => (Number(a.ppct) || 0) - (Number(b.ppct) || 0));

    const regCnt = rawGrade.filter((it) => !it.isSpecialTopic).length;
    const spCnt = rawGrade.filter((it) => Boolean(it.isSpecialTopic)).length;

    return `
      <div class="section-toolbar">
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          ${['10', '11', '12']
            .map((g) => {
              const cnt = (allPlans[g] || []).filter(
                (it) => Number(it.term || 1) === state.planTerm && Boolean(it.isSpecialTopic) === isSpecial
              ).length;
              return `
                <button type="button" class="lab-grade-btn ${state.planGrade === g ? 'active' : ''}" data-plan-grade="${g}">
                  <span>Toán ${g}</span>
                  <span class="lab-grade-count">${cnt}</span>
                </button>
              `;
            })
            .join('')}

          <div class="tl-seg-toggle">
            <button type="button" class="tl-seg-btn ${!isSpecial ? 'active' : ''}" data-plan-mode="regular">
              Chính khóa (${regCnt})
            </button>
            <button type="button" class="tl-seg-btn ${isSpecial ? 'active' : ''}" data-plan-mode="special">
              Chuyên đề (${spCnt})
            </button>
          </div>

          <select id="selPlanTerm" class="input-control input-compact" style="width:auto; min-width:120px;">
            <option value="1" ${state.planTerm === 1 ? 'selected' : ''}>Học kì I</option>
            <option value="2" ${state.planTerm === 2 ? 'selected' : ''}>Học kì II</option>
          </select>
        </div>

        <button type="button" class="btn btn-primary btn-sm" id="btnAddPlanRow">
          ${isSpecial ? '+ Thêm tiết Chuyên đề' : '+ Thêm tiết PPCT'}
        </button>
      </div>

      <div class="card tl-plan-card" style="overflow-x:auto;">
        <table class="data-table tl-plan-table ${isSpecial ? 'is-special-plan' : ''}">
          <thead>
            <tr>
              <th style="width:100px;">${isSpecial ? 'Tiết CĐ' : 'Tiết PPCT'}</th>
              <th>${isSpecial ? 'Tên bài Chuyên đề' : 'Tên bài học'}</th>
              ${!isSpecial ? `<th>Đồ dùng dạy học</th>` : ''}
              <th style="width:130px; text-align:right;">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${
              gradeList.length === 0
                ? `<tr><td colspan="${isSpecial ? 3 : 4}" style="text-align:center; padding:34px; color:var(--text-muted);">Chưa có dữ liệu cho mục này.</td></tr>`
                : gradeList
                    .map(
                      (item) => `
                  <tr>
                    <td class="tl-plan-col-ppct"><span class="badge ${isSpecial ? 'badge-p3' : 'badge-p1'}">${isSpecial ? `CĐ${escapeHtml(item.ppct)}` : `Tiết ${escapeHtml(item.ppct)}`}</span></td>
                    <td class="tl-plan-col-name">
                      <div class="tl-plan-title">${escapeHtml(item.lessonName)}</div>
                      ${item.note ? `<div class="tl-plan-note">${escapeHtml(item.note)}</div>` : ''}
                    </td>
                    ${!isSpecial ? `<td class="tl-plan-col-equip ${item.equipment ? '' : 'is-empty-equip'}" style="font-size:0.84rem; color:var(--text-secondary);">${escapeHtml(item.equipment || '—')}</td>` : ''}
                    <td class="tl-plan-col-act" style="text-align:right; white-space:nowrap;">
                      <button type="button" class="btn btn-secondary btn-sm" data-edit-plan="${item.ppct}">Sửa</button>
                      <button type="button" class="btn btn-danger-outline btn-sm" data-del-plan="${item.ppct}">Xóa</button>
                    </td>
                  </tr>
                `
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>
    `;
  }

  // =========================================================
  // MODALS: NEW SEMESTER, HOLIDAY RANGE, SWAP DAYS, SATURDAY MIDTERM, CLASS, PLAN ROW
  // =========================================================
  function openNewSemesterModal() {
    const todayIso = toIsoDateLocal(new Date());
    openModal({
      title: 'Tạo học kì mới',
      bodyHtml: `
        <div class="form-group">
          <label>Tên học kì *</label>
          <input id="nsName" class="input-control" placeholder="VD: Học kì II — Năm học 2026-2027" />
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Buổi dạy trong học kì *</label>
            <select id="nsSession" class="input-control">
              <option value="sang">Buổi Sáng</option>
              <option value="chieu">Buổi Chiều</option>
            </select>
          </div>
          <div class="form-group">
            <label>Thuộc học kì</label>
            <select id="nsTerm" class="input-control">
              <option value="1">Học kì I</option>
              <option value="2">Học kì II</option>
            </select>
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Tuần bắt đầu</label>
            <input id="nsStartWeek" type="number" min="1" max="40" class="input-control" value="1" />
          </div>
          <div class="form-group">
            <label>Số tuần</label>
            <input id="nsTotalWeeks" type="number" min="1" max="25" class="input-control" value="18" />
          </div>
        </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Ngày Thứ 2 tuần bắt đầu (dd/mm/yyyy)</label>
            <input id="nsStartDate" type="text" maxlength="10" class="input-control" value="${escapeAttr(formatDateVNAdmin(toIsoDateLocal(snapToMonday(todayIso))))}" />
          </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="mCancelNs">Hủy</button>
        <button class="btn btn-primary" id="mSaveNs">Tạo học kì mới</button>
      `,
      onMount: (m) => {
        m.querySelector('#nsTerm').addEventListener('change', (e) => {
          m.querySelector('#nsStartWeek').value = e.target.value === '2' ? '19' : '1';
        });
        m.querySelector('#mCancelNs').addEventListener('click', closeModal);
        m.querySelector('#mSaveNs').addEventListener('click', async () => {
          const name = m.querySelector('#nsName').value.trim();
          if (!name) {
            showToast('Vui lòng nhập tên học kì.', 'error');
            return;
          }
          let startIso = '';
          try {
            startIso = parseVnDateOnlyToIso(m.querySelector('#nsStartDate').value, 'Ngày bắt đầu');
          } catch (err) {
            showToast(err.message, 'error');
            return;
          }
          const newSem = {
            id: 'sem-' + Date.now().toString(36),
            name,
            termNumber: Number(m.querySelector('#nsTerm').value) === 2 ? 2 : 1,
            session: m.querySelector('#nsSession').value === 'chieu' ? 'chieu' : 'sang',
            startWeek: Math.max(1, Number(m.querySelector('#nsStartWeek').value) || 1),
            startDate: toIsoDateLocal(snapToMonday(startIso)),
            totalWeeks: Math.max(1, Math.min(25, Number(m.querySelector('#nsTotalWeeks').value) || 18)),
            classes: [],
            timetables: [
              {
                id: 'tkb-1',
                name: 'TKB 1',
                fromWeek: Math.max(1, Number(m.querySelector('#nsStartWeek').value) || 1),
                slots: [],
              },
            ],
            timetable: [],
            holidays: [],
            swaps: [],
            saturdayMidterms: [],
            actualPlans: {},
          };
          state.data.semesters.unshift(newSem);
          state.data.activeSemesterId = newSem.id;
          state.activeTkbId = 'tkb-1';
          state.selectedWeekIdx = 0;
          state.subTab = 'tkb';
          closeModal();
          await persist('Đã tạo học kì mới!');
        });
      },
    });
  }

  function openHolidayModal(sem, schedule) {
    const curWeek = schedule.weeks[state.selectedWeekIdx] || schedule.weeks[0];
    const defaultDateVN = curWeek?.days?.[0]?.dateVN || formatDateVNAdmin(sem.startDate || '2026-09-07');
    const existing = sem.holidays || [];

    openModal({
      title: 'Thêm ngày nghỉ lễ',
      bodyHtml: `
        <div class="form-group">
          <label>Tên ngày lễ *</label>
          <input id="hlName" class="input-control" placeholder="VD: Nghỉ lễ Quốc khánh, Nghỉ Tết Dương lịch..." />
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Ngày bắt đầu (dd/mm/yyyy) *</label>
            <input id="hlStart" type="text" maxlength="10" class="input-control" placeholder="dd/mm/yyyy" value="${escapeAttr(defaultDateVN)}" />
          </div>
          <div class="form-group">
            <label>Ngày kết thúc (dd/mm/yyyy) *</label>
            <input id="hlEnd" type="text" maxlength="10" class="input-control" placeholder="dd/mm/yyyy" value="${escapeAttr(defaultDateVN)}" />
          </div>
        </div>

        ${
          existing.length > 0
            ? `
              <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--border);">
                <div style="font-size:0.8rem; font-weight:700; color:var(--text-secondary); margin-bottom:8px;">Danh sách đợt nghỉ đã lưu (${existing.length})</div>
                <div style="display:flex; flex-direction:column; gap:6px; max-height:150px; overflow-y:auto;">
                  ${existing
                    .map((h, i) => {
                      const sStr = formatDateVNAdmin(h.startDate || h.date);
                      const eStr = h.endDate && h.endDate !== h.startDate ? ` → ${formatDateVNAdmin(h.endDate)}` : '';
                      return `
                        <div class="composer-att-item">
                          <div style="flex:1; min-width:0;">
                            <div style="font-weight:700; font-size:0.84rem;">${escapeHtml(h.name || h.note || 'Nghỉ lễ')}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">${sStr}${eStr}</div>
                          </div>
                          <button type="button" class="btn btn-danger-outline btn-sm" data-modal-del-hl="${i}">Xóa</button>
                        </div>
                      `;
                    })
                    .join('')}
                </div>
              </div>
            `
            : ''
        }
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="mCancelHl">Đóng</button>
        <button class="btn btn-primary" id="mSaveHl">Thêm nghỉ lễ</button>
      `,
      onMount: (m) => {
        const startInp = m.querySelector('#hlStart');
        const endInp = m.querySelector('#hlEnd');
        startInp.addEventListener('change', () => {
          if (!endInp.value.trim()) endInp.value = startInp.value;
        });

        m.querySelectorAll('[data-modal-del-hl]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const idx = Number(btn.dataset.modalDelHl);
            sem.holidays.splice(idx, 1);
            closeModal();
            await persist('Đã xóa đợt nghỉ lễ.');
          });
        });

        m.querySelector('#mCancelHl').addEventListener('click', closeModal);
        m.querySelector('#mSaveHl').addEventListener('click', async () => {
          const name = m.querySelector('#hlName').value.trim();
          if (!name) {
            showToast('Vui lòng nhập tên ngày lễ.', 'error');
            return;
          }
          let sIso = '';
          let eIso = '';
          try {
            sIso = parseVnDateOnlyToIso(startInp.value, 'Ngày bắt đầu');
            eIso = parseVnDateOnlyToIso(endInp.value || startInp.value, 'Ngày kết thúc');
          } catch (err) {
            showToast(err.message, 'error');
            return;
          }
          if (eIso < sIso) {
            showToast('Ngày kết thúc không được trước ngày bắt đầu.', 'error');
            return;
          }
          sem.holidays = sem.holidays || [];
          sem.holidays.push({
            id: 'hl-' + Date.now().toString(36),
            name,
            startDate: sIso,
            endDate: eIso,
          });
          closeModal();
          await persist(`Đã thêm đợt nghỉ "${name}" — các tiết dạy đã tự động dời lịch!`);
        });
      },
    });
  }

  function openScheduleGearModal(sem, schedule) {
    const holidaysList = sem.holidays || [];
    const swapsList = sem.swaps || [];
    const midtermsList = sem.saturdayMidterms || [];
    const totalMods = holidaysList.length + swapsList.length + midtermsList.length;

    openModal({
      title: 'Điều chỉnh lịch dạy & TKB',
      bodyHtml: `
        <div class="tl-gear-actions-grid">
          <button type="button" class="btn btn-secondary" id="gearBtnHoliday">Nghỉ lễ</button>
          <button type="button" class="btn btn-secondary" id="gearBtnSwap">Hoán đổi</button>
          <button type="button" class="btn btn-primary" id="gearBtnMidterm">Kiểm tra giữa kì</button>
        </div>

        <div class="tl-gear-mods-sec">
          <div class="tl-gear-mods-head">
            <strong>Thay đổi TKB đang áp dụng</strong>
            <span class="badge badge-neutral">${totalMods}</span>
          </div>
          ${
            totalMods === 0
              ? `<div class="tl-gear-empty">Chưa có ngày nghỉ lễ, hoán đổi ngày dạy hay kiểm tra giữa kì nào trong học kì này.</div>`
              : `
                <div class="tl-gear-mods-list">
                  ${holidaysList
                    .map((h, idx) => {
                      const lbl = h.name || h.note || 'Nghỉ lễ';
                      const rangeStr = h.startDate
                        ? h.endDate && h.endDate !== h.startDate
                          ? `${formatDateVNAdmin(h.startDate)} → ${formatDateVNAdmin(h.endDate)}`
                          : formatDateVNAdmin(h.startDate)
                        : formatDateVNAdmin(h.date);
                      return `
                        <div class="tl-gear-mod-item">
                          <div class="tl-gear-mod-info">
                            <span class="badge badge-warning">Nghỉ lễ</span>
                            <div>
                              <div class="tl-gear-mod-title">${escapeHtml(lbl)}</div>
                              <div class="tl-gear-mod-sub">${escapeHtml(rangeStr)}</div>
                            </div>
                          </div>
                          <button type="button" class="btn btn-danger-outline btn-sm" data-gear-del-holiday="${idx}">Xóa</button>
                        </div>
                      `;
                    })
                    .join('')}
                  ${swapsList
                    .map(
                      (sw) => `
                        <div class="tl-gear-mod-item">
                          <div class="tl-gear-mod-info">
                            <span class="badge badge-p1">Hoán đổi</span>
                            <div>
                              <div class="tl-gear-mod-title">${formatDateVNAdmin(sw.dateA)} ↔ ${formatDateVNAdmin(sw.dateB)}</div>
                              ${sw.note ? `<div class="tl-gear-mod-sub">${escapeHtml(sw.note)}</div>` : ''}
                            </div>
                          </div>
                          <button type="button" class="btn btn-danger-outline btn-sm" data-gear-del-swap="${escapeAttr(sw.id)}">Xóa</button>
                        </div>
                      `
                    )
                    .join('')}
                  ${midtermsList
                    .map(
                      (mt) => `
                        <div class="tl-gear-mod-item">
                          <div class="tl-gear-mod-info">
                            <span class="badge badge-p2">KT giữa kì</span>
                            <div>
                              <div class="tl-gear-mod-title">Khối ${escapeHtml(mt.grade)} — ${formatDateVNAdmin(mt.date)}</div>
                              <div class="tl-gear-mod-sub">Tiết ${(mt.periods || []).join(', ')}${mt.term ? ` • Học kì ${mt.term === 2 ? 'II' : 'I'}` : ''}</div>
                            </div>
                          </div>
                          <button type="button" class="btn btn-danger-outline btn-sm" data-gear-del-midterm="${escapeAttr(mt.id)}">Xóa</button>
                        </div>
                      `
                    )
                    .join('')}
                </div>
              `
          }
        </div>
      `,
      footerHtml: `<button type="button" class="btn btn-primary" id="mCloseGear">Đóng</button>`,
      onMount: (m) => {
        m.querySelector('#mCloseGear').addEventListener('click', closeModal);
        m.querySelector('#gearBtnHoliday').addEventListener('click', () => {
          openHolidayModal(sem, schedule);
        });
        m.querySelector('#gearBtnSwap').addEventListener('click', () => {
          openSwapDaysModal(sem, schedule);
        });
        m.querySelector('#gearBtnMidterm').addEventListener('click', () => {
          openSaturdayMidtermModal(sem, schedule);
        });

        m.querySelectorAll('[data-gear-del-holiday]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const idx = Number(btn.dataset.gearDelHoliday);
            sem.holidays.splice(idx, 1);
            await persist('Đã xóa đợt nghỉ lễ.');
            openScheduleGearModal(getActiveSemester(), buildSemesterSchedule(getActiveSemester()));
          });
        });

        m.querySelectorAll('[data-gear-del-swap]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.gearDelSwap;
            sem.swaps = (sem.swaps || []).filter((x) => x.id !== id);
            await persist('Đã hủy hoán đổi ngày.');
            openScheduleGearModal(getActiveSemester(), buildSemesterSchedule(getActiveSemester()));
          });
        });

        m.querySelectorAll('[data-gear-del-midterm]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.gearDelMidterm;
            sem.saturdayMidterms = (sem.saturdayMidterms || []).filter((x) => x.id !== id);
            await persist('Đã xóa lịch kiểm tra giữa kì.');
            openScheduleGearModal(getActiveSemester(), buildSemesterSchedule(getActiveSemester()));
          });
        });
      },
    });
  }

  function openSaturdayMidtermModal(sem, schedule) {
    const saturdays = schedule.allDays.filter((d) => d.dayOfWeek === 6);
    const curWeekSat = schedule.weeks[state.selectedWeekIdx]?.days?.[5] || saturdays[0];
    const gradesInSem = [...new Set((sem.classes || []).map((c) => String(c.grade)))];
    const defaultGrade = gradesInSem[0] || '10';
    const semSession = sem.session === 'chieu' ? 'chieu' : 'sang';
    const existing = sem.saturdayMidterms || [];

    openModal({
      title: 'Thêm lịch Kiểm tra giữa kì (Thứ 7)',
      bodyHtml: `
        <div class="form-row-2">
          <div class="form-group">
            <label>Ngày Thứ 7 kiểm tra *</label>
            <select id="mtDate" class="input-control">
              ${saturdays
                .map(
                  (d) =>
                    `<option value="${d.iso}" ${curWeekSat && d.iso === curWeekSat.iso ? 'selected' : ''}>Tuần ${d.weekNumber} — Thứ 7 (${d.dateVN})</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Khối kiểm tra chung</label>
            <select id="mtGrade" class="input-control">
              ${['10', '11', '12']
                .map((g) => `<option value="${g}" ${g === defaultGrade ? 'selected' : ''}>Khối ${g}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group" style="margin-bottom:0;">
            <label>Kì kiểm tra</label>
            <select id="mtTerm" class="input-control">
              <option value="1" ${Number(sem.termNumber) === 1 ? 'selected' : ''}>Kiểm tra giữa kì I</option>
              <option value="2" ${Number(sem.termNumber) === 2 ? 'selected' : ''}>Kiểm tra giữa kì II</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Chọn 2 tiết (Buổi ${SESSION_LABELS[semSession]})</label>
            <div style="display:flex; gap:8px;">
              <select id="mtP1" class="input-control">
                ${[1, 2, 3, 4, 5].map((p) => `<option value="${p}" ${p === 1 ? 'selected' : ''}>Tiết ${p}</option>`).join('')}
              </select>
              <select id="mtP2" class="input-control">
                ${[1, 2, 3, 4, 5].map((p) => `<option value="${p}" ${p === 2 ? 'selected' : ''}>Tiết ${p}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        ${
          existing.length > 0
            ? `
              <div style="margin-top:14px; padding-top:12px; border-top:1px solid var(--border);">
                <div style="font-size:0.8rem; font-weight:700; color:var(--text-secondary); margin-bottom:8px;">Lịch KT giữa kì đã xếp (${existing.length})</div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                  ${existing
                    .map(
                      (mt) => `
                    <div class="composer-att-item">
                      <div style="flex:1; min-width:0;">
                        <div style="font-weight:700; font-size:0.84rem;">KT giữa kì ${Number(mt.term) === 2 ? 'II' : 'I'} — Khối ${escapeHtml(mt.grade)}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">Thứ 7 (${formatDateVNAdmin(mt.date)}) • Tiết ${(mt.periods || []).join(', ')}</div>
                      </div>
                      <button type="button" class="btn btn-danger-outline btn-sm" data-modal-del-mt="${escapeAttr(mt.id)}">Xóa</button>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>
            `
            : ''
        }
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="mCancelMt">Đóng</button>
        <button class="btn btn-primary" id="mSaveMt">Lưu lịch kiểm tra</button>
      `,
      onMount: (m) => {
        m.querySelectorAll('[data-modal-del-mt]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.modalDelMt;
            sem.saturdayMidterms = (sem.saturdayMidterms || []).filter((x) => x.id !== id);
            closeModal();
            await persist('Đã xóa lịch kiểm tra giữa kì.');
          });
        });
        m.querySelector('#mCancelMt').addEventListener('click', closeModal);
        m.querySelector('#mSaveMt').addEventListener('click', async () => {
          const date = m.querySelector('#mtDate').value;
          const grade = m.querySelector('#mtGrade').value;
          const term = Number(m.querySelector('#mtTerm').value) === 2 ? 2 : 1;
          const a = Number(m.querySelector('#mtP1').value);
          const b = Number(m.querySelector('#mtP2').value);
          if (a === b) {
            showToast('Vui lòng chọn 2 tiết khác nhau.', 'error');
            return;
          }
          const periodsPair = [a, b].sort((x, y) => x - y);
          sem.saturdayMidterms = (sem.saturdayMidterms || []).filter(
            (x) => !(String(x.grade) === grade && Number(x.term || sem.termNumber) === term)
          );
          sem.saturdayMidterms.push({
            id: 'mt-' + Date.now().toString(36),
            date,
            session: semSession,
            periods: periodsPair,
            grade,
            term,
            title: `Kiểm tra giữa kì ${term === 2 ? 'II' : 'I'} (Khối ${grade})`,
          });
          // Jump to the week containing that Saturday so user sees Thứ 7 appear immediately!
          const targetWeekIdx = schedule.weeks.findIndex((w) => w.days.some((d) => d.iso === date));
          if (targetWeekIdx >= 0) {
            state.selectedWeekIdx = targetWeekIdx;
            state.centerActiveWeekOnce = true;
          }
          closeModal();
          await persist(`Đã xếp KT giữa kì ${term === 2 ? 'II' : 'I'} Khối ${grade} vào Thứ 7 (${formatDateVNAdmin(date)})!`);
        });
      },
    });
  }

  function openSwapDaysModal(sem, schedule) {
    const dayOptions = schedule.allDays
      .map(
        (d) =>
          `<option value="${d.iso}">Tuần ${d.weekNumber} — ${DAY_LABELS[d.dayOfWeek]} (${d.dateVN})</option>`
      )
      .join('');

    openModal({
      title: 'Hoán đổi 2 ngày làm việc',
      bodyHtml: `
        <div class="form-row-2">
          <div class="form-group">
            <label>Ngày thứ nhất</label>
            <select id="swDateA" class="input-control">${dayOptions}</select>
          </div>
          <div class="form-group">
            <label>Ngày thứ hai</label>
            <select id="swDateB" class="input-control">${dayOptions}</select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Ghi chú (tùy chọn)</label>
          <input id="swNote" class="input-control" placeholder="VD: Đổi lịch dạy bù" />
        </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="mCancelSw">Hủy</button>
        <button class="btn btn-primary" id="mSaveSw">Thực hiện hoán đổi</button>
      `,
      onMount: (m) => {
        const selB = m.querySelector('#swDateB');
        if (selB.options.length > 5) selB.selectedIndex = 5; // default to Thứ 7 of Week 1
        m.querySelector('#mCancelSw').addEventListener('click', closeModal);
        m.querySelector('#mSaveSw').addEventListener('click', async () => {
          const dateA = m.querySelector('#swDateA').value;
          const dateB = m.querySelector('#swDateB').value;
          if (!dateA || !dateB || dateA === dateB) {
            showToast('Vui lòng chọn 2 ngày khác nhau.', 'error');
            return;
          }
          sem.swaps = sem.swaps || [];
          sem.swaps.push({
            id: 'sw-' + Date.now().toString(36),
            dateA,
            dateB,
            note: m.querySelector('#swNote').value.trim(),
          });
          closeModal();
          await persist(`Đã hoán đổi ${formatDateVNAdmin(dateA)} ↔ ${formatDateVNAdmin(dateB)}!`);
        });
      },
    });
  }

  function openAddClassModal(sem) {
    openModal({
      title: 'Thêm lớp giảng dạy',
      bodyHtml: `
        <div class="form-row-2">
          <div class="form-group" style="margin-bottom:0;">
            <label>Tên lớp *</label>
            <input id="newClsName" class="input-control" placeholder="VD: 10A3, 11A1, 12A2" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Khối</label>
            <select id="newClsGrade" class="input-control">
              <option value="10">Khối 10</option>
              <option value="11">Khối 11</option>
              <option value="12">Khối 12</option>
            </select>
          </div>
        </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="mCancelCls">Hủy</button>
        <button class="btn btn-primary" id="mSaveCls">Thêm lớp</button>
      `,
      onMount: (m) => {
        m.querySelector('#mCancelCls').addEventListener('click', closeModal);
        m.querySelector('#mSaveCls').addEventListener('click', async () => {
          const name = m.querySelector('#newClsName').value.trim();
          const grade = m.querySelector('#newClsGrade').value;
          if (!name) {
            showToast('Vui lòng nhập tên lớp.', 'error');
            return;
          }
          sem.classes = sem.classes || [];
          if (sem.classes.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
            showToast(`Lớp ${name} đã có trong học kì này.`, 'error');
            return;
          }
          const newCls = { id: 'cls-' + Date.now().toString(36), name, grade };
          sem.classes.push(newCls);
          state.tkbBrushClassId = newCls.id;
          closeModal();
          await persist(`Đã thêm lớp ${name} (Khối ${grade})!`);
        });
      },
    });
  }

  function openConfirmDeleteModal({ title, messageHtml, confirmText = 'Xóa', onConfirm }) {
    openModal({
      title,
      bodyHtml: `<p style="margin:0; line-height:1.55; color:var(--text);">${messageHtml}</p>`,
      footerHtml: `
        <button type="button" class="btn btn-secondary" id="mCancelConfirmDel">Hủy</button>
        <button type="button" class="btn btn-danger-outline" id="mOkConfirmDel">${escapeHtml(confirmText)}</button>
      `,
      onMount: (m) => {
        m.querySelector('#mCancelConfirmDel').addEventListener('click', closeModal);
        m.querySelector('#mOkConfirmDel').addEventListener('click', async () => {
          closeModal();
          await onConfirm();
        });
      },
    });
  }

  function openAddTkbModal(sem) {
    const tkbRanges = ensureTimetables(sem);
    const firstWeek = Math.max(1, Number(sem.startWeek) || 1);
    const totalWeeks = Math.max(1, Math.min(30, Number(sem.totalWeeks) || 18));
    const lastWeek = firstWeek + totalWeeks - 1;
    const usedWeeks = new Set(tkbRanges.map((t) => t.startWeek));

    const availableWeeks = [];
    for (let w = firstWeek + 1; w <= lastWeek; w++) {
      if (!usedWeeks.has(w)) availableWeeks.push(w);
    }
    if (availableWeeks.length === 0) {
      showToast('Đã có TKB cho tất cả các tuần trong học kì này.', 'info');
      return;
    }

    const lastTkb = tkbRanges[tkbRanges.length - 1];
    const suggestedWeek =
      availableWeeks.find((w) => w >= Math.min(lastWeek, lastTkb.startWeek + 4)) || availableWeeks[0];
    const nextNum = tkbRanges.length + 1;

    openModal({
      title: 'Thêm Thời khóa biểu mới',
      bodyHtml: `
        <div class="form-row-2">
          <div class="form-group">
            <label>Tên TKB *</label>
            <input id="ntName" class="input-control" value="TKB ${nextNum}" placeholder="VD: TKB ${nextNum}, TKB sau giữa kì..." />
          </div>
          <div class="form-group">
            <label>Áp dụng từ tuần *</label>
            <select id="ntFromWeek" class="input-control">
              ${availableWeeks
                .map((w) => `<option value="${w}" ${w === suggestedWeek ? 'selected' : ''}>Tuần ${w}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Khởi tạo lưới TKB</label>
          <select id="ntSource" class="input-control">
            <option value="copy">Sao chép từ TKB hiện tại để chỉnh sửa nhanh</option>
            <option value="empty">Tạo lưới TKB trống</option>
          </select>
        </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="mCancelNt">Hủy</button>
        <button class="btn btn-primary" id="mSaveNt">Tạo TKB mới</button>
      `,
      onMount: (m) => {
        m.querySelector('#mCancelNt').addEventListener('click', closeModal);
        m.querySelector('#mSaveNt').addEventListener('click', async () => {
          const name = m.querySelector('#ntName').value.trim() || `TKB ${nextNum}`;
          const fromWeek = Number(m.querySelector('#ntFromWeek').value);
          const copyMode = m.querySelector('#ntSource').value === 'copy';
          const curActive =
            sem.timetables.find((t) => t.id === state.activeTkbId) ||
            sem.timetables[sem.timetables.length - 1];
          const newId = 'tkb-' + Date.now().toString(36);
          const clonedSlots = copyMode
            ? (curActive?.slots || []).map((s) => ({
                dayOfWeek: Number(s.dayOfWeek),
                session: s.session || sem.session || 'sang',
                period: Number(s.period),
                classId: s.classId,
              }))
            : [];
          sem.timetables.push({
            id: newId,
            name,
            fromWeek,
            slots: clonedSlots,
          });
          ensureTimetables(sem);
          state.activeTkbId = newId;
          closeModal();
          await persist(`Đã thêm ${name} (áp dụng từ Tuần ${fromWeek})!`);
        });
      },
    });
  }

  function findPrevClassPrivateNote(sem, schedule, entry) {
    const entryIso = entry?.iso || entry?.dateIso || '';
    if (!sem || !schedule || !entry || !entry.classId || !entryIso) return null;
    const notesMap = sem.privateNotes && typeof sem.privateNotes === 'object' ? sem.privateNotes : {};
    const days = schedule.allDays || [];
    let checkedForClass = 0;

    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i];
      if (!d || d.iso > entryIso) continue;
      for (let p = 5; p >= 1; p--) {
        if (d.iso === entryIso && p >= Number(entry.period)) continue;
        const sl = d.slots?.[p];
        if (!sl || sl.classId !== entry.classId) continue;
        checkedForClass += 1;
        const txt = String(notesMap[`${d.iso}|${p}`] || '').trim();
        if (txt) {
          return { dateVN: d.dateVN, period: p, note: txt };
        }
        if (checkedForClass >= 2) return null;
      }
    }
    return null;
  }

  function openSlotDetailModal(entry, sem, schedule, onUpdated) {
    if (!entry) return;
    const entryIso = entry.iso || entry.dateIso || '';
    const sessionLabel = SESSION_LABELS[entry.session] || 'Sáng';
    const dowLabel = DAY_LABELS[entry.dayOfWeek] || '';
    const kindBadge =
      entry.type === 'midterm'
        ? `<span class="badge badge-p2">Kiểm tra giữa kì</span>`
        : entry.isSpecialTopic
          ? `<span class="badge badge-p3">Chuyên đề • CĐ${escapeHtml(entry.ppct)}</span>`
          : `<span class="badge badge-p1">Chính khóa • Tiết PPCT ${escapeHtml(entry.ppct)}</span>`;

    const noteText = String(entry.note || '').trim();
    const equipText = String(entry.equipment || '').trim();
    const slotKey = `${entryIso}|${entry.period}`;
    const curPrivNote = String(sem?.privateNotes?.[slotKey] || '').trim();
    const prevReminder = findPrevClassPrivateNote(sem, schedule, { ...entry, iso: entryIso });

    openModal({
      title: 'Chi tiết tiết dạy',
      bodyHtml: `
        <div class="tl-detail-modal">
          <div class="tl-detail-badges">
            <span class="badge badge-neutral">Lớp ${escapeHtml(entry.className)}</span>
            ${kindBadge}
            ${entry.type === 'midterm' && entry.ppct != null ? `<span class="badge badge-neutral">PPCT ${escapeHtml(entry.ppct)}</span>` : ''}
          </div>

          <div class="tl-detail-time">
            Tuần ${escapeHtml(entry.weekNumber)} • ${escapeHtml(dowLabel)} (${escapeHtml(entry.dateVN)}) • Buổi ${escapeHtml(sessionLabel)} • Tiết ${escapeHtml(entry.period)}
          </div>

          <div class="tl-detail-block">
            ${entry.chapter ? `<div class="tl-detail-chapter">${escapeHtml(entry.chapter)}</div>` : ''}
            <div class="tl-detail-lesson">${escapeHtml(entry.lessonName)}</div>
          </div>

          <div class="tl-detail-grid">
            <div class="tl-detail-box">
              <div class="tl-detail-box-label">Ghi chú nội dung dạy</div>
              <div class="tl-detail-box-val ${noteText ? '' : 'is-empty'}">
                ${noteText ? escapeHtml(noteText) : 'Không có ghi chú'}
              </div>
            </div>

            <div class="tl-detail-box">
              <div class="tl-detail-box-label">Đồ dùng dạy học</div>
              <div class="tl-detail-box-val ${equipText ? '' : 'is-empty'}">
                ${equipText ? escapeHtml(equipText) : 'Không sử dụng đồ dùng dạy học'}
              </div>
            </div>
          </div>

          ${
            prevReminder
              ? `
                <div class="tl-priv-prev-banner">
                  <strong>Nhắc từ tiết trước (${escapeHtml(prevReminder.dateVN)} • Tiết ${prevReminder.period}):</strong>
                  <span>${escapeHtml(prevReminder.note)}</span>
                </div>
              `
              : ''
          }

          <div class="tl-priv-note-box">
            <div class="tl-priv-note-head">
              <span class="tl-detail-box-label" style="margin:0;">Sổ tay tiết dạy</span>
              <span class="tl-priv-note-tag">Ghi chú riêng • Không in</span>
            </div>
            <textarea
              id="slotPrivateNoteInp"
              class="input-control tl-priv-note-ta"
              rows="3"
              placeholder="VD: ${escapeAttr(entry.className || '11/6')} chưa kịp chữa bài 3, tiết sau nhắc lại / Kiểm tra 15p vào thứ 6..."
            >${escapeHtml(curPrivNote)}</textarea>
          </div>
        </div>
      `,
      footerHtml: `
        ${curPrivNote ? `<button type="button" class="btn btn-danger-outline" id="mDelSlotNote" style="margin-right:auto;">Xóa ghi chú</button>` : ''}
        <button type="button" class="btn btn-secondary" id="mCloseSlotDetail">Đóng</button>
        <button type="button" class="btn btn-primary" id="mSaveSlotNote">Lưu ghi chú</button>
      `,
      onMount: (m) => {
        const ta = m.querySelector('#slotPrivateNoteInp');
        const btnSave = m.querySelector('#mSaveSlotNote');
        const btnDel = m.querySelector('#mDelSlotNote');

        const saveNoteValue = async (nextVal, successMsg) => {
          if (!sem) return;
          if (!sem.privateNotes || typeof sem.privateNotes !== 'object') {
            sem.privateNotes = {};
          }
          const clean = String(nextVal || '').trim();
          if (clean) {
            sem.privateNotes[slotKey] = clean;
          } else {
            delete sem.privateNotes[slotKey];
          }
          if (btnSave) btnSave.disabled = true;
          if (btnDel) btnDel.disabled = true;
          try {
            const res = await api.saveTeachingLog(state.data);
            if (res?.teachingLog) state.data = res.teachingLog;
            closeModal();
            if (typeof onUpdated === 'function') onUpdated();
            showToast(successMsg, 'success');
          } catch (err) {
            showToast(err.message || 'Không thể lưu ghi chú tiết dạy.', 'error');
            if (btnSave) btnSave.disabled = false;
            if (btnDel) btnDel.disabled = false;
          }
        };

        m.querySelector('#mCloseSlotDetail')?.addEventListener('click', closeModal);
        btnSave?.addEventListener('click', () => {
          const val = ta ? ta.value.trim() : '';
          saveNoteValue(val, val ? 'Đã lưu ghi chú sổ tay tiết dạy!' : 'Đã xóa ghi chú sổ tay.');
        });
        btnDel?.addEventListener('click', () => {
          saveNoteValue('', 'Đã xóa ghi chú sổ tay.');
        });
      },
    });
  }

  function openPlanRowModal(existing = null) {
    const isSpecial = state.planMode === 'special';
    const list = (state.data.curriculumPlans?.[state.planGrade] || []).filter(
      (it) => Number(it.term || 1) === state.planTerm && Boolean(it.isSpecialTopic) === isSpecial
    );
    const nextPpct = existing
      ? existing.ppct
      : list.reduce((mx, it) => Math.max(mx, Number(it.ppct) || 0), 0) + 1;

    openModal({
      title: existing
        ? `Chỉnh sửa ${isSpecial ? `CĐ${existing.ppct}` : `Tiết ${existing.ppct}`} — Toán ${state.planGrade}`
        : `Thêm ${isSpecial ? 'tiết Chuyên đề' : 'tiết PPCT'} — Toán ${state.planGrade} (HK ${state.planTerm === 2 ? 'II' : 'I'})`,
      bodyHtml: `
        <div class="form-group">
          <label>${isSpecial ? 'Số tiết Chuyên đề *' : 'Số tiết PPCT *'}</label>
          <input id="plPpct" type="number" min="1" class="input-control" value="${escapeAttr(nextPpct)}" />
        </div>
        <div class="form-group">
          <label>${isSpecial ? 'Tên bài Chuyên đề *' : 'Tên bài học *'}</label>
          <input id="plName" class="input-control" placeholder="${isSpecial ? 'VD: Bài 1. Hệ phương trình bậc nhất ba ẩn' : 'VD: Bài 1. Mệnh đề'}" value="${escapeAttr(existing?.lessonName || '')}" />
        </div>
        <div class="form-group" style="${isSpecial ? 'margin-bottom:0;' : ''}">
          <label>Ghi chú nội dung dạy (mục / giới hạn tiết học)</label>
          <input id="plNote" class="input-control" placeholder="VD: Mục 1, 2 / Đến hết Luyện tập 2 / Hướng dẫn giải bài tập..." value="${escapeAttr(existing?.note || '')}" />
        </div>
        ${
          !isSpecial
            ? `
              <div class="form-group" style="margin-bottom:0;">
                <label>Đồ dùng dạy học (để trống nếu không dùng)</label>
                <input id="plEquip" class="input-control" placeholder="VD: Máy tính cầm tay, Bảng phụ..." value="${escapeAttr(existing?.equipment || '')}" />
              </div>
            `
            : ''
        }
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="mCancelPl">Hủy</button>
        <button class="btn btn-primary" id="mSavePl">Lưu</button>
      `,
      onMount: (m) => {
        m.querySelector('#mCancelPl').addEventListener('click', closeModal);
        m.querySelector('#mSavePl').addEventListener('click', async () => {
          const ppct = Math.max(1, Number(m.querySelector('#plPpct').value) || 1);
          const lessonName = m.querySelector('#plName').value.trim();
          const note = m.querySelector('#plNote').value.trim();
          const equipment = isSpecial ? '' : (m.querySelector('#plEquip')?.value.trim() || '');
          if (!lessonName) {
            showToast('Vui lòng nhập tên bài học.', 'error');
            return;
          }
          state.data.curriculumPlans = state.data.curriculumPlans || { '10': [], '11': [], '12': [] };
          const arr = state.data.curriculumPlans[state.planGrade] || [];
          const newItem = {
            ...(existing || {}),
            ppct,
            term: state.planTerm,
            isSpecialTopic: isSpecial,
            lessonName,
            note,
            equipment,
          };
          if (existing) {
            const idx = arr.findIndex(
              (x) =>
                Number(x.ppct) === Number(existing.ppct) &&
                Number(x.term || 1) === state.planTerm &&
                Boolean(x.isSpecialTopic) === isSpecial
            );
            if (idx >= 0) arr[idx] = newItem;
          } else {
            arr.push(newItem);
          }
          state.data.curriculumPlans[state.planGrade] = arr;
          closeModal();
          await persist('Đã lưu Kế hoạch dạy học!');
        });
      },
    });
  }

  function exportEquipmentCsv(sem, monthlyEquip) {
    const lines = [['Tháng', 'Tiết | Buổi | Ngày', 'Tên bài', 'Tên đồ dùng', 'Lớp']];
    for (const m of monthlyEquip) {
      if (state.equipMonthFilter !== 'all' && m.monthKey !== state.equipMonthFilter) continue;
      for (const r of m.rows) {
        if (state.equipClassFilter !== 'all' && r.className !== state.equipClassFilter) continue;
        lines.push([m.monthLabel, r.colTime, r.displayLesson, r.equipment, r.className]);
      }
    }
    const csv =
      '\uFEFF' +
      lines
        .map((row) => row.map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `So-do-dung-${sem.name.replace(/[^\w\d-]+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // =========================================================
  // EVENT BINDINGS
  // =========================================================
  function bindEvents(sem, schedule, monthlyEquip) {
    rootEl.querySelector('#selSemester')?.addEventListener('change', async (e) => {
      state.data.activeSemesterId = e.target.value;
      const nextSem = getActiveSemester();
      state.selectedWeekIdx = findCurrentWeekIndex(nextSem);
      state.centerActiveWeekOnce = true;
      state.weekPillsScrollLeft = null;
      state.activeTkbId = '';
      state.tkbBrushClassId = nextSem?.classes?.[0]?.id || '';
      await persist();
    });

    rootEl.querySelector('#btnNewSemester')?.addEventListener('click', openNewSemesterModal);

    rootEl.querySelector('#btnDeleteSemester')?.addEventListener('click', () => {
      if (state.data.semesters.length <= 1) return;
      openConfirmDeleteModal({
        title: 'Xác nhận xóa học kì',
        messageHtml: `Bạn có chắc chắn muốn xóa học kì <strong>${escapeHtml(sem.name)}</strong>? Toàn bộ TKB, ngày nghỉ và dữ liệu thực tế của học kì này sẽ bị xóa.`,
        confirmText: 'Xóa học kì',
        onConfirm: async () => {
          state.data.semesters = state.data.semesters.filter((s) => s.id !== sem.id);
          state.data.activeSemesterId = state.data.semesters[0].id;
          state.selectedWeekIdx = findCurrentWeekIndex(state.data.semesters[0]);
          state.centerActiveWeekOnce = true;
          state.weekPillsScrollLeft = null;
          state.activeTkbId = '';
          await persist('Đã xóa học kì.');
        },
      });
    });

    rootEl.querySelectorAll('[data-tl-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.subTab = btn.dataset.tlTab;
        const routeMap = {
          log: '/so-bao-giang',
          actual: '/so-bao-giang/thuc-te',
          equipment: '/so-bao-giang/so-do-dung',
          tkb: '/so-bao-giang/tkb',
          plan: '/so-bao-giang/khdh',
        };
        onRouteChange?.(routeMap[state.subTab] || '/so-bao-giang');
        render();
      });
    });

    // Keep active sub-tab visible in mobile horizontal swipe strip
    const activeSubTabBtn = rootEl.querySelector('.subtab-btn.active');
    if (activeSubTabBtn && window.innerWidth <= 768) {
      const subBar = activeSubTabBtn.closest('.subtab-bar');
      if (subBar) {
        subBar.scrollLeft = Math.max(
          0,
          activeSubTabBtn.offsetLeft - (subBar.clientWidth - activeSubTabBtn.offsetWidth) / 2
        );
      }
    }

    // === SUB-TAB 1: SỔ BÁO GIẢNG ===
    const pillsEl = rootEl.querySelector('.tl-week-pills');
    const activeWeekBtn = pillsEl?.querySelector('.tl-week-btn.active');
    if (pillsEl) {
      if (state.centerActiveWeekOnce && activeWeekBtn) {
        pillsEl.scrollLeft = Math.max(
          0,
          activeWeekBtn.offsetLeft - (pillsEl.clientWidth - activeWeekBtn.offsetWidth) / 2
        );
        state.weekPillsScrollLeft = pillsEl.scrollLeft;
        state.centerActiveWeekOnce = false;
      } else if (state.weekPillsScrollLeft !== null) {
        pillsEl.scrollLeft = state.weekPillsScrollLeft;
      }
      pillsEl.addEventListener(
        'scroll',
        () => {
          state.weekPillsScrollLeft = pillsEl.scrollLeft;
        },
        { passive: true }
      );
    }

    function bindLogGridEvents(hostEl) {
      if (!hostEl) return;
      // On mobile, scroll today's column into view right next to the sticky Tiết column
      const weekGridScroll = hostEl.querySelector('#tlWeekTable')?.closest('.tl-grid-scroll');
      const todayTh = weekGridScroll?.querySelector('th.tl-day-head.is-today');
      if (weekGridScroll && todayTh && window.innerWidth <= 768) {
        const stickyW = weekGridScroll.querySelector('th.tl-period-col')?.offsetWidth || 58;
        weekGridScroll.scrollLeft = Math.max(0, todayTh.offsetLeft - stickyW);
      }

      hostEl.querySelectorAll('.tl-slot-card[data-slot-iso]').forEach((card) => {
        const openDetails = (e) => {
          if (e.target.closest('[data-del-sat-mt]')) return;
          const iso = card.dataset.slotIso;
          const period = Number(card.dataset.slotPeriod);
          const dayObj = schedule.allDays.find((d) => d.iso === iso);
          const entry = dayObj?.slots?.[period];
          if (entry) {
            const activeSem = getActiveSemester() || sem;
            openSlotDetailModal({ ...entry, iso }, activeSem, schedule, () => {
              const prevScrollLeft = hostEl.querySelector('.tl-grid-scroll')?.scrollLeft || 0;
              const curSem = getActiveSemester() || sem;
              const curWeek = schedule.weeks[state.selectedWeekIdx] || schedule.weeks[0];
              hostEl.innerHTML = renderLogWeekGridHtml(curSem, schedule, curWeek);
              bindLogGridEvents(hostEl);
              const nextScroll = hostEl.querySelector('.tl-grid-scroll');
              if (nextScroll) nextScroll.scrollLeft = prevScrollLeft;
            });
          }
        };
        card.addEventListener('click', openDetails);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDetails(e);
          }
        });
      });

      hostEl.querySelectorAll('[data-del-sat-mt]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.delSatMt;
          const curSem = getActiveSemester() || sem;
          curSem.saturdayMidterms = (curSem.saturdayMidterms || []).filter((x) => x.id !== id);
          await persist('Đã xóa lịch kiểm tra giữa kì.');
        });
      });
    }

    const gridHost = rootEl.querySelector('#tlWeekGridHost');
    bindLogGridEvents(gridHost);

    // Swap ONLY the weekly table in-place — NEVER rebuild .tl-week-pills (eliminates all jitter/flicker!)
    function selectWeekInPlace(nextIdx, { ensureVisible = false } = {}) {
      const clamped = Math.max(0, Math.min(schedule.weeks.length - 1, Number(nextIdx) || 0));
      if (clamped === state.selectedWeekIdx) return;
      state.selectedWeekIdx = clamped;

      // Update desktop week pills active class in-place
      let newActiveBtn = null;
      rootEl.querySelectorAll('[data-pick-week]').forEach((b) => {
        const isAct = Number(b.dataset.pickWeek) === clamped;
        b.classList.toggle('active', isAct);
        if (isAct) newActiveBtn = b;
      });

      // Only gently nudge horizontal scroll if the clicked pill is partially clipped at an edge
      if (ensureVisible && pillsEl && newActiveBtn) {
        const pRect = pillsEl.getBoundingClientRect();
        const bRect = newActiveBtn.getBoundingClientRect();
        if (bRect.left < pRect.left) {
          pillsEl.scrollBy({ left: bRect.left - pRect.left - 10, behavior: 'smooth' });
        } else if (bRect.right > pRect.right) {
          pillsEl.scrollBy({ left: bRect.right - pRect.right + 10, behavior: 'smooth' });
        }
      }

      // Sync mobile week dropdown & prev/next buttons in-place
      const mobSel = rootEl.querySelector('#selMobileWeek');
      if (mobSel) mobSel.value = String(clamped);
      const btnPrev = rootEl.querySelector('#btnPrevWeekMobile');
      const btnNext = rootEl.querySelector('#btnNextWeekMobile');
      if (btnPrev) btnPrev.disabled = clamped <= 0;
      if (btnNext) btnNext.disabled = clamped >= schedule.weeks.length - 1;

      // Replace ONLY the table content inside #tlWeekGridHost (always read latest active semester!)
      if (gridHost) {
        const curSem = getActiveSemester() || sem;
        gridHost.innerHTML = renderLogWeekGridHtml(curSem, schedule, schedule.weeks[clamped]);
        bindLogGridEvents(gridHost);
      }
    }

    rootEl.querySelector('#selMobileWeek')?.addEventListener('change', (e) => {
      selectWeekInPlace(Number(e.target.value) || 0, { ensureVisible: true });
    });
    rootEl.querySelector('#btnPrevWeekMobile')?.addEventListener('click', () => {
      if (state.selectedWeekIdx > 0) selectWeekInPlace(state.selectedWeekIdx - 1, { ensureVisible: true });
    });
    rootEl.querySelector('#btnNextWeekMobile')?.addEventListener('click', () => {
      if (state.selectedWeekIdx < schedule.weeks.length - 1) {
        selectWeekInPlace(state.selectedWeekIdx + 1, { ensureVisible: true });
      }
    });

    rootEl.querySelectorAll('[data-pick-week]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectWeekInPlace(Number(btn.dataset.pickWeek) || 0, { ensureVisible: true });
      });
    });

    rootEl.querySelector('#btnOpenScheduleGearModal')?.addEventListener('click', () => {
      openScheduleGearModal(sem, schedule);
    });

    // === SUB-TAB 2: THỰC TẾ ===
    rootEl.querySelector('#selActualScope')?.addEventListener('change', (e) => {
      state.actualScope = e.target.value;
      state.selectedActualKey = '';
      render();
    });

    const btnCopyKhdh = rootEl.querySelector('#btnCopyKhdhToSelected');
    if (btnCopyKhdh) {
      // Keep the focused textarea visually active while clicking the toolbar button
      btnCopyKhdh.addEventListener('mousedown', (e) => e.preventDefault());
      btnCopyKhdh.addEventListener('click', async () => {
        const selectedKey = state.selectedActualKey;
        if (!selectedKey) {
          showToast('Vui lòng chọn 1 ô trống ở cột Nội dung thực tế trước.', 'info');
          return;
        }
        const scope = state.actualScope || 'grade:10';
        const planObj = ensureActualPlanObj(sem, scope);
        const activeTa = rootEl.querySelector(`textarea[data-act-key="${selectedKey}"]`);
        const liveVal = activeTa ? activeTa.value.trim() : (planObj.cells[selectedKey]?.text || '').trim();
        if (liveVal) {
          showToast('Ô đang chọn đã có nội dung (chỉ áp dụng cho ô trống).', 'info');
          return;
        }

        const weekRows = buildActualWeekRows(sem, schedule, scope);
        let matchedSlot = null;
        for (const wr of weekRows) {
          const hit = wr.slots.find((s) => s.cellKey === selectedKey);
          if (hit) {
            matchedSlot = hit;
            break;
          }
        }
        if (!matchedSlot || !matchedSlot.lessonName) {
          showToast('Ô bên trái chưa có nội dung KHDH để sao chép.', 'info');
          return;
        }

        const prev = planObj.cells[selectedKey] || { text: '', highlight: false, span: 1 };
        planObj.cells[selectedKey] = { ...prev, text: matchedSlot.lessonName };
        await persist('Đã sao chép nội dung từ KHDH!');
        const refocus = rootEl.querySelector(`textarea[data-act-key="${selectedKey}"]`);
        if (refocus) refocus.focus();
      });
    }

    rootEl.querySelector('#btnExportActualCsv')?.addEventListener('click', () => {
      exportActualCsv(sem, schedule);
    });
    rootEl.querySelector('#btnPrintActual')?.addEventListener('click', () => {
      window.print();
    });

    rootEl.querySelectorAll('[data-act-key]').forEach((ta) => {
      const autoResize = () => {
        ta.style.height = 'auto';
        ta.style.height = `${Math.max(30, ta.scrollHeight)}px`;
      };
      autoResize();
      const markSelected = () => {
        state.selectedActualKey = ta.dataset.actKey;
        rootEl.querySelectorAll('.tl-act-edit-col.is-selected').forEach((td) => td.classList.remove('is-selected'));
        ta.closest('.tl-act-edit-col')?.classList.add('is-selected');
      };
      ta.addEventListener('focus', markSelected);
      ta.addEventListener('click', markSelected);
      ta.addEventListener('input', autoResize);
      ta.addEventListener('change', async () => {
        const key = ta.dataset.actKey;
        const planObj = ensureActualPlanObj(sem, state.actualScope || 'grade:10');
        const prev = planObj.cells[key] || { text: '', highlight: false, span: 1 };
        planObj.cells[key] = { ...prev, text: ta.value };
        try {
          const res = await api.saveTeachingLog(state.data);
          if (res?.teachingLog) state.data = res.teachingLog;
        } catch (err) {
          showToast(err.message || 'Lỗi lưu nội dung thực tế.', 'error');
        }
      });
    });

    rootEl.querySelectorAll('[data-act-hl]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.actHl;
        const planObj = ensureActualPlanObj(sem, state.actualScope || 'grade:10');
        const prev = planObj.cells[key] || { text: '', highlight: false, span: 1 };
        planObj.cells[key] = { ...prev, highlight: !prev.highlight };
        await persist();
      });
    });

    rootEl.querySelectorAll('[data-act-merge]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.actMerge;
        const [wIdx, sIdx] = key.split(':').map(Number);
        const scope = state.actualScope || 'grade:10';
        const planObj = ensureActualPlanObj(sem, scope);
        const weekRows = buildActualWeekRows(sem, schedule, scope);
        const slotsPerWeek = weekRows[wIdx]?.slots?.length || 4;
        const prev = planObj.cells[key] || { text: '', highlight: false, span: 1 };
        const curSpan = Math.max(1, Number(prev.span) || 1);
        const nextRowIdx = sIdx + curSpan;
        if (nextRowIdx >= slotsPerWeek) return;
        const nextKey = `${wIdx}:${nextRowIdx}`;
        const nextCell = planObj.cells[nextKey];
        const nextSpan = Math.max(1, Number(nextCell?.span) || 1);
        const mergedText = [prev.text?.trim(), nextCell?.text?.trim()].filter(Boolean).join('\n');
        planObj.cells[key] = {
          text: mergedText,
          highlight: Boolean(prev.highlight || nextCell?.highlight),
          span: Math.min(slotsPerWeek - sIdx, curSpan + nextSpan),
        };
        delete planObj.cells[nextKey];
        await persist('Đã gộp ô.');
      });
    });

    rootEl.querySelectorAll('[data-act-unmerge]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.actUnmerge;
        const planObj = ensureActualPlanObj(sem, state.actualScope || 'grade:10');
        const prev = planObj.cells[key] || { text: '', highlight: false, span: 1 };
        planObj.cells[key] = { ...prev, span: 1 };
        await persist('Đã tách ô.');
      });
    });

    // === SUB-TAB 3: SỔ ĐỒ DÙNG ===
    rootEl.querySelector('#selEquipMonth')?.addEventListener('change', (e) => {
      state.equipMonthFilter = e.target.value;
      render();
    });
    rootEl.querySelector('#selEquipClass')?.addEventListener('change', (e) => {
      state.equipClassFilter = e.target.value;
      render();
    });
    rootEl.querySelector('#btnExportEquipCsv')?.addEventListener('click', () => {
      exportEquipmentCsv(sem, monthlyEquip);
    });
    rootEl.querySelector('#btnPrintEquip')?.addEventListener('click', () => {
      window.print();
    });

    // === SUB-TAB 4: TKB & CẤU HÌNH ===
    rootEl.querySelector('#btnSaveSemCfg')?.addEventListener('click', async () => {
      const name = rootEl.querySelector('#cfgSemName').value.trim();
      if (!name) {
        showToast('Tên học kì không được để trống.', 'error');
        return;
      }
      let startIso = sem.startDate;
      try {
        startIso = parseVnDateOnlyToIso(rootEl.querySelector('#cfgSemStartDate').value, 'Thứ 2 tuần đầu');
      } catch (err) {
        showToast(err.message, 'error');
        return;
      }
      const nextSession = rootEl.querySelector('#cfgSemSession').value === 'chieu' ? 'chieu' : 'sang';
      sem.name = name;
      sem.termNumber = Number(rootEl.querySelector('#cfgSemTerm').value) === 2 ? 2 : 1;
      // Migrate all TKB versions to the chosen session so switching Sáng <-> Chiều keeps TKB intact
      if (sem.session !== nextSession) {
        ensureTimetables(sem);
        (sem.timetables || []).forEach((t) => {
          (t.slots || []).forEach((s) => (s.session = nextSession));
        });
        (sem.timetable || []).forEach((s) => (s.session = nextSession));
      }
      sem.session = nextSession;
      sem.startWeek = Math.max(1, Number(rootEl.querySelector('#cfgSemStartWeek').value) || 1);
      sem.startDate = toIsoDateLocal(snapToMonday(startIso));
      sem.totalWeeks = Math.max(1, Math.min(25, Number(rootEl.querySelector('#cfgSemWeeks').value) || 18));
      ensureTimetables(sem);
      await persist('Đã lưu cấu hình học kì!');
    });

    rootEl.querySelector('#btnAddTkbVersion')?.addEventListener('click', () => openAddTkbModal(sem));
    rootEl.querySelector('#btnAddClass')?.addEventListener('click', () => openAddClassModal(sem));

    rootEl.querySelectorAll('[data-pick-tkb]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeTkbId = btn.dataset.pickTkb;
        render();
      });
    });

    rootEl.querySelector('#selActiveTkbFromWeek')?.addEventListener('change', async (e) => {
      ensureTimetables(sem);
      const target = sem.timetables.find((t) => t.id === state.activeTkbId);
      if (!target) return;
      target.fromWeek = Number(e.target.value) || target.fromWeek;
      ensureTimetables(sem);
      await persist(`Đã cập nhật thời gian áp dụng cho ${target.name}!`);
    });

    rootEl.querySelector('#btnDeleteTkbVersion')?.addEventListener('click', () => {
      ensureTimetables(sem);
      if (sem.timetables.length <= 1) return;
      const target = sem.timetables.find((t) => t.id === state.activeTkbId);
      if (!target) return;
      openConfirmDeleteModal({
        title: 'Xác nhận xóa Thời khóa biểu',
        messageHtml: `Bạn có chắc chắn muốn xóa <strong>${escapeHtml(target.name)}</strong>? Thời gian áp dụng của các TKB còn lại sẽ tự động điều chỉnh.`,
        confirmText: 'Xóa TKB',
        onConfirm: async () => {
          sem.timetables = sem.timetables.filter((t) => t.id !== target.id);
          ensureTimetables(sem);
          state.activeTkbId = sem.timetables[0]?.id || '';
          sem.timetable = sem.timetables[0]?.slots || [];
          await persist(`Đã xóa ${target.name}.`);
        },
      });
    });

    rootEl.querySelectorAll('[data-brush-cls]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-del-cls]')) return;
        state.tkbBrushClassId = el.dataset.brushCls;
        render();
      });
    });

    rootEl.querySelectorAll('[data-del-cls]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cid = btn.dataset.delCls;
        const cls = (sem.classes || []).find((c) => c.id === cid);
        if (!cls) return;
        openConfirmDeleteModal({
          title: 'Xác nhận xóa lớp',
          messageHtml: `Bạn có chắc chắn muốn xóa lớp <strong>${escapeHtml(cls.name)}</strong> (Khối ${escapeHtml(cls.grade)})? Các tiết đã xếp của lớp này trong TKB sẽ được gỡ bỏ.`,
          confirmText: 'Xóa lớp',
          onConfirm: async () => {
            sem.classes = (sem.classes || []).filter((c) => c.id !== cid);
            ensureTimetables(sem);
            (sem.timetables || []).forEach((t) => {
              t.slots = (t.slots || []).filter((s) => s.classId !== cid);
            });
            sem.timetable = sem.timetables[0]?.slots || [];
            if (state.tkbBrushClassId === cid) state.tkbBrushClassId = sem.classes[0]?.id || '';
            await persist(`Đã xóa lớp ${cls.name}.`);
          },
        });
      });
    });

    rootEl.querySelectorAll('[data-tkb-dow]').forEach((td) => {
      td.addEventListener('click', async () => {
        const dow = Number(td.dataset.tkbDow);
        const period = Number(td.dataset.tkbPeriod);
        const semSession = sem.session === 'chieu' ? 'chieu' : 'sang';
        ensureTimetables(sem);
        const activeTkb = sem.timetables.find((t) => t.id === state.activeTkbId) || sem.timetables[0];
        if (!activeTkb) return;
        activeTkb.slots = activeTkb.slots || [];
        const existingIdx = activeTkb.slots.findIndex(
          (s) => s.dayOfWeek === dow && (!s.session || s.session === semSession) && s.period === period
        );
        const brush = state.tkbBrushClassId;
        if (!brush) {
          if (existingIdx >= 0) activeTkb.slots.splice(existingIdx, 1);
        } else if (existingIdx >= 0 && activeTkb.slots[existingIdx].classId === brush) {
          activeTkb.slots.splice(existingIdx, 1);
        } else if (existingIdx >= 0) {
          activeTkb.slots[existingIdx].classId = brush;
          activeTkb.slots[existingIdx].session = semSession;
          delete activeTkb.slots[existingIdx].isSpecialTopic;
        } else {
          activeTkb.slots.push({
            dayOfWeek: dow,
            session: semSession,
            period,
            classId: brush,
          });
        }
        sem.timetable = sem.timetables[0]?.slots || [];
        await persist();
      });
    });

    // === SUB-TAB 5: KẾ HOẠCH DẠY HỌC ===
    rootEl.querySelectorAll('[data-plan-grade]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.planGrade = btn.dataset.planGrade;
        render();
      });
    });
    rootEl.querySelectorAll('[data-plan-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.planMode = btn.dataset.planMode === 'special' ? 'special' : 'regular';
        render();
      });
    });
    rootEl.querySelector('#selPlanTerm')?.addEventListener('change', (e) => {
      state.planTerm = Number(e.target.value) === 2 ? 2 : 1;
      render();
    });
    rootEl.querySelector('#btnAddPlanRow')?.addEventListener('click', () => openPlanRowModal(null));
    rootEl.querySelectorAll('[data-edit-plan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ppct = Number(btn.dataset.editPlan);
        const isSpecial = state.planMode === 'special';
        const found = (state.data.curriculumPlans?.[state.planGrade] || []).find(
          (x) =>
            Number(x.ppct) === ppct &&
            Number(x.term || 1) === state.planTerm &&
            Boolean(x.isSpecialTopic) === isSpecial
        );
        if (found) openPlanRowModal(found);
      });
    });
    rootEl.querySelectorAll('[data-del-plan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ppct = Number(btn.dataset.delPlan);
        const isSpecial = state.planMode === 'special';
        const label = isSpecial ? `CĐ${ppct}` : `Tiết ${ppct}`;
        openConfirmDeleteModal({
          title: 'Xác nhận xóa tiết học',
          messageHtml: `Bạn có chắc chắn muốn xóa <strong>${escapeHtml(label)}</strong> khỏi Kế hoạch dạy học?`,
          confirmText: 'Xóa tiết',
          onConfirm: async () => {
            state.data.curriculumPlans[state.planGrade] = (state.data.curriculumPlans[state.planGrade] || []).filter(
              (x) =>
                !(
                  Number(x.ppct) === ppct &&
                  Number(x.term || 1) === state.planTerm &&
                  Boolean(x.isSpecialTopic) === isSpecial
                )
            );
            await persist(`Đã xóa ${label}.`);
          },
        });
      });
    });
  }

  return { init };
}
