import { createCounter } from "@botfinanceiro/shared-utils";

const STATUS_LIVE = "live";
const STATUS_RECONNECTING = "reconnecting";
const STATUS_OFFLINE = "offline";

const ALLOWED_STATUSES = new Set([STATUS_LIVE, STATUS_RECONNECTING, STATUS_OFFLINE]);

const STATUS_LABELS = {
  [STATUS_LIVE]: "LIVE MARKET",
  [STATUS_RECONNECTING]: "RECONNECTING…",
  [STATUS_OFFLINE]: "OFFLINE",
};

const STATUS_CLASSES = {
  [STATUS_LIVE]: "live-status--live",
  [STATUS_RECONNECTING]: "live-status--reconnecting",
  [STATUS_OFFLINE]: "live-status--offline",
};

const transitionCounter = createCounter();

function normalizeStatus(status) {
  return ALLOWED_STATUSES.has(status) ? status : STATUS_OFFLINE;
}

function ensureMarkup(element) {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  if (element.dataset.liveStatusReady === "true") {
    return element;
  }

  element.classList.add("live-status");
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.innerHTML =
    '<span class="live-status__dot" aria-hidden="true"></span>' +
    '<span class="live-status__label"></span>';
  element.dataset.liveStatusReady = "true";

  return element;
}

export function setLiveStatus(element, status, options) {
  const target = ensureMarkup(element);

  if (!target) {
    return;
  }

  const normalized = normalizeStatus(status);
  const previous = target.dataset.liveStatus ?? "";

  if (previous === normalized) {
    return;
  }

  for (const className of Object.values(STATUS_CLASSES)) {
    target.classList.remove(className);
  }

  target.classList.add(STATUS_CLASSES[normalized]);
  target.dataset.liveStatus = normalized;

  const labelElement = target.querySelector(".live-status__label");

  if (labelElement instanceof HTMLElement) {
    const customLabel = options && typeof options.label === "string" ? options.label : "";
    labelElement.textContent = customLabel.length > 0 ? customLabel : STATUS_LABELS[normalized];
  }

  if (options && typeof options.title === "string") {
    target.setAttribute("title", options.title);
  } else {
    target.removeAttribute("title");
  }

  transitionCounter.increment(`${previous || "init"}->${normalized}`);
}

export function getLiveStatusSnapshot() {
  return transitionCounter.snapshot();
}

export function resetLiveStatusCounter() {
  transitionCounter.reset();
}

export const LIVE_STATUS = Object.freeze({
  LIVE: STATUS_LIVE,
  RECONNECTING: STATUS_RECONNECTING,
  OFFLINE: STATUS_OFFLINE,
});
