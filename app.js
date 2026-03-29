const APP_STORAGE_KEY = "manager-task-v1";
const CATALOG_STORAGE_KEY = "manager-task-v1-catalog";

const MANAGER = { id: "imbitsalov", name: "Имбицалов И.И.", role: "manager", token: "inv-manager-001" };

const DEFAULT_TOPICS = [
  "убрать навоз крупного скота",
  "заглушить мотор трактара",
  "посееть то, что по итогу пожнешь",
  "открыть двери представителю иных земель",
];

const DEFAULT_PERFORMERS = [
  { id: "grehovnik", name: "Греховник А.А.", token: "inv-grehovnik-001" },
  { id: "zabiyaka", name: "Забияка В.В", token: "inv-zabiyaka-001" },
  { id: "loshkatova", name: "Лошкатова С.С.", token: "inv-loshkatova-001" },
  { id: "tupankova", name: "Тупанкова Л.Л.", token: "inv-tupankova-001" },
];

const STATE = {
  currentUser: null,
  tasks: [],
  catalog: { topics: [], performers: [] },
  selectedTaskId: null,
  filter: "active",
};

let messageTimer = null;

const el = {
  appMessages: document.getElementById("app-messages"),
  userBadge: document.getElementById("user-badge"),
  roleSwitchSelect: document.getElementById("role-switch-select"),
  roleSwitchBtn: document.getElementById("role-switch-btn"),
  topicMinus: document.getElementById("topic-minus"),
  topicPlus: document.getElementById("topic-plus"),
  performerMinus: document.getElementById("performer-minus"),
  performerPlus: document.getElementById("performer-plus"),
  newTopicInput: document.getElementById("new-topic-input"),
  newPerformerInput: document.getElementById("new-performer-input"),
  assigneeInviteHint: document.getElementById("assignee-invite-hint"),
  quickCreateScreen: document.getElementById("quick-create-screen"),
  taskText: document.getElementById("task-text"),
  taskTopic: document.getElementById("task-topic"),
  taskAssignee: document.getElementById("task-assignee"),
  recordBtn: document.getElementById("record-btn"),
  recordStatus: document.getElementById("record-status"),
  sendTaskBtn: document.getElementById("send-task-btn"),
  tasksTitle: document.getElementById("tasks-title"),
  tasksList: document.getElementById("tasks-list"),
  taskDetails: document.getElementById("task-details"),
  filterButtons: document.querySelectorAll(".filter-btn"),
  taskItemTemplate: document.getElementById("task-item-template"),
};

init();

function init() {
  STATE.catalog = loadCatalog();
  STATE.currentUser = resolveUserFromInvite();
  STATE.tasks = loadTasks();
  fillSelects();
  fillRoleSwitcher();
  bindEvents();
  renderApp();
}

function getPerformers() {
  return STATE.catalog.performers;
}

function getAllUsers() {
  return [MANAGER, ...getPerformers().map((p) => ({ ...p, role: "performer" }))];
}

function loadCatalog() {
  const raw = localStorage.getItem(CATALOG_STORAGE_KEY);
  if (!raw) {
    return {
      topics: [...DEFAULT_TOPICS],
      performers: DEFAULT_PERFORMERS.map((p) => ({ ...p })),
    };
  }
  try {
    const parsed = JSON.parse(raw);
    const topics = Array.isArray(parsed.topics) && parsed.topics.length ? parsed.topics : [...DEFAULT_TOPICS];
    const performers =
      Array.isArray(parsed.performers) && parsed.performers.length
        ? parsed.performers.map((p) => ({ id: p.id, name: p.name, token: p.token }))
        : DEFAULT_PERFORMERS.map((p) => ({ ...p }));
    return { topics, performers };
  } catch {
    return {
      topics: [...DEFAULT_TOPICS],
      performers: DEFAULT_PERFORMERS.map((p) => ({ ...p })),
    };
  }
}

