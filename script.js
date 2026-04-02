// Calendar Todos (vanilla JS)
// - Data is saved & synced with Firebase Realtime Database
// - Todos are stored per date (YYYY-MM-DD)

const CATEGORIES = ["약속", "생일", "할일"];
const REPEAT_OPTIONS = ["none", "daily", "weekly", "yearly"];

// Your Firebase config (provided by user)
const firebaseConfig = {
  apiKey: "AIzaSyD0bY4Q1BiLOSwuTsLbrVc2qCbOUp5B2yg",
  authDomain: "todo1-57a56.firebaseapp.com",
  databaseURL: "https://todo1-57a56-default-rtdb.firebaseio.com",
  projectId: "todo1-57a56",
  storageBucket: "todo1-57a56.firebasestorage.app",
  messagingSenderId: "546760698752",
  appId: "1:546760698752:web:874026b5fe78fb19e66f65",
  measurementId: "G-4X2C74FDEQ",
};

// Firebase init (compat SDK for simplicity)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// NOTE:
// This writes to a shared public path. If you want user accounts later,
// we can add Firebase Auth and store per-user data.
const TODOS_ROOT = "todosByDate";
const DELETE_CONFIRM_SKIP_KEY = "todoDeleteConfirmSkipUntil";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

function formatLong(date) {
  return date.toLocaleDateString("ko-KR", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMonthLabel(date) {
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
}

function makeId() {
  // Good enough for a beginner app
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatHHMM(date) {
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function weatherCodeToEmoji(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return "☁️";
  if (c === 0) return "☀️";
  if (c === 1 || c === 2) return "🌤️";
  if (c === 3) return "☁️";
  if (c === 45 || c === 48) return "🌫️";
  if (c === 51 || c === 53 || c === 55) return "🌦️";
  if (c === 56 || c === 57 || c === 61 || c === 63 || c === 65) return "🌧️";
  if (c === 66 || c === 67 || c === 71 || c === 73 || c === 75 || c === 77 || c === 85 || c === 86) return "🌨️";
  if (c === 80 || c === 81 || c === 82) return "🌦️";
  if (c === 95 || c === 96 || c === 99) return "⛈️";
  return "☁️";
}

/** 서울 시간 기준 1시간 슬롯(하루 최대 24회 갱신) — 슬롯 키로 캐시 */
const WEATHER_STORAGE_KEY = "todoSeoulWeatherSlotV2";

function getSeoulDateTimeParts(date = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = f.formatToParts(date);
  const m = {};
  for (const p of parts) {
    if (p.type !== "literal") m[p.type] = p.value;
  }
  return {
    year: Number(m.year),
    month: Number(m.month),
    day: Number(m.day),
    hour: Number(m.hour),
    minute: Number(m.minute),
    second: Number(m.second),
  };
}

function seoulHourSlotKey(date = new Date()) {
  const p = getSeoulDateTimeParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}-${pad2(p.hour)}`;
}

function getTodayISOSeoul() {
  const p = getSeoulDateTimeParts();
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** 다음 서울 정각까지 남은 ms (최소 1초) */
function msUntilNextSeoulHour() {
  const p = getSeoulDateTimeParts();
  const minutesInHour = p.minute + p.second / 60;
  const ms = (60 - minutesInHour) * 60 * 1000;
  return Math.max(1000, Math.ceil(ms));
}

function readWeatherCache() {
  try {
    const raw = localStorage.getItem(WEATHER_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.slot !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

function writeWeatherCache(payload) {
  try {
    localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

const els = {
  yearLabel: document.getElementById("yearLabel"),
  monthBtn: document.getElementById("monthBtn"),
  prevMonthBtn: document.getElementById("prevMonthBtn"),
  nextMonthBtn: document.getElementById("nextMonthBtn"),
  yearPicker: document.getElementById("yearPicker"),
  yearPickerBackdrop: document.getElementById("yearPickerBackdrop"),
  yearInput: document.getElementById("yearInput"),
  yearMinus: document.getElementById("yearMinus"),
  yearPlus: document.getElementById("yearPlus"),
  yearApplyBtn: document.getElementById("yearApplyBtn"),
  monthPicker: document.getElementById("monthPicker"),
  monthPickerBackdrop: document.getElementById("monthPickerBackdrop"),
  monthPickerGrid: document.getElementById("monthPickerGrid"),
  todayPill: document.getElementById("todayPill"),
  todayWeatherIcon: document.getElementById("todayWeatherIcon"),
  todayTempText: document.getElementById("todayTempText"),
  todayMdText: document.getElementById("todayMdText"),
  todayTimeText: document.getElementById("todayTimeText"),
  calendar: document.getElementById("calendar"),
  todoHint: document.getElementById("todoHint"),
  todoForm: document.getElementById("todoForm"),
  todoText: document.getElementById("todoText"),
  todoCategory: document.getElementById("todoCategory"),
  todoRepeat: document.getElementById("todoRepeat"),
  addBtn: document.getElementById("addBtn"),
  toast: document.getElementById("toast"),
  todoList: document.getElementById("todoList"),
  filterDateSeg: document.getElementById("filterDateSeg"),
  filterDateMonthBtn: document.getElementById("filterDateMonthBtn"),
  filterDateYearBtn: document.getElementById("filterDateYearBtn"),
  filterCatSeg: document.getElementById("filterCatSeg"),
  resetAllBtn: document.getElementById("resetAllBtn"),
  clearCompletedBtn: document.getElementById("clearCompletedBtn"),
  deleteConfirm: document.getElementById("deleteConfirm"),
  deleteConfirmBackdrop: document.getElementById("deleteConfirmBackdrop"),
  deleteConfirmNo: document.getElementById("deleteConfirmNo"),
  deleteConfirmDelete: document.getElementById("deleteConfirmDelete"),
  deleteConfirmSkip: document.getElementById("deleteConfirmSkip"),
  deleteConfirmSkipWrap: document.getElementById("deleteConfirmSkipWrap"),
  deleteRepeatConfirm: document.getElementById("deleteRepeatConfirm"),
  deleteRepeatBackdrop: document.getElementById("deleteRepeatBackdrop"),
  deleteRepeatNo: document.getElementById("deleteRepeatNo"),
  deleteRepeatDelete: document.getElementById("deleteRepeatDelete"),
  deleteRepeatAll: document.getElementById("deleteRepeatAll"),
  resetAllConfirm: document.getElementById("resetAllConfirm"),
  resetAllBackdrop: document.getElementById("resetAllBackdrop"),
  resetAllNo: document.getElementById("resetAllNo"),
  resetAllYes: document.getElementById("resetAllYes"),
  clearCompletedConfirm: document.getElementById("clearCompletedConfirm"),
  clearCompletedBackdrop: document.getElementById("clearCompletedBackdrop"),
  clearCompletedNo: document.getElementById("clearCompletedNo"),
  clearCompletedYes: document.getElementById("clearCompletedYes"),
};

function applyWeatherToUI(emoji, tempC) {
  if (els.todayWeatherIcon) els.todayWeatherIcon.textContent = emoji || "☁️";
  if (els.todayTempText) {
    els.todayTempText.textContent = Number.isFinite(tempC) ? `${Math.round(tempC)}°` : "--°";
  }
  if (els.todayPill && Number.isFinite(tempC)) {
    els.todayPill.title = `서울: ${emoji} ${Math.round(tempC)}°C`;
  } else if (els.todayPill) {
    els.todayPill.title = "서울 날씨";
  }
}

async function fetchSeoulWeatherForSlot(slotKey) {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current=weather_code,temperature_2m&timezone=Asia%2FSeoul";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  const code = data?.current?.weather_code;
  const temp = data?.current?.temperature_2m;
  const emoji = weatherCodeToEmoji(code);
  writeWeatherCache({ slot: slotKey, emoji, tempC: temp });
  applyWeatherToUI(emoji, temp);
}

/** 서울 시간 현재 '시' 슬롯과 캐시가 같으면 네트워크 없음. 다르면 1회 요청 */
function syncSeoulWeatherOnLoad() {
  const slot = seoulHourSlotKey();
  const cached = readWeatherCache();
  if (cached && cached.slot === slot && cached.emoji != null) {
    applyWeatherToUI(cached.emoji, cached.tempC);
    return;
  }
  void fetchSeoulWeatherForSlot(slot).catch(() => {
    if (cached && cached.emoji != null) applyWeatherToUI(cached.emoji, cached.tempC);
  });
}

let seoulWeatherTimer = null;
/** 서울 기준 매 정각마다 1회 갱신 → 하루 최대 24번 */
function scheduleNextSeoulHourWeather() {
  window.clearTimeout(seoulWeatherTimer);
  seoulWeatherTimer = window.setTimeout(() => {
    const slot = seoulHourSlotKey();
    void fetchSeoulWeatherForSlot(slot).catch(() => {});
    scheduleNextSeoulHourWeather();
  }, msUntilNextSeoulHour());
}

function updateTodayPillClockAndDate() {
  const p = getSeoulDateTimeParts();
  if (els.todayTimeText) els.todayTimeText.textContent = `${pad2(p.hour)}:${pad2(p.minute)}`;
  if (els.todayMdText) els.todayMdText.textContent = `${p.month}월 ${p.day}일`;
}

const app = {
  state: { todosByDate: {} }, // { [dateISO]: { [todoId]: todo } }
  selectedDateISO: null,
  /** "all" | CATEGORIES */
  activeCategory: "all",
  /** 오늘 필터: 켜면 현재 연·월·선택일을 서울 기준 오늘로 맞춤 */
  todayScopeActive: true,
  /** 목록: today | month | year | day */
  listMode: "today",
  listMonthYear: 0,
  listMonth: 0,
  listYear: getSeoulDateTimeParts().year,
  todayISO: getTodayISOSeoul(),
  monthDate: new Date(),
  /** 방금 추가한 할 일 — 달력 미리보기 NEW 표시용 `dateISO::todoId` */
  newTodoIds: new Set(),
  /** 일반 삭제 확인 `{ storageDateISO, todoId }` */
  pendingDelete: null,
  /** 반복 할 일 삭제 확인 `{ storageDateISO, todoId, occurrenceDateISO }` */
  pendingRepeatDelete: null,
};

(function seedListMonthFromSeoul() {
  const p = getSeoulDateTimeParts();
  app.listMonthYear = p.year;
  app.listMonth = p.month;
  app.listYear = p.year;
})();

function getDeleteConfirmSkipUntil() {
  try {
    const raw = localStorage.getItem(DELETE_CONFIRM_SKIP_KEY);
    if (!raw) return 0;
    const until = Number(raw);
    return Number.isFinite(until) ? until : 0;
  } catch {
    return 0;
  }
}

function isDeleteConfirmSkipped() {
  return Date.now() < getDeleteConfirmSkipUntil();
}

function setDeleteConfirmSkip7Days() {
  try {
    localStorage.setItem(DELETE_CONFIRM_SKIP_KEY, String(Date.now() + 7 * 86400000));
  } catch {
    // ignore
  }
}

/** 현재 달력에 보이는 연·월 `YYYY-MM` (로컬 monthDate 기준) */
function viewedYearMonth() {
  const y = app.monthDate.getFullYear();
  return `${y}-${pad2(app.monthDate.getMonth() + 1)}`;
}

/** 일정이 표시되는 날짜 기준 연·월 `YYYY-MM` (달력 NEW는 ‘보고 있는 달’과 맞춤) */
function occurrenceYearMonth(t) {
  const iso = t.displayDateISO || t.storageDateISO;
  return typeof iso === "string" && iso.length >= 7 ? iso.slice(0, 7) : "";
}

function shouldShowNewBadge(t) {
  if (!t.createdAt) return false;
  if (!app.newTodoIds.has(`${t.storageDateISO}::${t.id}`)) return false;
  return occurrenceYearMonth(t) === viewedYearMonth();
}

function clearNewBadgesForDate(dateISO) {
  const onDay = getTodosForDate(dateISO);
  const keysOnDay = new Set(onDay.map((x) => `${x.storageDateISO}::${x.id}`));
  for (const key of [...app.newTodoIds]) {
    if (keysOnDay.has(key)) app.newTodoIds.delete(key);
  }
}

let toastTimer = null;
function showToast(message) {
  const el = els.toast;
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
  el.classList.add("toast--show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.remove("toast--show");
    el.hidden = true;
  }, 2400);
}

function toastMessageForCategory(category) {
  if (category === "약속") return "약속 일정이 추가되었습니다.";
  if (category === "생일") return "생일 일정이 추가되었습니다.";
  return "할일이 추가되었습니다.";
}

function openDeleteConfirm() {
  if (els.deleteConfirm) els.deleteConfirm.hidden = false;
  if (els.deleteConfirmSkip) els.deleteConfirmSkip.checked = false;
  if (els.deleteConfirmSkipWrap) els.deleteConfirmSkipWrap.hidden = false;
}

function closeDeleteConfirm() {
  if (els.deleteConfirm) els.deleteConfirm.hidden = true;
  app.pendingDelete = null;
}

function openDeleteRepeatConfirm() {
  if (els.deleteRepeatConfirm) els.deleteRepeatConfirm.hidden = false;
  if (els.deleteRepeatAll) els.deleteRepeatAll.checked = false;
}

function closeDeleteRepeatConfirm() {
  if (els.deleteRepeatConfirm) els.deleteRepeatConfirm.hidden = true;
  app.pendingRepeatDelete = null;
}

function requestDelete(todo) {
  const r = REPEAT_OPTIONS.includes(todo.repeat) ? todo.repeat : "none";
  const occ = todo.displayDateISO || todo.storageDateISO;

  if (r !== "none") {
    app.pendingRepeatDelete = {
      storageDateISO: todo.storageDateISO,
      todoId: todo.id,
      occurrenceDateISO: occ,
    };
    openDeleteRepeatConfirm();
    return;
  }

  if (isDeleteConfirmSkipped()) {
    void deleteTodo(todo.storageDateISO, todo.id);
    return;
  }

  app.pendingDelete = { storageDateISO: todo.storageDateISO, todoId: todo.id };
  openDeleteConfirm();
}

function ensureDateSelected() {
  if (app.selectedDateISO) return;

  const p = getSeoulDateTimeParts();
  const md = app.monthDate;
  if (md.getFullYear() === p.year && md.getMonth() === p.month - 1) {
    app.selectedDateISO = getTodayISOSeoul();
  } else {
    app.selectedDateISO = toISODate(new Date(app.monthDate.getFullYear(), app.monthDate.getMonth(), 1));
  }
}

/** 로컬 자정 기준 YYYY-MM-DD 간 일수 (타깃이 시작 이전이면 음수) */
function daysBetweenISO(startISO, targetISO) {
  const [y0, m0, d0] = startISO.split("-").map(Number);
  const [y1, m1, d1] = targetISO.split("-").map(Number);
  const t0 = Date.UTC(y0, m0 - 1, d0);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  return Math.round((t1 - t0) / 86400000);
}

/**
 * 반복 할 일: 시작일부터 최대 365일(시작일 포함) 안에서만 캘린더에 표시
 * - 매일: 그 사이 모든 날
 * - 매주: 시작일로부터 7일 단위
 * - 매년: 같은 월·일 (시작일 포함, 윤년 2/29 등은 해당 날짜가 있을 때만)
 */
function matchesRecurrence(startISO, targetISO, repeat) {
  const diff = daysBetweenISO(startISO, targetISO);
  if (diff < 0 || diff > 365) return false;

  if (repeat === "daily") return true;

  if (repeat === "weekly") return diff % 7 === 0;

  if (repeat === "yearly") {
    const [ys, ms, ds] = startISO.split("-").map(Number);
    const [yt, mt, dt] = targetISO.split("-").map(Number);
    return ms === mt && ds === dt;
  }

  return false;
}

/** 반복 일정: 날짜별 완료(`completedByDate`), 비반복: `completed` */
function isCompletedForView(raw, displayDateISO, repeat, storageDateISO) {
  const r = REPEAT_OPTIONS.includes(repeat) ? repeat : "none";
  if (r === "none") {
    return !!raw?.completed;
  }
  const by = raw?.completedByDate;
  if (by && typeof by === "object" && Object.prototype.hasOwnProperty.call(by, displayDateISO)) {
    return !!by[displayDateISO];
  }
  if (displayDateISO === storageDateISO) {
    return !!raw?.completed;
  }
  return false;
}

function normalizeTodoView(id, raw, storageDateISO, isVirtual, displayDateISO) {
  const repeat = REPEAT_OPTIONS.includes(raw?.repeat) ? raw.repeat : "none";
  const disp = displayDateISO || storageDateISO;
  return {
    id,
    text: raw?.text ?? "",
    completed: isCompletedForView(raw, disp, repeat, storageDateISO),
    category: CATEGORIES.includes(raw?.category) ? raw.category : "할일",
    repeat,
    createdAt: Number.isFinite(raw?.createdAt) ? raw.createdAt : 0,
    storageDateISO,
    isVirtual: !!isVirtual,
    /** 이 줄이 표시되는 달력 날짜 (반복 가상분 삭제 시 사용) */
    displayDateISO: disp,
  };
}

/** 해당 날짜에 보이는 할 일: 저장분 + 다른 날에 저장된 반복(최대 1년) 전개분 */
function getTodosForDate(dateISO) {
  const byDate = app.state.todosByDate;
  const out = [];
  const seen = new Set();

  const pushOne = (id, raw, storageDateISO, isVirtual, displayDateISO) => {
    const key = `${storageDateISO}::${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(normalizeTodoView(id, raw, storageDateISO, isVirtual, displayDateISO));
  };

  const direct = byDate[dateISO];
  if (direct && typeof direct === "object") {
    for (const [id, raw] of Object.entries(direct)) {
      const sk = raw?.skipDates;
      if (sk && typeof sk === "object" && sk[dateISO]) continue;
      pushOne(id, raw, dateISO, false, dateISO);
    }
  }

  for (const startISO of Object.keys(byDate)) {
    if (startISO === dateISO) continue;

    const bucket = byDate[startISO];
    if (!bucket || typeof bucket !== "object") continue;

    for (const [id, raw] of Object.entries(bucket)) {
      const repeat = REPEAT_OPTIONS.includes(raw?.repeat) ? raw.repeat : "none";
      if (repeat === "none") continue;
      if (!matchesRecurrence(startISO, dateISO, repeat)) continue;
      const skipDates = raw?.skipDates;
      if (skipDates && typeof skipDates === "object" && skipDates[dateISO]) continue;
      pushOne(id, raw, startISO, true, dateISO);
    }
  }

  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return out;
}

/** 한 달(연·월) 안에 표시되는 모든 할 일(날짜순, 같은 줄은 displayDate 기준 구분) */
function getTodosForMonth(year, monthIndex) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const seen = new Set();
  const out = [];
  for (let d = 1; d <= lastDay; d++) {
    const dateISO = `${year}-${pad2(monthIndex + 1)}-${pad2(d)}`;
    const dayTodos = getTodosForDate(dateISO);
    for (const t of dayTodos) {
      const key = `${t.storageDateISO}::${t.id}::${t.displayDateISO}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  out.sort((a, b) => {
    const da = a.displayDateISO || a.storageDateISO;
    const db = b.displayDateISO || b.storageDateISO;
    if (da !== db) return da.localeCompare(db);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  return out;
}

/** 서울 기준 연도 전체(1~12월 합산, 중복 제거) */
function getTodosForYear(year) {
  const seen = new Set();
  const out = [];
  for (let mi = 0; mi < 12; mi++) {
    const monthTodos = getTodosForMonth(year, mi);
    for (const t of monthTodos) {
      const key = `${t.storageDateISO}::${t.id}::${t.displayDateISO}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  out.sort((a, b) => {
    const da = a.displayDateISO || a.storageDateISO;
    const db = b.displayDateISO || b.storageDateISO;
    if (da !== db) return da.localeCompare(db);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  return out;
}

function getListTodosAndLabel() {
  if (app.listMode === "today") {
    const p = getSeoulDateTimeParts();
    const iso = getTodayISOSeoul();
    return {
      allTodos: getTodosForDate(iso),
      hintMode: "today",
      todayParts: p,
    };
  }
  if (app.listMode === "month") {
    return {
      allTodos: getTodosForMonth(app.listMonthYear, app.listMonth - 1),
      hintMode: "month",
      todayParts: null,
    };
  }
  if (app.listMode === "year") {
    const y = app.listYear || getSeoulDateTimeParts().year;
    return {
      allTodos: getTodosForYear(y),
      hintMode: "year",
      todayParts: null,
    };
  }
  if (app.listMode === "day" && app.selectedDateISO) {
    return {
      allTodos: getTodosForDate(app.selectedDateISO),
      hintMode: "day",
      todayParts: null,
    };
  }
  return { allTodos: [], hintMode: "none", todayParts: null };
}

function ensureSelectedForAddForm() {
  if (app.selectedDateISO) return;
  if (app.listMode === "today") {
    app.selectedDateISO = getTodayISOSeoul();
    return;
  }
  if (app.listMode === "month") {
    app.selectedDateISO = `${app.listMonthYear}-${pad2(app.listMonth)}-01`;
    return;
  }
  if (app.listMode === "year") {
    const p = getSeoulDateTimeParts();
    const y = app.listYear || p.year;
    app.selectedDateISO = y === p.year ? getTodayISOSeoul() : `${y}-01-01`;
    return;
  }
  ensureDateSelected();
}

function deleteTodo(dateISO, todoId) {
  return db.ref(`${TODOS_ROOT}/${dateISO}/${todoId}`).remove();
}

/** 반복 일정 중 특정 날짜만 목록에서 제외 (원본 할 일은 유지) */
function skipOccurrence(storageDateISO, todoId, occurrenceDateISO) {
  const ref = db.ref(`${TODOS_ROOT}/${storageDateISO}/${todoId}`);
  return ref.transaction((current) => {
    if (!current) return current;
    const next = { ...current };
    next.skipDates = { ...(current.skipDates && typeof current.skipDates === "object" ? current.skipDates : {}), [occurrenceDateISO]: true };
    return next;
  });
}

function resetAllTodos() {
  return db.ref(TODOS_ROOT).remove();
}

function deleteAllCompletedTodos() {
  const updates = {};
  const byDate = app.state.todosByDate;
  for (const [dateISO, bucket] of Object.entries(byDate)) {
    if (!bucket || typeof bucket !== "object") continue;
    for (const [id, raw] of Object.entries(bucket)) {
      const repeat = REPEAT_OPTIONS.includes(raw?.repeat) ? raw.repeat : "none";
      if (repeat === "none") {
        if (raw?.completed) updates[`${TODOS_ROOT}/${dateISO}/${id}`] = null;
        continue;
      }
      const by = raw?.completedByDate;
      const hasPerDay = by && typeof by === "object" && Object.keys(by).length > 0;
      if (hasPerDay) {
        for (const k of Object.keys(by)) {
          if (by[k]) {
            updates[`${TODOS_ROOT}/${dateISO}/${id}/completedByDate/${k}`] = null;
          }
        }
        if (raw?.completed) updates[`${TODOS_ROOT}/${dateISO}/${id}/completed`] = false;
      } else if (raw?.completed) {
        updates[`${TODOS_ROOT}/${dateISO}/${id}`] = null;
      }
    }
  }
  const paths = Object.keys(updates);
  if (paths.length === 0) return Promise.resolve();
  return db.ref().update(updates);
}

function syncMonthDateToSeoulMonth() {
  const p = getSeoulDateTimeParts();
  app.monthDate = new Date(p.year, p.month - 1, 1);
  app.listYear = p.year;
}

function applyTodayScope() {
  const p = getSeoulDateTimeParts();
  app.monthDate = new Date(p.year, p.month - 1, 1);
  app.selectedDateISO = getTodayISOSeoul();
  app.todayScopeActive = true;
  app.listMode = "today";
  app.listMonthYear = p.year;
  app.listMonth = p.month;
  app.listYear = p.year;
  renderAll();
}

function applyMonthListScope() {
  const y = app.monthDate.getFullYear();
  const m = app.monthDate.getMonth() + 1;
  app.listMode = "month";
  app.listMonthYear = y;
  app.listMonth = m;
  app.listYear = y;
  app.selectedDateISO = `${y}-${pad2(m)}-01`;
  app.todayScopeActive = false;
  renderAll();
}

function applyYearListScope() {
  const y = app.monthDate.getFullYear();
  const m = app.monthDate.getMonth() + 1;
  app.listMode = "year";
  app.listYear = y;
  app.listMonthYear = y;
  app.listMonth = m;
  const p = getSeoulDateTimeParts();
  app.selectedDateISO = y === p.year ? getTodayISOSeoul() : `${y}-01-01`;
  app.todayScopeActive = false;
  renderAll();
}

function toggleTodoCompleted(todo) {
  const { storageDateISO, id, displayDateISO, repeat } = todo;
  const r = REPEAT_OPTIONS.includes(repeat) ? repeat : "none";
  const ref = db.ref(`${TODOS_ROOT}/${storageDateISO}/${id}`);
  const occ = displayDateISO || storageDateISO;

  if (r === "none") {
    return ref.transaction((current) => {
      if (!current) return current;
      return { ...current, completed: !current.completed };
    });
  }

  return ref.transaction((current) => {
    if (!current) return current;
    const next = { ...current };
    const prev = isCompletedForView(current, occ, r, storageDateISO);
    const by = { ...(current.completedByDate && typeof current.completedByDate === "object" ? current.completedByDate : {}) };
    by[occ] = !prev;
    next.completedByDate = by;
    next.completed = false;
    return next;
  });
}

function addTodo(dateISO, text, category, repeat) {
  const r = REPEAT_OPTIONS.includes(repeat) ? repeat : "none";
  const todo = {
    text,
    completed: false,
    category,
    repeat: r,
    createdAt: Date.now(),
  };

  const listRef = db.ref(`${TODOS_ROOT}/${dateISO}`).push();
  const id = listRef.key;
  const key = `${dateISO}::${id}`;
  app.newTodoIds.add(key);
  return listRef
    .set(todo)
    .then(() => ({ id, dateISO }))
    .catch((err) => {
      app.newTodoIds.delete(key);
      throw err;
    });
}

function getMonthDaysGrid(year, monthIndex) {
  // monthIndex: 0-11
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const daysInMonth = last.getDate();
  const startDay = first.getDay(); // 0(Sun) .. 6(Sat)

  const cells = [];

  // Leading empty cells
  for (let i = 0; i < startDay; i++) {
    cells.push(null);
  }

  // Actual days
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, monthIndex, d));
  }

  // Trailing empty cells to fill full weeks (optional)
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function getMonthBgClass(monthIndex) {
  if (monthIndex === 2 || monthIndex === 3 || monthIndex === 4) return "monthBg--spring";
  if (monthIndex === 5 || monthIndex === 6 || monthIndex === 7) return "monthBg--summer";
  if (monthIndex === 8 || monthIndex === 9 || monthIndex === 10) return "monthBg--autumn";
  return "monthBg--winter";
}

function getMonthArtClass(monthIndex) {
  return getMonthBgClass(monthIndex).replace("monthBg--", "calMonthArt--");
}

function goMonth(delta) {
  const d = new Date(app.monthDate);
  d.setMonth(d.getMonth() + delta);
  app.monthDate = d;
  const y = d.getFullYear();
  const m = d.getMonth();
  app.selectedDateISO = `${y}-${pad2(m + 1)}-01`;
  app.todayScopeActive = false;
  app.listMode = "day";
  renderAll();
}

function openYearPicker() {
  if (!els.yearPicker || !els.yearInput) return;
  els.yearInput.value = String(app.monthDate.getFullYear());
  els.yearPicker.hidden = false;
  window.requestAnimationFrame(() => {
    els.yearInput.focus();
    els.yearInput.select();
  });
}

function closeYearPicker() {
  if (els.yearPicker) els.yearPicker.hidden = true;
}

function applyYearFromPicker() {
  const raw = els.yearInput?.value;
  const y = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return;
  const d = new Date(app.monthDate);
  d.setFullYear(y);
  app.monthDate = d;
  const yy = d.getFullYear();
  const mm = d.getMonth();
  app.selectedDateISO = `${yy}-${pad2(mm + 1)}-01`;
  app.todayScopeActive = false;
  app.listMode = "day";
  closeYearPicker();
  renderAll();
}

function openMonthPicker() {
  if (!els.monthPicker || !els.monthPickerGrid) return;
  els.monthPickerGrid.innerHTML = "";
  for (let mi = 0; mi < 12; mi++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "miniPicker__monthOpt";
    if (mi === app.monthDate.getMonth()) b.classList.add("miniPicker__monthOpt--active");
    b.textContent = `${mi + 1}월`;
    b.addEventListener("click", () => {
      const d = new Date(app.monthDate);
      d.setMonth(mi);
      app.monthDate = d;
      const yy = d.getFullYear();
      app.selectedDateISO = `${yy}-${pad2(mi + 1)}-01`;
      app.todayScopeActive = false;
      app.listMode = "day";
      closeMonthPicker();
      renderAll();
    });
    els.monthPickerGrid.appendChild(b);
  }
  els.monthPicker.hidden = false;
}

function closeMonthPicker() {
  if (els.monthPicker) els.monthPicker.hidden = true;
}

function renderCalendar() {
  app.todayISO = getTodayISOSeoul();
  const month = app.monthDate;
  const year = month.getFullYear();
  const m = month.getMonth();

  if (els.yearLabel) els.yearLabel.textContent = `${year}년`;
  if (els.monthBtn) {
    els.monthBtn.textContent = `${m + 1}월`;
    els.monthBtn.className = `calNavBtn calMonthBtn ${getMonthArtClass(m)}`;
  }
  updateTodayPillClockAndDate();

  els.calendar.innerHTML = "";

  const monthBlock = document.createElement("div");
  monthBlock.className = `monthBlock ${getMonthBgClass(m)}`;

  const innerGrid = document.createElement("div");
  innerGrid.className = "monthGrid";

  const head = document.createElement("div");
  head.className = "calHead";
  const dows = ["일", "월", "화", "수", "목", "금", "토"];
  for (const [idx, label] of dows.entries()) {
    const el = document.createElement("div");
    el.className = "dow";
    if (idx === 0 || idx === 6) el.classList.add("dow--weekend");
    el.textContent = label;
    head.appendChild(el);
  }
  innerGrid.appendChild(head);

  const cells = getMonthDaysGrid(year, m);
  for (const cellDate of cells) {
    if (!cellDate) {
      const spacer = document.createElement("div");
      spacer.className = "dayCellSpacer";
      innerGrid.appendChild(spacer);
      continue;
    }

    const iso = toISODate(cellDate);
    const todos = getTodosForDate(iso);
    const dayIndex = cellDate.getDay(); // 0=일, 6=토

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dayBtn";
    btn.dataset.date = iso;

    if (iso === app.todayISO) btn.classList.add("dayBtn--today");
    if (iso === app.selectedDateISO) btn.classList.add("dayBtn--selected");

    const hasBirthday = todos.some((t) => t.category === "생일");
    const dayNumClass = dayIndex === 0 || dayIndex === 6 ? "dayNum dayNum--weekend" : "dayNum";
    btn.innerHTML = `<div class="${dayNumClass}">${cellDate.getDate()}${
      hasBirthday ? ' <span class="dayIcon" aria-label="생일">🎂</span>' : ""
    }</div>`;

    const previewList = document.createElement("div");
    previewList.className = "previewList";

    const maxPreview = 3;
    const previewTodos = todos.slice(0, maxPreview);
    for (const t of previewTodos) {
      const row = document.createElement("div");
      if (t.completed) {
        row.className = "previewItem previewItem--completed";
        const text = document.createElement("div");
        text.className = "previewItem__text previewItem__text--completed";
        text.textContent = t.text;
        row.appendChild(text);
      } else {
        row.className = "previewItem";
        const fill = document.createElement("div");
        fill.className = "previewItem__fill";
        fill.style.background = categoryColor(t.category);
        const text = document.createElement("div");
        text.className = "previewItem__text";
        if (shouldShowNewBadge(t)) {
          const badge = document.createElement("span");
          badge.className = "previewNewBadge";
          const badgeInner = document.createElement("span");
          badgeInner.className = "previewNewBadge__inner";
          badgeInner.textContent = "NEW";
          badge.appendChild(badgeInner);
          text.appendChild(badge);
        }
        const inner = document.createElement("span");
        inner.className = "previewItem__textInner";
        inner.textContent = t.text;
        text.appendChild(inner);
        row.appendChild(fill);
        row.appendChild(text);
      }
      previewList.appendChild(row);
    }

    btn.appendChild(previewList);

    if (todos.length > maxPreview) {
      const more = document.createElement("div");
      more.className = "previewMore";
      more.textContent = `+ ${todos.length - maxPreview}개`;
      btn.appendChild(more);
    }

    btn.addEventListener("click", () => {
      clearNewBadgesForDate(iso);
      app.selectedDateISO = iso;
      app.listMode = "day";
      app.todayScopeActive = false;
      renderAll();
    });

    innerGrid.appendChild(btn);
  }

  monthBlock.appendChild(innerGrid);
  els.calendar.appendChild(monthBlock);
}

function categoryColor(category) {
  if (category === "약속") return "linear-gradient(135deg, #6d5efc, #8b7cff)";
  if (category === "생일") return "linear-gradient(135deg, #ec4899, #fb7185)";
  return "linear-gradient(135deg, #10b981, #34d399)"; // 할일
}

function renderFilterUI() {
  const vy = app.monthDate.getFullYear();
  const vm = app.monthDate.getMonth() + 1;
  const yy = String(vy).slice(-2);
  if (els.filterDateMonthBtn) els.filterDateMonthBtn.textContent = `${vm}월`;
  if (els.filterDateYearBtn) els.filterDateYearBtn.textContent = `${yy}년`;

  const dateActive =
    app.listMode === "today" || app.listMode === "month" || app.listMode === "year" ? app.listMode : null;
  els.filterDateSeg?.querySelectorAll("[data-date-scope]").forEach((b) => {
    const on = dateActive !== null && b.dataset.dateScope === dateActive;
    b.classList.toggle("filterSeg__btn--active", on);
  });

  const cat =
    app.activeCategory === "all" || !app.activeCategory
      ? "all"
      : CATEGORIES.includes(app.activeCategory)
        ? app.activeCategory
        : "all";
  els.filterCatSeg?.querySelectorAll("[data-cat-filter]").forEach((b) => {
    b.classList.toggle("filterSeg__btn--active", b.dataset.catFilter === cat);
  });
}

function renderTodos() {
  ensureSelectedForAddForm();

  const { allTodos, hintMode, todayParts } = getListTodosAndLabel();

  const cat =
    app.activeCategory === "all" || !app.activeCategory
      ? "all"
      : CATEGORIES.includes(app.activeCategory)
        ? app.activeCategory
        : "all";
  const todos = cat === "all" ? allTodos : allTodos.filter((t) => t.category === cat);
  const incompleteCount = todos.filter((t) => !t.completed).length;
  const countClass =
    incompleteCount === 0 ? "todoHint__count todoHint__count--zero" : "todoHint__count";

  if (hintMode === "none") {
    els.todoHint.textContent = "날짜를 선택하면 할 일이 보여요";
    els.todoList.innerHTML = "";
    return;
  }

  if (hintMode === "today" && todayParts) {
    els.todoHint.innerHTML = `오늘 (${todayParts.month}월 ${todayParts.day}일) 할일이 <span class="${countClass}">${incompleteCount}</span>개 남아있습니다`;
  } else if (hintMode === "month") {
    els.todoHint.innerHTML = `${app.listMonth}월 전체 · 할일이 <span class="${countClass}">${incompleteCount}</span>개 남아있습니다`;
  } else if (hintMode === "year") {
    const y = app.listYear || getSeoulDateTimeParts().year;
    els.todoHint.innerHTML = `${y}년 전체 · 할일이 <span class="${countClass}">${incompleteCount}</span>개 남아있습니다`;
  } else if (hintMode === "day" && app.selectedDateISO) {
    const selectedObj = new Date(`${app.selectedDateISO}T00:00:00`);
    const md = `${selectedObj.getMonth() + 1}월 ${selectedObj.getDate()}일`;
    els.todoHint.innerHTML = `${md} 할일이 <span class="${countClass}">${incompleteCount}</span>개 남아있습니다`;
  }

  if (allTodos.length === 0) {
    els.todoList.innerHTML = `<div class="card__hint">이 범위에는 아직 할 일이 없어요.</div>`;
    return;
  }

  if (todos.length === 0) {
    els.todoList.innerHTML = `<div class="card__hint">선택한 필터에 해당하는 할 일이 없어요.</div>`;
    return;
  }

  els.todoList.innerHTML = "";

  for (const todo of todos) {
    const item = document.createElement("div");
    item.className = "todoItem";
    item.dataset.id = todo.id;
    item.dataset.storageDate = todo.storageDateISO;

    const check = document.createElement("input");
    check.className = "check";
    check.type = "checkbox";
    check.checked = !!todo.completed;
    check.addEventListener("change", () => {
      toggleTodoCompleted(todo);
    });

    const main = document.createElement("div");
    main.className = "todoMain";

    const text = document.createElement("div");
    text.className = "todoText";
    if (todo.completed) text.classList.add("todoText--done");
    text.textContent = todo.text;
    main.appendChild(text);

    const metaRow = document.createElement("div");
    metaRow.className = "tagRow";
    if ((app.listMode === "month" || app.listMode === "year") && todo.displayDateISO) {
      const [ty, tm, td] = todo.displayDateISO.split("-").map(Number);
      const dateLab = document.createElement("span");
      dateLab.className = "todoItem__dateLab";
      dateLab.textContent = `${tm}월 ${td}일`;
      metaRow.appendChild(dateLab);
    }
    const badge = document.createElement("span");
    badge.className = `badge badge--${todo.category || "할일"}`;
    badge.textContent = todo.category || "할일";
    metaRow.appendChild(badge);
    main.appendChild(metaRow);

    const actions = document.createElement("div");
    actions.className = "todoActions";

    const del = document.createElement("button");
    del.type = "button";
    del.className = "iconBtn";
    del.title = "삭제";
    del.textContent = "삭제";
    del.addEventListener("click", () => {
      requestDelete(todo);
    });
    actions.appendChild(del);

    item.appendChild(check);
    item.appendChild(main);
    item.appendChild(actions);

    els.todoList.appendChild(item);
  }
}

function updateAddButton() {
  ensureSelectedForAddForm();
  const hasDate = !!app.selectedDateISO;
  const textOk = els.todoText.value.trim().length > 0;
  els.addBtn.disabled = !(hasDate && textOk);
}

function renderAll() {
  renderCalendar();
  renderFilterUI();
  renderTodos();
  updateAddButton();
}

// Events
els.prevMonthBtn?.addEventListener("click", () => goMonth(-1));
els.nextMonthBtn?.addEventListener("click", () => goMonth(1));

els.yearLabel?.addEventListener("click", () => openYearPicker());
els.yearPickerBackdrop?.addEventListener("click", closeYearPicker);
els.yearApplyBtn?.addEventListener("click", applyYearFromPicker);
els.yearMinus?.addEventListener("click", () => {
  const v = Number(els.yearInput?.value) || app.monthDate.getFullYear();
  if (els.yearInput) els.yearInput.value = String(Math.max(1900, v - 1));
});
els.yearPlus?.addEventListener("click", () => {
  const v = Number(els.yearInput?.value) || app.monthDate.getFullYear();
  if (els.yearInput) els.yearInput.value = String(Math.min(2100, v + 1));
});
els.yearInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") applyYearFromPicker();
});

els.monthBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  openMonthPicker();
});
els.monthPickerBackdrop?.addEventListener("click", closeMonthPicker);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeYearPicker();
    closeMonthPicker();
    closeDeleteConfirm();
    closeResetAllConfirm();
    closeClearCompletedConfirm();
    closeDeleteRepeatConfirm();
  }
});

