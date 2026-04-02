import { MANAGER } from "./src/config.js";
import { loadCatalog, saveCatalog, loadTasks, saveTasks } from "./src/storage.js";
import {
  getPerformers,
  getAllUsers,
  resolveUserFromInvite,
  resolveUserName,
  visibleTasksForUser,
  addTopic,
  removeTopic,
  addPerformer,
  removePerformer,
  createTask,
  cancelTask,
  updateTaskStatus,
  delegateTask,
  pickTopicAndAssignee,
} from "./src/domain.js";

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
  STATE.tasks = loadTasks();
  STATE.currentUser = resolveUserFromInvite(STATE, window.location.search);
  renderSelects();
  renderRoleSwitcher();
  bindEvents();
  renderApp();
}

function bindEvents() {
  el.sendTaskBtn.addEventListener("click", onCreateTask);
  el.recordBtn.addEventListener("click", onStartVoiceRecognition);
  el.roleSwitchBtn.addEventListener("click", onSwitchRole);
  el.topicPlus.addEventListener("click", onAddTopic);
  el.topicMinus.addEventListener("click", onRemoveTopic);
  el.performerPlus.addEventListener("click", onAddPerformer);
  el.performerMinus.addEventListener("click", onRemovePerformer);
  el.taskAssignee.addEventListener("change", updateInviteHint);

  el.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      STATE.filter = button.dataset.filter;
      el.filterButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
      renderTaskList();
    });
  });
}

function onAddTopic() {
  const result = addTopic(STATE, el.newTopicInput.value);
  if (!result.ok) {
    showMessage(result.message, "error");
    return;
  }

  saveCatalog(STATE.catalog);
  el.newTopicInput.value = "";
  renderSelects();
  el.taskTopic.value = result.topic;
  showMessage(result.message, "info");
}

function onRemoveTopic() {
  const result = removeTopic(STATE, el.taskTopic.value);
  if (!result.ok) {
    showMessage(result.message, "error");
    return;
  }

  saveCatalog(STATE.catalog);
  renderSelects();
  showMessage(result.message, "info");
}

function onAddPerformer() {
  const result = addPerformer(STATE, el.newPerformerInput.value);
  if (!result.ok) {
    showMessage(result.message, "error");
    return;
  }

  saveCatalog(STATE.catalog);
  el.newPerformerInput.value = "";
  renderSelects();
  renderRoleSwitcher();
  el.taskAssignee.value = result.performerId;
  updateInviteHint();
  showMessage(result.message, "info");
}

function onRemovePerformer() {
  const performerId = el.taskAssignee.value;
  const result = removePerformer(STATE, performerId);
  if (!result.ok) {
    showMessage(result.message, "error");
    return;
  }

  saveCatalog(STATE.catalog);
  renderSelects();
  renderRoleSwitcher();

  if (result.switchedToManager) {
    updateInviteInUrl(MANAGER.token);
  }

  renderApp();
  showMessage(result.message, "info");
}

function onCreateTask() {
  if (STATE.currentUser.role !== "manager") return;
  if (!getPerformers(STATE).length) {
    showMessage("Добавьте хотя бы одного исполнителя.", "error");
    return;
  }

  const result = createTask(STATE, {
    text: el.taskText.value,
    topic: el.taskTopic.value,
    assigneeId: el.taskAssignee.value,
  });
  if (!result.ok) {
    showMessage(result.message, "error");
    return;
  }

  saveTasks(STATE.tasks);
  el.taskText.value = "";
  renderApp();
}

function onSwitchRole() {
  const user = getAllUsers(STATE).find((candidate) => candidate.id === el.roleSwitchSelect.value);
  if (!user) return;

  STATE.currentUser = user;
  STATE.selectedTaskId = null;
  updateInviteInUrl(user.token);
  renderApp();
}

