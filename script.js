// Calendar Todos (vanilla JS)
// - Data is saved & synced with Firebase Realtime Database
// - Todos are stored per date (YYYY-MM-DD)

const CATEGORIES = ["약속", "생일", "할일"];

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
  addBtn: document.getElementById("addBtn"),
  todoList: document.getElementById("todoList"),
  filterAll: document.getElementById("filterAll"),
  filterAppt: document.getElementById("filterAppt"),
  filterBday: document.getElementById("filterBday"),
  filterTodo: document.getElementById("filterTodo"),
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
  activeCategory: null, // "약속" | "생일" | "할일" | null(전체)
  todayISO: getTodayISOSeoul(),
  monthDate: new Date(), // current month (today)
};

function ensureDateSelected() {
  if (app.selectedDateISO) return;

  // Default to today when possible; otherwise first day of month
  const now = new Date();
  if (now.getFullYear() === app.monthDate.getFullYear() && now.getMonth() === app.monthDate.getMonth()) {
    app.selectedDateISO = toISODate(now);
  } else {
    app.selectedDateISO = toISODate(new Date(app.monthDate.getFullYear(), app.monthDate.getMonth(), 1));
  }
}

function getTodosForDate(dateISO) {
  const obj = app.state.todosByDate[dateISO];
  if (!obj || typeof obj !== "object") return [];
  const todos = Object.entries(obj).map(([id, t]) => ({
    id,
    text: t?.text ?? "",
    completed: !!t?.completed,
    category: CATEGORIES.includes(t?.category) ? t.category : "할일",
    createdAt: Number.isFinite(t?.createdAt) ? t.createdAt : 0,
  }));
  // newest first
  todos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return todos;
}

function deleteTodo(dateISO, todoId) {
  return db.ref(`${TODOS_ROOT}/${dateISO}/${todoId}`).remove();
}

function toggleTodoCompleted(dateISO, todoId) {
  const todoRef = db.ref(`${TODOS_ROOT}/${dateISO}/${todoId}`);
  return todoRef.transaction((current) => {
    if (!current) return current;
    return { ...current, completed: !current.completed };
  });
}

function addTodo(dateISO, text, category) {
  const todo = {
    text,
    completed: false,
    category,
    createdAt: Date.now(),
  };

  // Use Firebase push() to avoid id collisions
  const listRef = db.ref(`${TODOS_ROOT}/${dateISO}`).push();
  return listRef.set(todo);
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
  app.activeCategory = null;
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
  app.activeCategory = null;
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
      app.activeCategory = null;
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
        text.textContent = t.text;
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
      app.selectedDateISO = iso;
      app.activeCategory = null;
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
  const setActive = (btn, active) => {
    if (active) btn.classList.add("chip--active");
    else btn.classList.remove("chip--active");
  };

  setActive(els.filterAll, app.activeCategory === null);
  setActive(els.filterAppt, app.activeCategory === "약속");
  setActive(els.filterBday, app.activeCategory === "생일");
  setActive(els.filterTodo, app.activeCategory === "할일");
}

function renderTodos() {
  if (!app.selectedDateISO) {
    els.todoHint.textContent = "날짜를 선택하면 할 일이 보여요";
    els.todoList.innerHTML = "";
    return;
  }

  const selectedObj = new Date(`${app.selectedDateISO}T00:00:00`);
  const allTodos = getTodosForDate(app.selectedDateISO);
  const incompleteCount = allTodos.filter((t) => !t.completed).length;
  const md = `${selectedObj.getMonth() + 1}월 ${selectedObj.getDate()}일`;
  const countClass =
    incompleteCount === 0 ? "todoHint__count todoHint__count--zero" : "todoHint__count";
  els.todoHint.innerHTML = `${md} 할일이 <span class="${countClass}">${incompleteCount}</span>개 남아있습니다`;

  const todos = app.activeCategory ? allTodos.filter((t) => t.category === app.activeCategory) : allTodos;

  if (allTodos.length === 0) {
    els.todoList.innerHTML = `<div class="card__hint">이 날짜에는 아직 할 일이 없어요.</div>`;
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

    const check = document.createElement("input");
    check.className = "check";
    check.type = "checkbox";
    check.checked = !!todo.completed;
    check.addEventListener("change", () => {
      toggleTodoCompleted(app.selectedDateISO, todo.id);
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
      deleteTodo(app.selectedDateISO, todo.id);
    });
    actions.appendChild(del);

    item.appendChild(check);
    item.appendChild(main);
    item.appendChild(actions);

    els.todoList.appendChild(item);
  }
}

function updateAddButton() {
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
  }
});

els.todoText.addEventListener("input", updateAddButton);

els.todoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!app.selectedDateISO) return;

  const text = els.todoText.value.trim();
  if (!text) return;

  const category = CATEGORIES.includes(els.todoCategory.value) ? els.todoCategory.value : "할일";
  addTodo(app.selectedDateISO, text, category);

  els.todoText.value = "";
  els.todoCategory.value = "할일";
  app.activeCategory = null;

  renderAll();
  els.todoText.focus();
});

els.filterAll.addEventListener("click", () => {
  app.activeCategory = null;
  renderAll();
});

els.filterAppt.addEventListener("click", () => {
  app.activeCategory = "약속";
  renderAll();
});

els.filterBday.addEventListener("click", () => {
  app.activeCategory = "생일";
  renderAll();
});

els.filterTodo.addEventListener("click", () => {
  app.activeCategory = "할일";
  renderAll();
});

// Init
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