function saveCatalog() {
  localStorage.setItem(
    CATALOG_STORAGE_KEY,
    JSON.stringify({
      topics: STATE.catalog.topics,
      performers: STATE.catalog.performers,
    }),
  );
}

function resolveUserFromInvite() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("invite");
  const matched = getAllUsers().find((u) => u.token === token);
  if (matched) return matched;
  return MANAGER;
}

function fillSelects() {
  const prevTopic = el.taskTopic.value;
  const prevAssignee = el.taskAssignee.value;
  const topics = STATE.catalog.topics;
  el.taskTopic.innerHTML = topics.map((topic) => `<option value="${escapeAttr(topic)}">${escapeHtml(topic)}</option>`).join("");
  const performerOptions = getPerformers()
    .map((u) => `<option value="${escapeAttr(u.id)}">${escapeHtml(u.name)}</option>`)
    .join("");
  el.taskAssignee.innerHTML = performerOptions;
  if (topics.includes(prevTopic)) el.taskTopic.value = prevTopic;
  else if (topics.length) el.taskTopic.value = topics[0];
  const performers = getPerformers();
  if (performers.some((p) => p.id === prevAssignee)) el.taskAssignee.value = prevAssignee;
  else if (performers.length) el.taskAssignee.value = performers[0].id;
  updateInviteHint();
}

function fillRoleSwitcher() {
  el.roleSwitchSelect.innerHTML = getAllUsers()
    .map(
      (user) =>
        `<option value="${escapeAttr(user.id)}">${escapeHtml(user.name)} (${user.role === "manager" ? "руководитель" : "исполнитель"})</option>`,
    )
    .join("");
}

function bindEvents() {
  el.sendTaskBtn.addEventListener("click", createTaskFromForm);
  el.recordBtn.addEventListener("click", startVoiceRecognition);
  el.roleSwitchBtn.addEventListener("click", switchRole);
  el.topicPlus.addEventListener("click", addTopic);
  el.topicMinus.addEventListener("click", removeSelectedTopic);
  el.performerPlus.addEventListener("click", addPerformer);
  el.performerMinus.addEventListener("click", removeSelectedPerformer);
  el.taskAssignee.addEventListener("change", updateInviteHint);
  el.filterButtons.forEach((btn) =>
    btn.addEventListener("click", () => {
      STATE.filter = btn.dataset.filter;
      el.filterButtons.forEach((b) => b.classList.toggle("active", b === btn));
      renderTaskList();
    }),
  );
}

function addTopic() {
  const text = el.newTopicInput.value.trim();
  if (!text) {
    showMessage("Введите текст темы.", "error");
    return;
  }
  if (STATE.catalog.topics.includes(text)) {
    showMessage("Такая тема уже есть.", "error");
    return;
  }
  STATE.catalog.topics.push(text);
  saveCatalog();
  el.newTopicInput.value = "";
  fillSelects();
  el.taskTopic.value = text;
  showMessage("Тема добавлена.", "info");
}

function addPerformer() {
  const name = el.newPerformerInput.value.trim();
  if (!name) {
    showMessage("Введите ФИО исполнителя.", "error");
    return;
  }
  const id = `perf_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const token = `inv-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  STATE.catalog.performers.push({ id, name, token });
  saveCatalog();
  el.newPerformerInput.value = "";
  fillSelects();
  fillRoleSwitcher();
  el.taskAssignee.value = id;
  updateInviteHint();
  showMessage("Исполнитель добавлен. Ссылка: ?invite=" + token, "info");
}

function removeSelectedTopic() {
  const topic = el.taskTopic.value;
  if (!topic) return;
  if (STATE.tasks.some((t) => t.topic === topic)) {
    showMessage("Эту тему нельзя удалить: есть задачи с этой темой.", "error");
    return;
  }
  if (STATE.catalog.topics.length <= 1) {
    showMessage("Должна остаться хотя бы одна тема.", "error");
    return;
  }
  const index = STATE.catalog.topics.indexOf(topic);
  if (index === -1) return;
  STATE.catalog.topics.splice(index, 1);
  saveCatalog();
  fillSelects();
  showMessage("Тема удалена.", "info");
}

