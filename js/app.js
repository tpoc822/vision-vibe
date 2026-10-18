// js/app.js — StudyFlow 앱 로직 (순수 JavaScript, 프레임워크 없음)
// 구성: 저장(localStorage) → 상태 → 할 일 CRUD → 뷰 렌더링(목록·칸반·캘린더) → 이벤트 연결
// 보안 원칙(계획서 8장): 사용자가 입력한 글자는 innerHTML이 아니라 textContent로만 화면에 넣는다.
(function () {
  "use strict";

  // ---------- 1. 저장 (기능 5: localStorage) ----------
  const STORAGE_KEY = "studyflow:tasks";
  const VIEW_KEY = "studyflow:view";

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(isTask) : [];
    } catch (e) {
      console.warn("저장된 데이터를 읽지 못해 빈 목록으로 시작합니다.", e);
      return [];
    }
  }
  function saveTasks(tasks) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
    catch (e) { alert("브라우저 저장 공간에 쓸 수 없습니다. 시크릿 모드이거나 저장 공간이 가득 찼을 수 있습니다."); }
  }
  function isTask(t) { return t && typeof t.id === "string" && typeof t.title === "string"; }

  // ---------- 2. 상태 ----------
  const PRIORITY_LABEL = { high: "높음", normal: "보통", low: "낮음" };
  const STATUS_LABEL = { todo: "할 일", doing: "진행 중", done: "완료" };
  const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };

  const state = {
    tasks: loadTasks(),
    view: localStorage.getItem(VIEW_KEY) || "list",
    filters: { q: "", subject: "", priority: "", status: "", overdue: false },
    calendar: null, // { year, month } — 캘린더 뷰에서 사용
    editingId: null,
  };

  // ---------- 3. 날짜 도우미 (기능 6: D-Day) ----------
  function todayStr() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  }
  // "YYYY-MM-DD" → 오늘 기준 남은 날 수 (음수면 기한 초과). 마감일이 없으면 null
  function daysUntil(due) {
    if (!due) return null;
    const [y, m, d] = due.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((target - now) / 86400000);
  }
  function ddayInfo(task) {
    const n = daysUntil(task.due);
    if (n === null) return { text: "마감일 없음", cls: "none" };
    if (task.status === "done") return { text: n === 0 ? "D-Day" : (n > 0 ? "D-" + n : "D+" + (-n)), cls: "later" };
    if (n < 0) return { text: "D+" + (-n) + " 기한 초과", cls: "overdue" };
    if (n === 0) return { text: "D-Day 오늘 마감", cls: "today" };
    if (n <= 3) return { text: "D-" + n, cls: "soon" };
    return { text: "D-" + n, cls: "later" };
  }
  function isOverdue(task) {
    const n = daysUntil(task.due);
    return n !== null && n < 0 && task.status !== "done";
  }
  function formatDue(due) {
    if (!due) return "";
    const [y, m, d] = due.split("-");
    return `${y}.${m}.${d}`;
  }

  // ---------- 4. 할 일 CRUD (기능 1) ----------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function addTask(data) {
    const now = new Date().toISOString();
    const task = { id: uid(), createdAt: now, updatedAt: now, ...normalize(data) };
    state.tasks.push(task);
    saveTasks(state.tasks);
    return task;
  }
  function updateTask(id, data) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    Object.assign(t, normalize(data), { updatedAt: new Date().toISOString() });
    saveTasks(state.tasks);
  }
  function deleteTask(id) {
    state.tasks = state.tasks.filter(x => x.id !== id);
    saveTasks(state.tasks);
  }
  function setStatus(id, status) {
    const t = state.tasks.find(x => x.id === id);
    if (!t || !STATUS_LABEL[status]) return;
    t.status = status; t.updatedAt = new Date().toISOString();
    saveTasks(state.tasks);
  }
  function normalize(data) {
    return {
      title: String(data.title || "").trim().slice(0, 80),
      subject: String(data.subject || "").trim().slice(0, 30),
      due: /^\d{4}-\d{2}-\d{2}$/.test(data.due || "") ? data.due : "",
      priority: PRIORITY_LABEL[data.priority] ? data.priority : "normal",
      status: STATUS_LABEL[data.status] ? data.status : "todo",
      memo: String(data.memo || "").trim().slice(0, 500),
    };
  }

  // ---------- 5. 필터·검색·정렬 (기능 4) ----------
  function visibleTasks() {
    const f = state.filters;
    const q = f.q.trim().toLowerCase();
    return state.tasks
      .filter(t => !q || t.title.toLowerCase().includes(q))
      .filter(t => !f.subject || t.subject === f.subject)
      .filter(t => !f.priority || t.priority === f.priority)
      .filter(t => !f.status || t.status === f.status)
      .filter(t => !f.overdue || isOverdue(t));
  }
  // 정렬: 완료는 뒤로, 마감일 빠른 순(없으면 뒤), 같은 날이면 우선순위 높은 순
  function sortTasks(list) {
    return list.slice().sort((a, b) => {
      if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
      if (a.due !== b.due) { if (!a.due) return 1; if (!b.due) return -1; return a.due < b.due ? -1 : 1; }
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    });
  }
  function subjects() {
    return [...new Set(state.tasks.map(t => t.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  }

  // ---------- 6. DOM 도우미 ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text; // 사용자 입력은 항상 textContent로
    return n;
  }
  function tag(text, cls) { return el("span", "tag " + (cls || ""), text); }

  // 카드 한 장 (목록·칸반 공용)
  function renderCard(task, opts) {
    opts = opts || {};
    const card = el("div", "card" + (task.status === "done" ? " is-done" : ""));
    card.dataset.id = task.id;

    const check = el("input", "check-done");
    check.type = "checkbox"; check.checked = task.status === "done"; check.title = "완료 표시";
    check.addEventListener("change", () => { setStatus(task.id, check.checked ? "done" : "todo"); render(); });

    const body = el("div", "body");
    const title = el("div", "title", task.title);
    title.title = "클릭해서 수정"; title.addEventListener("click", () => openDialog(task.id));
    body.appendChild(title);

    const meta = el("div", "meta");
    const dd = ddayInfo(task);
    meta.appendChild(el("span", "dday " + dd.cls, dd.text));
    if (task.due) meta.appendChild(el("span", "", "마감 " + formatDue(task.due)));
    if (task.subject) meta.appendChild(tag(task.subject, "subject"));
    meta.appendChild(tag(PRIORITY_LABEL[task.priority], "pri-" + task.priority));
    if (!opts.hideStatus) meta.appendChild(tag(STATUS_LABEL[task.status], "status-" + task.status));
    body.appendChild(meta);
    if (task.memo) body.appendChild(el("div", "memo", task.memo));

    const actions = el("div", "actions");
    if (opts.moveButtons) {
      const order = ["todo", "doing", "done"], i = order.indexOf(task.status);
      if (i > 0) { const b = el("button", "btn btn-sm", "←"); b.type = "button"; b.title = STATUS_LABEL[order[i - 1]] + "(으)로"; b.addEventListener("click", () => { setStatus(task.id, order[i - 1]); render(); }); actions.appendChild(b); }
      if (i < 2) { const b = el("button", "btn btn-sm", "→"); b.type = "button"; b.title = STATUS_LABEL[order[i + 1]] + "(으)로"; b.addEventListener("click", () => { setStatus(task.id, order[i + 1]); render(); }); actions.appendChild(b); }
    }
    const edit = el("button", "btn btn-sm", "수정"); edit.type = "button"; edit.addEventListener("click", () => openDialog(task.id));
    const del = el("button", "btn btn-sm", "삭제"); del.type = "button";
    del.addEventListener("click", () => { if (confirm(`"${task.title}" 할 일을 삭제할까요?`)) { deleteTask(task.id); render(); } });
    actions.appendChild(edit); actions.appendChild(del);

    card.appendChild(check); card.appendChild(body); card.appendChild(actions);
    return card;
  }

  // ---------- 7. 목록 뷰 ----------
  function renderList(root) {
    root.replaceChildren();
    const list = sortTasks(visibleTasks());
    if (list.length === 0) { root.appendChild(renderEmpty()); return; }
    const groups = [
      ["기한 초과", list.filter(isOverdue)],
      ["진행 중", list.filter(t => t.status === "doing" && !isOverdue(t))],
      ["할 일", list.filter(t => t.status === "todo" && !isOverdue(t))],
      ["완료", list.filter(t => t.status === "done")],
    ];
    for (const [name, items] of groups) {
      if (!items.length) continue;
      const g = el("section", "list-group");
      g.appendChild(el("h3", "", `${name} · ${items.length}`));
      const wrap = el("div", "list");
      items.forEach(t => wrap.appendChild(renderCard(t)));
      g.appendChild(wrap); root.appendChild(g);
    }
  }
  function renderEmpty() {
    const box = el("div", "empty");
    const hasAny = state.tasks.length > 0;
    box.appendChild(el("p", "", hasAny ? "조건에 맞는 할 일이 없습니다. 검색어나 필터를 바꿔 보세요." : "아직 할 일이 없습니다. 첫 할 일을 추가해 보세요."));
    if (!hasAny) {
      const b = el("button", "btn btn-primary", "+ 새 할 일"); b.type = "button"; b.addEventListener("click", () => openDialog(null));
      const s = el("button", "btn", "예시 데이터 넣기"); s.type = "button"; s.addEventListener("click", () => { seedSample(); render(); });
      box.appendChild(b); box.appendChild(document.createTextNode(" ")); box.appendChild(s);
    }
    return box;
  }
  function seedSample() {
    const t = new Date(); const d = (n) => { const x = new Date(t); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    [
      { title: "운영체제 3장 복습", subject: "운영체제", due: d(1), priority: "high", status: "doing", memo: "프로세스 스케줄링 예제 다시 풀기" },
      { title: "자료구조 과제 2 제출", subject: "자료구조", due: d(3), priority: "high", status: "todo", memo: "연결 리스트 구현 + 보고서" },
      { title: "영어 발표 자료 만들기", subject: "영어", due: d(7), priority: "normal", status: "todo" },
      { title: "데이터베이스 퀴즈 준비", subject: "데이터베이스", due: d(-2), priority: "normal", status: "todo", memo: "정규화 범위" },
      { title: "AI 활용 보고서 초안", subject: "AI 활용", due: d(14), priority: "low", status: "todo" },
      { title: "동아리 회의록 정리", subject: "기타", due: d(-5), priority: "low", status: "done" },
    ].forEach(addTask);
  }

  // ---------- 8. 칸반 뷰 (기능 2: 드래그 앤 드롭) ----------
  function renderBoard(root) {
    root.replaceChildren();
    const board = el("div", "board");
    const list = sortTasks(visibleTasks());
    for (const status of ["todo", "doing", "done"]) {
      const items = list.filter(t => t.status === status);
      const col = el("section", "column"); col.dataset.status = status;
      const h = el("h3"); h.appendChild(el("span", "", STATUS_LABEL[status])); h.appendChild(el("span", "count", String(items.length)));
      col.appendChild(h);
      items.forEach(t => {
        const card = renderCard(t, { hideStatus: true, moveButtons: true });
        card.draggable = true;
        card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; card.classList.add("is-dragging"); });
        card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
        col.appendChild(card);
      });
      col.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; col.classList.add("is-over"); });
      col.addEventListener("dragleave", () => col.classList.remove("is-over"));
      col.addEventListener("drop", (e) => {
        e.preventDefault(); col.classList.remove("is-over");
        const id = e.dataTransfer.getData("text/plain");
        if (id) { setStatus(id, status); render(); }
      });
      board.appendChild(col);
    }
    root.appendChild(board);
  }

  // ---------- 9. 캘린더 뷰 (기능 3) ----------
  function renderCalendar(root) {
    root.replaceChildren();
    if (!state.calendar) { const n = new Date(); state.calendar = { year: n.getFullYear(), month: n.getMonth() }; }
    const { year, month } = state.calendar;
    const head = el("div", "cal-head");
    const prev = el("button", "btn btn-sm", "◀"); prev.type = "button"; prev.addEventListener("click", () => { moveMonth(-1); render(); });
    const next = el("button", "btn btn-sm", "▶"); next.type = "button"; next.addEventListener("click", () => { moveMonth(1); render(); });
    const today = el("button", "btn btn-sm", "오늘"); today.type = "button"; today.addEventListener("click", () => { state.calendar = null; render(); });
    head.appendChild(prev); head.appendChild(el("h3", "", `${year}년 ${month + 1}월`)); head.appendChild(next); head.appendChild(today);
    root.appendChild(head);

    const grid = el("div", "calendar");
    ["일", "월", "화", "수", "목", "금", "토"].forEach((d, i) => grid.appendChild(el("div", "cal-dow" + (i === 0 ? " sun" : ""), d)));
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay()); // 일요일 시작
    const byDate = {};
    for (const t of visibleTasks()) { if (t.due) (byDate[t.due] = byDate[t.due] || []).push(t); }
    const tStr = todayStr();
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const key = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
      const cell = el("div", "cal-day" + (d.getMonth() !== month ? " other" : "") + (key === tStr ? " today" : ""));
      cell.appendChild(el("div", "d", String(d.getDate())));
      sortTasks(byDate[key] || []).forEach(t => {
        const chip = el("button", "chip pri-" + t.priority + " status-" + t.status + (isOverdue(t) ? " overdue" : ""), t.title);
        chip.type = "button"; chip.title = `${t.title} · ${PRIORITY_LABEL[t.priority]} · ${STATUS_LABEL[t.status]}`;
        chip.addEventListener("click", () => openDialog(t.id));
        cell.appendChild(chip);
      });
      grid.appendChild(cell);
      if (i >= 34 && d.getMonth() !== month && (i + 1) % 7 === 0) break; // 6번째 줄이 전부 다음 달이면 생략
    }
    root.appendChild(grid);
  }
  function moveMonth(delta) {
    const { year, month } = state.calendar;
    const d = new Date(year, month + delta, 1);
    state.calendar = { year: d.getFullYear(), month: d.getMonth() };
  }

  // ---------- 10. 검색·필터 줄과 요약 ----------
  function renderToolbar() {
    const sel = $("#filter-subject"); const cur = state.filters.subject;
    sel.replaceChildren(el("option", "", "모든 과목")); sel.firstChild.value = "";
    subjects().forEach(s => { const o = el("option", "", s); o.value = s; sel.appendChild(o); });
    sel.value = subjects().includes(cur) ? cur : "";
    if (sel.value !== cur) state.filters.subject = sel.value;
    const dl = $("#subject-list"); dl.replaceChildren(); subjects().forEach(s => { const o = document.createElement("option"); o.value = s; dl.appendChild(o); });

    const total = state.tasks.length, shown = visibleTasks().length;
    const overdue = state.tasks.filter(isOverdue).length, done = state.tasks.filter(t => t.status === "done").length;
    $("#summary").textContent = total === 0 ? "" : `전체 ${total} · 표시 ${shown} · 완료 ${done}` + (overdue ? ` · 기한 초과 ${overdue}` : "");
  }

  // ---------- 11. 전체 렌더 ----------
  function render() {
    renderToolbar();
    document.querySelectorAll(".tab").forEach(b => { const on = b.dataset.view === state.view; b.classList.toggle("is-active", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    $("#view-list").hidden = state.view !== "list";
    $("#view-board").hidden = state.view !== "board";
    $("#view-calendar").hidden = state.view !== "calendar";
    if (state.view === "list") renderList($("#view-list"));
    if (state.view === "board") renderBoard($("#view-board"));
    if (state.view === "calendar") renderCalendar($("#view-calendar"));
  }

  // ---------- 12. 입력 창 ----------
  const dialog = $("#task-dialog"), form = $("#task-form");
  function openDialog(id) {
    state.editingId = id;
    const t = id ? state.tasks.find(x => x.id === id) : null;
    $("#dialog-title").textContent = t ? "할 일 수정" : "새 할 일";
    form.title.value = t ? t.title : "";
    form.subject.value = t ? t.subject : "";
    form.due.value = t ? t.due : "";
    form.priority.value = t ? t.priority : "normal";
    form.status.value = t ? t.status : "todo";
    form.memo.value = t ? t.memo : "";
    $("#btn-delete").hidden = !t;
    $("#form-error").hidden = true;
    dialog.showModal();
    form.title.focus();
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = { title: form.title.value, subject: form.subject.value, due: form.due.value, priority: form.priority.value, status: form.status.value, memo: form.memo.value };
    if (!data.title.trim()) { $("#form-error").hidden = false; form.title.focus(); return; }
    if (state.editingId) updateTask(state.editingId, data); else addTask(data);
    dialog.close(); render();
  });
  $("#btn-cancel").addEventListener("click", () => dialog.close());
  $("#btn-delete").addEventListener("click", () => {
    const t = state.tasks.find(x => x.id === state.editingId);
    if (t && confirm(`"${t.title}" 할 일을 삭제할까요?`)) { deleteTask(t.id); dialog.close(); render(); }
  });

  // ---------- 13. 이벤트 연결 ----------
  $("#btn-new").addEventListener("click", () => openDialog(null));
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => { state.view = b.dataset.view; localStorage.setItem(VIEW_KEY, state.view); render(); }));
  $("#search").addEventListener("input", (e) => { state.filters.q = e.target.value; render(); });
  $("#filter-subject").addEventListener("change", (e) => { state.filters.subject = e.target.value; render(); });
  $("#filter-priority").addEventListener("change", (e) => { state.filters.priority = e.target.value; render(); });
  $("#filter-status").addEventListener("change", (e) => { state.filters.status = e.target.value; render(); });
  $("#filter-overdue").addEventListener("change", (e) => { state.filters.overdue = e.target.checked; render(); });
  document.addEventListener("keydown", (e) => { if (e.key === "n" && !dialog.open && !/input|textarea|select/i.test(e.target.tagName)) openDialog(null); });
  // 다른 탭에서 바꾼 데이터도 반영
  window.addEventListener("storage", (e) => { if (e.key === STORAGE_KEY) { state.tasks = loadTasks(); render(); } });

  render();
})();