els.deleteConfirmBackdrop?.addEventListener("click", closeDeleteConfirm);
els.deleteConfirmNo?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeDeleteConfirm();
});
els.deleteConfirmDelete?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  const p = app.pendingDelete;
  if (!p) {
    closeDeleteConfirm();
    return;
  }
  if (els.deleteConfirmSkip?.checked) setDeleteConfirmSkip7Days();
  void deleteTodo(p.storageDateISO, p.todoId)
    .then(() => closeDeleteConfirm())
    .catch(() => closeDeleteConfirm());
});

els.deleteRepeatBackdrop?.addEventListener("click", closeDeleteRepeatConfirm);
els.deleteRepeatNo?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeDeleteRepeatConfirm();
});
els.deleteRepeatDelete?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  const p = app.pendingRepeatDelete;
  if (!p) {
    closeDeleteRepeatConfirm();
    return;
  }
  const delAll = !!els.deleteRepeatAll?.checked;
  const run = delAll
    ? deleteTodo(p.storageDateISO, p.todoId)
    : skipOccurrence(p.storageDateISO, p.todoId, p.occurrenceDateISO);
  void Promise.resolve(run)
    .then(() => closeDeleteRepeatConfirm())
    .catch(() => closeDeleteRepeatConfirm());
});

function closeResetAllConfirm() {
  if (els.resetAllConfirm) els.resetAllConfirm.hidden = true;
}