function removeSelectedPerformer() {
  const performerId = el.taskAssignee.value;
  if (!performerId) return;
  if (STATE.tasks.some((t) => t.currentAssigneeId === performerId)) {
    showMessage("Нельзя удалить исполнителя: есть активные задачи на него.", "error");
    return;
  }
  if (STATE.catalog.performers.length <= 1) {
    showMessage("Должен остаться хотя бы один исполнитель.", "error");
    return;
  }
  STATE.catalog.performers = STATE.catalog.performers.filter((p) => p.id !== performerId);
  saveCatalog();
  fillSelects();
  fillRoleSwitcher();
  if (STATE.currentUser.id === performerId) {
    STATE.currentUser = MANAGER;
    updateInviteInUrl(MANAGER.token);
  }
  renderApp();
  showMessage("Исполнитель удалён.", "info");
}

function updateInviteHint() {
  if (!el.assigneeInviteHint) return;
  if (STATE.currentUser.role !== "manager") {
    el.assigneeInviteHint.textContent = "";
    return;
  }
  const id = el.taskAssignee.value;
  const performer = getPerformers().find((p) => p.id === id);
  el.assigneeInviteHint.textContent = performer ? `Ссылка исполнителя: ?invite=${performer.token}` : "";
}

function showMessage(text, type = "error") {
  if (!el.appMessages) return;
  clearTimeout(messageTimer);
  el.appMessages.innerHTML = "";
  const div = document.createElement("div");
  div.className = `message message-${type}`;
  div.textContent = text;
  el.appMessages.appendChild(div);
  messageTimer = setTimeout(() => {
    el.appMessages.innerHTML = "";
  }, 8000);
}

function createTaskFromForm() {
  if (STATE.currentUser.role !== "manager") return;
  const performers = getPerformers();
  if (!performers.length) {
    showMessage("Добавьте хотя бы одного исполнителя в справочнике.", "error");
    return;
  }
  const text = el.taskText.value.trim();
  if (!text) {
    showMessage("Введите или продиктуйте текст задачи.", "error");
    return;
  }
  const topic = el.taskTopic.value;
  const assigneeId = el.taskAssignee.value;
  const now = new Date().toISOString();
  const task = {
    id: crypto.randomUUID(),
    text,
    topic,
    managerId: STATE.currentUser.id,
    currentAssigneeId: assigneeId,
    status: "new",
    history: [
      {
        type: "created",
        byUserId: STATE.currentUser.id,
        at: now,
        message: `Задача создана и назначена: ${resolveUserName(assigneeId)}`,
      },
    ],
  };
  STATE.tasks.unshift(task);
  saveTasks();
  el.taskText.value = "";
  renderApp();
}

function startVoiceRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    showMessage("В этом браузере нет поддержки голосового ввода.", "error");
    return;
  }
  const recognition = new Recognition();
  recognition.lang = "ru-RU";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  el.recordStatus.textContent = "Слушаю...";
  recognition.start();

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.trim();
    el.taskText.value = transcript;
    autoPickTopicAndAssignee(transcript);
    el.recordStatus.textContent = "Готово: текст распознан.";
  };
  recognition.onerror = (event) => {
    const code = event.error || "unknown";
    el.recordStatus.textContent = "Ошибка распознавания.";
    showMessage(`Ошибка распознавания речи: ${code}`, "error");
  };
  recognition.onend = () => {
    if (!el.recordStatus.textContent) {
      el.recordStatus.textContent = "Запись завершена.";
    }
  };
}

