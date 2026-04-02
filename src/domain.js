import { MANAGER } from "./config.js";

export function getPerformers(state) {
  return state.catalog.performers;
}

export function getAllUsers(state) {
  return [MANAGER, ...getPerformers(state).map((performer) => ({ ...performer, role: "performer" }))];
}

export function resolveUserFromInvite(state, search) {
  const params = new URLSearchParams(search);
  const token = params.get("invite");
  const matched = getAllUsers(state).find((user) => user.token === token);
  return matched || MANAGER;
}

export function resolveUserName(state, userId) {
  const user = getAllUsers(state).find((candidate) => candidate.id === userId);
  return user ? user.name : "Неизвестный";
}

export function visibleTasksForUser(state) {
  if (state.currentUser.role === "manager") return state.tasks;
  return state.tasks.filter(
    (task) =>
      task.currentAssigneeId === state.currentUser.id ||
      task.history.some((entry) => entry.message.includes(state.currentUser.name)),
  );
}

export function addTopic(state, text) {
  const value = text.trim();
  if (!value) return { ok: false, message: "Введите текст темы." };
  if (state.catalog.topics.includes(value)) return { ok: false, message: "Такая тема уже есть." };

  state.catalog.topics.push(value);
  return { ok: true, message: "Тема добавлена.", topic: value };
}

export function removeTopic(state, topic) {
  if (!topic) return { ok: false, message: "Выберите тему." };
  if (state.tasks.some((task) => task.topic === topic)) {
    return { ok: false, message: "Эту тему нельзя удалить: есть задачи с этой темой." };
  }
  if (state.catalog.topics.length <= 1) return { ok: false, message: "Должна остаться хотя бы одна тема." };

  const index = state.catalog.topics.indexOf(topic);
  if (index === -1) return { ok: false, message: "Тема не найдена." };
  state.catalog.topics.splice(index, 1);
  return { ok: true, message: "Тема удалена." };
}

export function addPerformer(state, name) {
  const value = name.trim();
  if (!value) return { ok: false, message: "Введите ФИО исполнителя." };

  const id = `perf_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const token = `inv-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  state.catalog.performers.push({ id, name: value, token });
  return { ok: true, message: `Исполнитель добавлен. Ссылка: ?invite=${token}`, performerId: id };
}

export function removePerformer(state, performerId) {
  if (!performerId) return { ok: false, message: "Выберите исполнителя." };
  if (state.tasks.some((task) => task.currentAssigneeId === performerId)) {
    return { ok: false, message: "Нельзя удалить исполнителя: есть активные задачи на него." };
  }
  if (state.catalog.performers.length <= 1) {
    return { ok: false, message: "Должен остаться хотя бы один исполнитель." };
  }

  state.catalog.performers = state.catalog.performers.filter((performer) => performer.id !== performerId);
  const switchedToManager = state.currentUser.id === performerId;
  if (switchedToManager) {
    state.currentUser = MANAGER;
  }
  return { ok: true, message: "Исполнитель удалён.", switchedToManager };
}

export function createTask(state, payload) {
  const text = payload.text.trim();
  if (!text) return { ok: false, message: "Введите или продиктуйте текст задачи." };
  if (!payload.assigneeId) return { ok: false, message: "Выберите исполнителя." };

  const now = new Date().toISOString();
  const task = {
    id: crypto.randomUUID(),
    text,
    topic: payload.topic,
    managerId: state.currentUser.id,
    currentAssigneeId: payload.assigneeId,
    status: "new",
    history: [
      {
        type: "created",
        byUserId: state.currentUser.id,
        at: now,
        message: `Задача создана и назначена: ${resolveUserName(state, payload.assigneeId)}`,
      },
    ],
  };

  state.tasks.unshift(task);
  return { ok: true };
}

export function cancelTask(state, taskId) {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task || state.currentUser.role !== "manager") return;
  if (task.status === "completed" || task.status === "cancelled") return;
  task.status = "cancelled";
  task.history.unshift({
    type: "cancelled",
    byUserId: state.currentUser.id,
    at: new Date().toISOString(),
    message: "Задача отменена руководителем",
  });
}

export function updateTaskStatus(state, taskId, status) {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task || state.currentUser.role !== "performer") return;
  const statusLabel = status === "completed" ? "выполнено" : "в работе";
  task.status = status;
  task.history.unshift({
    type: "status",
    byUserId: state.currentUser.id,
    at: new Date().toISOString(),
    message: `Статус обновлен: ${statusLabel}`,
  });
}

export function delegateTask(state, taskId, newAssigneeId) {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task || state.currentUser.role !== "performer") {
    return { ok: false, message: "Делегирование недоступно." };
  }

  const target = getPerformers(state).find((performer) => performer.id === newAssigneeId);
  if (!target || target.id === task.currentAssigneeId) {
    return { ok: false, message: "Выберите другого исполнителя." };
  }

  task.currentAssigneeId = target.id;
  task.history.unshift({
    type: "delegated",
    byUserId: state.currentUser.id,
    at: new Date().toISOString(),
    message: `Делегировано исполнителю: ${target.name}`,
  });
  return { ok: true, message: `Задача передана: ${target.name}` };
}

export function pickTopicAndAssignee(catalog, text) {
  const topics = catalog.topics;
  const performers = catalog.performers;
  if (!topics.length) return { topic: "", assigneeId: performers[0]?.id || "" };

  const lower = text.toLowerCase();
  let topic = topics[0];
  if (topics[1] && (lower.includes("трактар") || lower.includes("мотор"))) topic = topics[1];
  if (topics[2] && lower.includes("посе")) topic = topics[2];
  if (topics[3] && (lower.includes("двер") || lower.includes("иных земель"))) topic = topics[3];
  if (topics[0] && (lower.includes("навоз") || lower.includes("скот"))) topic = topics[0];

  const performer = performers.find((candidate) => lower.includes(candidate.name.split(" ")[0].toLowerCase()));
  return { topic, assigneeId: performer ? performer.id : performers[0]?.id || "" };
}
