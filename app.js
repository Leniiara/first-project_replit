const APP_STORAGE_KEY = "manager-task-v1";

const TOPICS = [
  "убрать навоз крупного скота",
  "заглушить мотор трактара",
  "посееть то, что по итогу пожнешь",
  "открыть двери представителю иных земель",
];

const USERS = [
  { id: "imbitsalov", name: "Имбицалов И.И.", role: "manager", token: "inv-manager-001" },
  { id: "grehovnik", name: "Греховник А.А.", role: "performer", token: "inv-grehovnik-001" },
  { id: "zabiyaka", name: "Забияка В.В", role: "performer", token: "inv-zabiyaka-001" },
  { id: "loshkatova", name: "Лошкатова С.С.", role: "performer", token: "inv-loshkatova-001" },
  { id: "tupankova", name: "Тупанкова Л.Л.", role: "performer", token: "inv-tupankova-001" },
];

const STATE = {
  currentUser: null,
  tasks: [],
  selectedTaskId: null,
  filter: "active",
};

const el = {
  userBadge: document.getElementById("user-badge"),
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
  STATE.currentUser = resolveUserFromInvite();
  STATE.tasks = loadTasks();
  fillSelects();
  bindEvents();
  renderApp();
}

function resolveUserFromInvite() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("invite");
  const matched = USERS.find((u) => u.token === token);
  if (matched) return matched;
  return USERS[0];
}

function fillSelects() {
  el.taskTopic.innerHTML = TOPICS.map((topic) => `<option value="${topic}">${topic}</option>`).join("");
  const performerOptions = USERS.filter((u) => u.role === "performer")
    .map((u) => `<option value="${u.id}">${u.name}</option>`)
    .join("");
  el.taskAssignee.innerHTML = performerOptions;
}

function bindEvents() {
  el.sendTaskBtn.addEventListener("click", createTaskFromForm);
  el.recordBtn.addEventListener("click", startVoiceRecognition);
  el.filterButtons.forEach((btn) =>
    btn.addEventListener("click", () => {
      STATE.filter = btn.dataset.filter;
      el.filterButtons.forEach((b) => b.classList.toggle("active", b === btn));
      renderTaskList();
    }),
  );
}

function createTaskFromForm() {
  if (STATE.currentUser.role !== "manager") return;
  const text = el.taskText.value.trim();
  if (!text) {
    alert("Введите или продиктуйте текст задачи.");
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
    alert("В браузере нет поддержки голосового ввода.");
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
  recognition.onerror = () => {
    el.recordStatus.textContent = "Ошибка распознавания.";
  };
  recognition.onend = () => {
    if (!el.recordStatus.textContent) {
      el.recordStatus.textContent = "Запись завершена.";
    }
  };
}

function autoPickTopicAndAssignee(text) {
  const lower = text.toLowerCase();
  let pickedTopic = TOPICS[0];
  if (lower.includes("трактар") || lower.includes("мотор")) pickedTopic = TOPICS[1];
  if (lower.includes("посе")) pickedTopic = TOPICS[2];
  if (lower.includes("двер") || lower.includes("иных земель")) pickedTopic = TOPICS[3];
  if (lower.includes("навоз") || lower.includes("скот")) pickedTopic = TOPICS[0];
  el.taskTopic.value = pickedTopic;

  const performer = USERS.find(
    (u) => u.role === "performer" && lower.includes(u.name.split(" ")[0].toLowerCase()),
  );
  el.taskAssignee.value = performer ? performer.id : USERS.find((u) => u.role === "performer").id;
}

function renderApp() {
  const user = STATE.currentUser;
  el.userBadge.textContent = `Пользователь: ${user.name} (${user.role === "manager" ? "руководитель" : "исполнитель"})`;
  el.quickCreateScreen.classList.toggle("hidden", user.role !== "manager");
  el.tasksTitle.textContent = user.role === "manager" ? "Список задач руководителя" : "Мои задачи";
  renderTaskList();
  renderTaskDetails();
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
    .map((entry) => `<li>${formatDate(entry.at)} - ${entry.message}</li>`)
    .join("");
  el.taskDetails.innerHTML = `
    <div class="details-grid">
      <div><b>Текст:</b> ${escapeHtml(task.text)}</div>
      <div><b>Тема:</b> ${escapeHtml(task.topic)}</div>
      <div><b>Инициатор:</b> ${resolveUserName(task.managerId)}</div>
      <div><b>Текущий исполнитель:</b> ${resolveUserName(task.currentAssigneeId)}</div>
      <div><b>Статус:</b> ${task.status}</div>
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

    const delegateBtn = document.createElement("button");
    delegateBtn.textContent = "Делегировать";
    delegateBtn.addEventListener("click", () => delegateTask(task.id));
    actionsHost.appendChild(delegateBtn);
  }
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

function delegateTask(taskId) {
  const task = STATE.tasks.find((t) => t.id === taskId);
  if (!task || STATE.currentUser.role !== "performer") return;
  const choices = USERS.filter((u) => u.role === "performer" && u.id !== task.currentAssigneeId);
  const choicesText = choices.map((u, i) => `${i + 1}. ${u.name}`).join("\n");
  const selected = prompt(`Кому делегировать?\n${choicesText}`);
  const index = Number(selected) - 1;
  if (Number.isNaN(index) || !choices[index]) return;
  task.currentAssigneeId = choices[index].id;
  task.history.unshift({
    type: "delegated",
    byUserId: STATE.currentUser.id,
    at: new Date().toISOString(),
    message: `Делегировано исполнителю: ${choices[index].name}`,
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
  const user = USERS.find((u) => u.id === userId);
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
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