function autoPickTopicAndAssignee(text) {
  const topics = STATE.catalog.topics;
  if (!topics.length) return;

  const lower = text.toLowerCase();
  let pickedTopic = topics[0];
  if (topics[1] && (lower.includes("трактар") || lower.includes("мотор"))) pickedTopic = topics[1];
  if (topics[2] && lower.includes("посе")) pickedTopic = topics[2];
  if (topics[3] && (lower.includes("двер") || lower.includes("иных земель"))) pickedTopic = topics[3];
  if (topics[0] && (lower.includes("навоз") || lower.includes("скот"))) pickedTopic = topics[0];
  if (topics.includes(pickedTopic)) el.taskTopic.value = pickedTopic;

  const performers = getPerformers();
  const performer = performers.find((u) => lower.includes(u.name.split(" ")[0].toLowerCase()));
  if (performers.length) {
    el.taskAssignee.value = performer ? performer.id : performers[0].id;
  }
}

function renderApp() {
  const user = STATE.currentUser;
  el.userBadge.textContent = `Пользователь: ${user.name} (${user.role === "manager" ? "руководитель" : "исполнитель"})`;
  el.roleSwitchSelect.value = user.id;
  el.quickCreateScreen.classList.toggle("hidden", user.role !== "manager");
  el.tasksTitle.textContent = user.role === "manager" ? "Список задач руководителя" : "Мои задачи";
  if (user.role === "manager") updateInviteHint();
  renderTaskList();
  renderTaskDetails();
}

function switchRole() {
  const userId = el.roleSwitchSelect.value;
  const user = getAllUsers().find((candidate) => candidate.id === userId);
  if (!user) return;
  STATE.currentUser = user;
  STATE.selectedTaskId = null;
  updateInviteInUrl(user.token);
  if (user.role === "manager") fillSelects();
  renderApp();
}

function updateInviteInUrl(token) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("invite", token);
  window.history.replaceState({}, "", nextUrl.toString());
}

function visibleTasksForUser() {
  const user = STATE.currentUser;
  if (user.role === "manager") return STATE.tasks;
  return STATE.tasks.filter(
    (task) =>
      task.currentAssigneeId === user.id ||
      task.history.some((entry) => entry.message.includes(user.name)),
  );
}

function renderTaskList() {
  const tasks = visibleTasksForUser().filter((task) => {
    if (STATE.filter === "completed") return task.status === "completed";
    if (STATE.filter === "cancelled") return task.status === "cancelled";
    return task.status !== "completed" && task.status !== "cancelled";
  });

  el.tasksList.innerHTML = "";
  if (!tasks.length) {
    el.tasksList.innerHTML = "<li class='task-meta'>Нет задач по выбранному фильтру.</li>";
    return;
  }
  tasks.forEach((task) => {
    const item = el.taskItemTemplate.content.firstElementChild.cloneNode(true);
    const openBtn = item.querySelector(".task-open");
    const meta = item.querySelector(".task-meta");
    openBtn.textContent = task.text;
    openBtn.addEventListener("click", () => {
      STATE.selectedTaskId = task.id;
      renderTaskDetails();
    });
    meta.textContent = `Тема: ${task.topic} | Исполнитель: ${resolveUserName(task.currentAssigneeId)} | Статус: ${task.status}`;
    el.tasksList.appendChild(item);
  });
}

function renderTaskDetails() {
  const task = STATE.tasks.find((t) => t.id === STATE.selectedTaskId);
  if (!task) {
    el.taskDetails.className = "details empty";
    el.taskDetails.textContent = "Выберите задачу из списка.";
    return;
  }
  el.taskDetails.className = "details";
  const historyItems = task.history
    .map((entry) => `<li>${formatDate(entry.at)} - ${escapeHtml(entry.message)}</li>`)
    .join("");
  el.taskDetails.innerHTML = `
    <div class="details-grid">
      <div><b>Текст:</b> ${escapeHtml(task.text)}</div>
      <div><b>Тема:</b> ${escapeHtml(task.topic)}</div>
      <div><b>Инициатор:</b> ${escapeHtml(resolveUserName(task.managerId))}</div>
      <div><b>Текущий исполнитель:</b> ${escapeHtml(resolveUserName(task.currentAssigneeId))}</div>
      <div><b>Статус:</b> ${escapeHtml(task.status)}</div>
      <div><b>История:</b><ol class="history-list">${historyItems}</ol></div>
    </div>
    <div class="details-actions" id="details-actions"></div>
  `;
  renderActionsForTask(task);
}