function onStartVoiceRecognition() {
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
    const auto = pickTopicAndAssignee(STATE.catalog, transcript);
    if (auto.topic) el.taskTopic.value = auto.topic;
    if (auto.assigneeId) el.taskAssignee.value = auto.assigneeId;
    updateInviteHint();
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

function updateInviteHint() {
  if (STATE.currentUser.role !== "manager") {
    el.assigneeInviteHint.textContent = "";
    return;
  }
  const performer = getPerformers(STATE).find((candidate) => candidate.id === el.taskAssignee.value);
  el.assigneeInviteHint.textContent = performer ? `Ссылка исполнителя: ?invite=${performer.token}` : "";
}

function renderSelects() {
  const previousTopic = el.taskTopic.value;
  const previousAssignee = el.taskAssignee.value;
  const topics = STATE.catalog.topics;
  const performers = getPerformers(STATE);

  el.taskTopic.innerHTML = topics.map((topic) => `<option value="${escapeAttr(topic)}">${escapeHtml(topic)}</option>`).join("");
  el.taskAssignee.innerHTML = performers
    .map((performer) => `<option value="${escapeAttr(performer.id)}">${escapeHtml(performer.name)}</option>`)
    .join("");

  if (topics.includes(previousTopic)) el.taskTopic.value = previousTopic;
  else if (topics.length) el.taskTopic.value = topics[0];

  if (performers.some((performer) => performer.id === previousAssignee)) el.taskAssignee.value = previousAssignee;
  else if (performers.length) el.taskAssignee.value = performers[0].id;

  updateInviteHint();
}

function renderRoleSwitcher() {
  el.roleSwitchSelect.innerHTML = getAllUsers(STATE)
    .map(
      (user) =>
        `<option value="${escapeAttr(user.id)}">${escapeHtml(user.name)} (${user.role === "manager" ? "руководитель" : "исполнитель"})</option>`,
    )
    .join("");
}

function renderApp() {
  const roleLabel = STATE.currentUser.role === "manager" ? "руководитель" : "исполнитель";
  el.userBadge.textContent = `Пользователь: ${STATE.currentUser.name} (${roleLabel})`;
  el.roleSwitchSelect.value = STATE.currentUser.id;
  el.quickCreateScreen.classList.toggle("hidden", STATE.currentUser.role !== "manager");
  el.tasksTitle.textContent = STATE.currentUser.role === "manager" ? "Список задач руководителя" : "Мои задачи";
  updateInviteHint();
  renderTaskList();
  renderTaskDetails();
}

function renderTaskList() {
  const tasks = visibleTasksForUser(STATE).filter((task) => {
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
    const openButton = item.querySelector(".task-open");
    const meta = item.querySelector(".task-meta");

    openButton.textContent = task.text;
    openButton.addEventListener("click", () => {
      STATE.selectedTaskId = task.id;
      renderTaskDetails();
    });
    meta.textContent = `Тема: ${task.topic} | Исполнитель: ${resolveUserName(STATE, task.currentAssigneeId)} | Статус: ${task.status}`;
    el.tasksList.appendChild(item);
  });
}

function renderTaskDetails() {
  const task = STATE.tasks.find((candidate) => candidate.id === STATE.selectedTaskId);
  if (!task) {
    el.taskDetails.className = "details empty";
    el.taskDetails.textContent = "Выберите задачу из списка.";
    return;
  }

  const historyItems = task.history
    .map((entry) => `<li>${formatDate(entry.at)} - ${escapeHtml(entry.message)}</li>`)
    .join("");

  el.taskDetails.className = "details";
  el.taskDetails.innerHTML = `
    <div class="details-grid">
      <div><b>Текст:</b> ${escapeHtml(task.text)}</div>
      <div><b>Тема:</b> ${escapeHtml(task.topic)}</div>
      <div><b>Инициатор:</b> ${escapeHtml(resolveUserName(STATE, task.managerId))}</div>
      <div><b>Текущий исполнитель:</b> ${escapeHtml(resolveUserName(STATE, task.currentAssigneeId))}</div>
      <div><b>Статус:</b> ${escapeHtml(task.status)}</div>
      <div><b>История:</b><ol class="history-list">${historyItems}</ol></div>
    </div>
    <div class="details-actions" id="details-actions"></div>
  `;

  renderTaskActions(task);
}

function renderTaskActions(task) {
  const host = document.getElementById("details-actions");
  if (!host) return;

  if (STATE.currentUser.role === "manager" && task.status !== "cancelled" && task.status !== "completed") {
    const cancelButton = document.createElement("button");
    cancelButton.className = "danger";
    cancelButton.textContent = "Отменить задачу";
    cancelButton.addEventListener("click", () => {
      cancelTask(STATE, task.id);
      saveTasks(STATE.tasks);
      renderApp();
    });
    host.appendChild(cancelButton);
  }

  if (STATE.currentUser.role === "performer" && task.status !== "cancelled") {
    const progressButton = document.createElement("button");
    progressButton.textContent = "В работе";
    progressButton.addEventListener("click", () => {
      updateTaskStatus(STATE, task.id, "in_progress");
      saveTasks(STATE.tasks);
      renderApp();
    });
    host.appendChild(progressButton);

    const completedButton = document.createElement("button");
    completedButton.textContent = "Выполнено";
    completedButton.addEventListener("click", () => {
      updateTaskStatus(STATE, task.id, "completed");
      saveTasks(STATE.tasks);
      renderApp();
    });
    host.appendChild(completedButton);

    const others = getPerformers(STATE).filter((performer) => performer.id !== task.currentAssigneeId);
    if (!others.length) {
      const note = document.createElement("p");
      note.className = "task-meta";
      note.textContent = "Нет других исполнителей для передачи задачи.";
      host.appendChild(note);
    } else {
      const wrapper = document.createElement("div");
      wrapper.className = "delegate-row";

      const label = document.createElement("label");
      label.textContent = "Передать задачу";
      label.setAttribute("for", `delegate-select-${task.id}`);

      const select = document.createElement("select");
      select.id = `delegate-select-${task.id}`;
      others.forEach((performer) => {
        const option = document.createElement("option");
        option.value = performer.id;
        option.textContent = performer.name;
        select.appendChild(option);
      });

      const submitButton = document.createElement("button");
      submitButton.type = "button";
      submitButton.textContent = "Передать";
      submitButton.addEventListener("click", () => {
        const result = delegateTask(STATE, task.id, select.value);
        if (!result.ok) {
          showMessage(result.message, "error");
          return;
        }
        saveTasks(STATE.tasks);
        showMessage(result.message, "info");
        renderApp();
      });

      wrapper.appendChild(label);
      wrapper.appendChild(select);
      wrapper.appendChild(submitButton);
      host.appendChild(wrapper);
    }
  }
}

function updateInviteInUrl(token) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("invite", token);
  window.history.replaceState({}, "", nextUrl.toString());
}

function showMessage(text, type = "error") {
  clearTimeout(messageTimer);
  el.appMessages.innerHTML = "";
  const message = document.createElement("div");
  message.className = `message message-${type}`;
  message.textContent = text;
  el.appMessages.appendChild(message);

  messageTimer = setTimeout(() => {
    el.appMessages.innerHTML = "";
  }, 8000);
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