function openResetAllConfirm() {
  if (els.resetAllConfirm) els.resetAllConfirm.hidden = false;
}

function closeClearCompletedConfirm() {
  if (els.clearCompletedConfirm) els.clearCompletedConfirm.hidden = true;
}

function openClearCompletedConfirm() {
  if (els.clearCompletedConfirm) els.clearCompletedConfirm.hidden = false;
}

els.resetAllBtn?.addEventListener("click", openResetAllConfirm);
els.resetAllBackdrop?.addEventListener("click", closeResetAllConfirm);
els.resetAllNo?.addEventListener("click", closeResetAllConfirm);
els.resetAllYes?.addEventListener("click", () => {
  void resetAllTodos()
    .then(() => {
      closeResetAllConfirm();
    })
    .catch(() => closeResetAllConfirm());
});

els.clearCompletedBtn?.addEventListener("click", openClearCompletedConfirm);
els.clearCompletedBackdrop?.addEventListener("click", closeClearCompletedConfirm);
els.clearCompletedNo?.addEventListener("click", closeClearCompletedConfirm);
els.clearCompletedYes?.addEventListener("click", () => {
  void deleteAllCompletedTodos()
    .then(() => closeClearCompletedConfirm())
    .catch(() => closeClearCompletedConfirm());
});

