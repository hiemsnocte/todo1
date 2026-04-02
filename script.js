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

const els = {
  monthLabel: document.getElementById("monthLabel"),
  selectedLabel: document.getElementById("selectedLabel"),
  todayPill: document.getElementById("todayPill"),
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

const app = {
  state: { todosByDate: {} }, // { [dateISO]: { [todoId]: todo } }
  selectedDateISO: null,
  activeCategory: null, // "약속" | "생일" | "할일" | null(전체)
  todayISO: toISODate(new Date()),
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

function renderCalendar() {
  const month = app.monthDate;
  const year = month.getFullYear();
  const m = month.getMonth();

  els.monthLabel.textContent = formatMonthLabel(month);
  els.todayPill.textContent = `오늘: ${app.todayISO}`;

  const selectedDateObj = app.selectedDateISO ? new Date(`${app.selectedDateISO}T00:00:00`) : null;
  els.selectedLabel.textContent = selectedDateObj ? `선택: ${formatLong(selectedDateObj)}` : "날짜를 선택하세요";

  els.calendar.innerHTML = "";

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
  els.calendar.appendChild(head);

  const cells = getMonthDaysGrid(year, m);
  for (const cellDate of cells) {
    if (!cellDate) {
      const spacer = document.createElement("div");
      spacer.style.minHeight = "56px";
      els.calendar.appendChild(spacer);
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

    const dayNumClass = dayIndex === 0 || dayIndex === 6 ? "dayNum dayNum--weekend" : "dayNum";
    btn.innerHTML = `<div class="${dayNumClass}">${cellDate.getDate()}</div>`;

    // Preview bars stacked (horizontal bars, multiple rows)
    const previewList = document.createElement("div");
    previewList.className = "previewList";

    const maxPreview = 3;
    const previewTodos = todos.slice(0, maxPreview);
    for (const t of previewTodos) {
      const row = document.createElement("div");
      row.className = "previewItem";
      if (t.completed) row.classList.add("previewItem--done");

      const fill = document.createElement("div");
      fill.className = "previewItem__fill";
      fill.style.background = categoryColor(t.category);

      const text = document.createElement("div");
      text.className = "previewItem__text";
      text.textContent = t.text;

      row.appendChild(fill);
      row.appendChild(text);
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

    els.calendar.appendChild(btn);
  }
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
  els.todoHint.textContent = formatLong(selectedObj);

  const allTodos = getTodosForDate(app.selectedDateISO);
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

// Firebase live sync
db.ref(TODOS_ROOT).on("value", (snap) => {
  const val = snap.val();
  app.state.todosByDate = val && typeof val === "object" ? val : {};
  renderAll();
});