function renderActionsForTask(task) {
  const actionsHost = document.getElementById("details-actions");
  if (!actionsHost) return;
  const user = STATE.currentUser;

  if (user.role === "manager" && task.status !== "cancelled") {
    const cancelButton = document.createElement("button");
    cancelButton.className = "danger";
    cancelButton.textContent = "Отменить задачу";
    cancelButton.addEventListener("click", () => cancelTask(task.id));
    actionsHost.appendChild(cancelButton);
  }

  if (user.role === "performer" && task.status !== "cancelled") {
    const markWork = document.createElement("button");
    markWork.textContent = "В работе";
    markWork.addEventListener("click", () => updateStatus(task.id, "in_progress"));
    actionsHost.appendChild(markWork);

    const markDone = document.createElement("button");
    markDone.textContent = "Выполнено";
    markDone.addEventListener("click", () => updateStatus(task.id, "completed"));
    actionsHost.appendChild(markDone);

    const others = getPerformers().filter((p) => p.id !== task.currentAssigneeId);
    if (!others.length) {
      const note = document.createElement("p");
      note.className = "task-meta";
      note.textContent = "Нет других исполнителей для передачи задачи.";
      actionsHost.appendChild(note);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "delegate-row";
      const lab = document.createElement("label");
      lab.textContent = "Передать задачу";
      lab.setAttribute("for", `delegate-select-${task.id}`);
      const sel = document.createElement("select");
      sel.id = `delegate-select-${task.id}`;
      others.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Передать";
      btn.addEventListener("click", () => performDelegate(task.id, sel.value));
      wrap.appendChild(lab);
      wrap.appendChild(sel);
      wrap.appendChild(btn);
      actionsHost.appendChild(wrap);
    }
  }
}

function performDelegate(taskId, newAssigneeId) {
  const task = STATE.tasks.find((t) => t.id === taskId);
  if (!task || STATE.currentUser.role !== "performer") return;
  const target = getPerformers().find((p) => p.id === newAssigneeId);
  if (!target || target.id === task.currentAssigneeId) {
    showMessage("Выберите другого исполнителя.", "error");
    return;
  }
  task.currentAssigneeId = target.id;
  task.history.unshift({
    type: "delegated",
    byUserId: STATE.currentUser.id,
    at: new Date().toISOString(),
    message: `Делегировано исполнителю: ${target.name}`,
  });
  saveTasks();
  showMessage(`Задача передана: ${target.name}`, "info");
  renderApp();
}

function cancelTask(taskId) {
  const task = STATE.tasks.find((t) => t.id === taskId);
  if (!task || STATE.currentUser.role !== "manager") return;
  task.status = "cancelled";
  task.history.unshift({
    type: "cancelled",
    byUserId: STATE.currentUser.id,
    at: new Date().toISOString(),
    message: "Задача отменена руководителем",
  });
  saveTasks();
  renderApp();
}

function updateStatus(taskId, status) {
  const task = STATE.tasks.find((t) => t.id === taskId);
  if (!task || STATE.currentUser.role !== "performer") return;
  const statusLabel = status === "completed" ? "выполнено" : "в работе";
  task.status = status;
  task.history.unshift({
    type: "status",
    byUserId: STATE.currentUser.id,
    at: new Date().toISOString(),
    message: `Статус обновлен: ${statusLabel}`,
  });
  saveTasks();
  renderApp();
}

function resolveUserName(userId) {
  const user = getAllUsers().find((u) => u.id === userId);
  return user ? user.name : "Неизвестный";
}

function loadTasks() {
  const raw = localStorage.getItem(APP_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(STATE.tasks));
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("ru-RU");
  } catch {
    return iso;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