els.todoText.addEventListener("input", updateAddButton);

els.todoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!app.selectedDateISO) return;

  const text = els.todoText.value.trim();
  if (!text) return;

  const category = CATEGORIES.includes(els.todoCategory.value) ? els.todoCategory.value : "할일";
  const repeat = els.todoRepeat?.value ?? "none";

  void addTodo(app.selectedDateISO, text, category, repeat).then(() => {
    showToast(toastMessageForCategory(category));
  });

  els.todoText.value = "";
  els.todoCategory.value = "할일";
  if (els.todoRepeat) els.todoRepeat.value = "none";
  els.todoText.focus();
});

els.filterDateSeg?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-date-scope]");
  if (!btn) return;
  e.preventDefault();
  const scope = btn.dataset.dateScope;
  if (scope === "today") applyTodayScope();
  else if (scope === "month") applyMonthListScope();
  else if (scope === "year") applyYearListScope();
});

els.filterCatSeg?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cat-filter]");
  if (!btn) return;
  e.preventDefault();
  const v = btn.dataset.catFilter;
  app.activeCategory = v === "all" ? "all" : CATEGORIES.includes(v) ? v : "all";
  renderAll();
});

// Init
syncMonthDateToSeoulMonth();
ensureDateSelected();
renderAll();
updateTodayPillClockAndDate();
syncSeoulWeatherOnLoad();
scheduleNextSeoulHourWeather();
window.setInterval(updateTodayPillClockAndDate, 30 * 1000);
window.setInterval(() => {
  app.todayISO = getTodayISOSeoul();
}, 60 * 1000);

// Firebase live sync
db.ref(TODOS_ROOT).on("value", (snap) => {
  const val = snap.val();
  app.state.todosByDate = val && typeof val === "object" ? val : {};
  renderAll();
});


