import {
  APP_STORAGE_KEY,
  CATALOG_STORAGE_KEY,
  DEFAULT_TOPICS,
  DEFAULT_PERFORMERS,
} from "./config.js";

export function loadCatalog() {
  const raw = localStorage.getItem(CATALOG_STORAGE_KEY);
  if (!raw) {
    return {
      topics: [...DEFAULT_TOPICS],
      performers: DEFAULT_PERFORMERS.map((performer) => ({ ...performer })),
    };
  }

  try {
    const parsed = JSON.parse(raw);
    const topics =
      Array.isArray(parsed.topics) && parsed.topics.length
        ? parsed.topics
        : [...DEFAULT_TOPICS];
    const performers =
      Array.isArray(parsed.performers) && parsed.performers.length
        ? parsed.performers.map((performer) => ({
            id: performer.id,
            name: performer.name,
            token: performer.token,
          }))
        : DEFAULT_PERFORMERS.map((performer) => ({ ...performer }));
    return { topics, performers };
  } catch {
    return {
      topics: [...DEFAULT_TOPICS],
      performers: DEFAULT_PERFORMERS.map((performer) => ({ ...performer })),
    };
  }
}

export function saveCatalog(catalog) {
  localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
}

export function loadTasks() {
  const raw = localStorage.getItem(APP_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTasks(tasks) {
  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(tasks));
}
