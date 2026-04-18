/**
 * Controller de Web Push notifications no frontend.
 *
 * Fluxo:
 * 1. Detecta suporte (`Notification`, `PushManager`, Service Worker registrado).
 * 2. Busca chave VAPID publica em `/v1/notifications/vapid-public-key`.
 * 3. Solicita permissao ao usuario, gera subscription do browser via
 *    `registration.pushManager.subscribe`, envia ao backend
 *    (`POST /v1/notifications/subscribe`).
 * 4. Atualiza UI (botao toggle) refletindo o estado atual.
 *
 * Failure-open: qualquer falha (sem suporte, sem chave VAPID, permissao negada)
 * apenas esconde o botao silenciosamente — nao quebra a aplicacao.
 */

const STATE = {
  DEFAULT: "default",
  SUBSCRIBED: "subscribed",
  DENIED: "denied",
  UNSUPPORTED: "unsupported",
};

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function setButtonState(button, state) {
  if (!(button instanceof HTMLElement)) {
    return;
  }
  button.dataset.state = state;
  const labelElement = button.querySelector(".push-toggle-btn__label");
  if (state === STATE.UNSUPPORTED) {
    button.classList.add("is-hidden");
    return;
  }
  button.classList.remove("is-hidden");
  if (!labelElement) {
    return;
  }
  if (state === STATE.SUBSCRIBED) {
    labelElement.textContent = "Alertas ativos";
  } else if (state === STATE.DENIED) {
    labelElement.textContent = "Alertas bloqueados";
  } else {
    labelElement.textContent = "Ativar alertas";
  }
}

async function fetchVapidPublicKey() {
  const response = await fetch("/v1/notifications/vapid-public-key", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`vapid_fetch_failed_${response.status}`);
  }
  const json = await response.json();
  if (!json || !json.data || typeof json.data.publicKey !== "string") {
    throw new Error("vapid_invalid_response");
  }
  return json.data.publicKey;
}

async function postSubscription(subscription) {
  const response = await fetch("/v1/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) {
    throw new Error(`subscribe_failed_${response.status}`);
  }
}

async function postUnsubscription(endpoint) {
  await fetch("/v1/notifications/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

async function ensureRegistration() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  return registration;
}

async function refreshButtonState(button) {
  if (!isPushSupported()) {
    setButtonState(button, STATE.UNSUPPORTED);
    return;
  }
  if (Notification.permission === "denied") {
    setButtonState(button, STATE.DENIED);
    return;
  }
  const registration = await ensureRegistration();
  if (!registration) {
    setButtonState(button, STATE.UNSUPPORTED);
    return;
  }
  const existing = await registration.pushManager.getSubscription();
  setButtonState(button, existing ? STATE.SUBSCRIBED : STATE.DEFAULT);
}

async function activate(button) {
  if (Notification.permission === "denied") {
    setButtonState(button, STATE.DENIED);
    return;
  }
  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    setButtonState(button, permission === "denied" ? STATE.DENIED : STATE.DEFAULT);
    return;
  }

  const registration = await ensureRegistration();
  if (!registration) {
    setButtonState(button, STATE.UNSUPPORTED);
    return;
  }

  let publicKey;
  try {
    publicKey = await fetchVapidPublicKey();
  } catch {
    setButtonState(button, STATE.UNSUPPORTED);
    return;
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  try {
    await postSubscription(subscription);
    setButtonState(button, STATE.SUBSCRIBED);
  } catch {
    setButtonState(button, STATE.DEFAULT);
  }
}

async function deactivate(button) {
  const registration = await ensureRegistration();
  if (!registration) {
    return;
  }
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    try {
      await postUnsubscription(subscription.endpoint);
    } catch {
      /* failure-open: ignora erro de rede ao deslogar */
    }
    await subscription.unsubscribe();
  }
  setButtonState(button, STATE.DEFAULT);
}

export function initPushNotifications() {
  const button = document.querySelector("#push-notifications-toggle");
  if (!button) {
    return;
  }
  if (!isPushSupported()) {
    setButtonState(button, STATE.UNSUPPORTED);
    return;
  }

  button.addEventListener("click", async () => {
    if (button.dataset.state === STATE.SUBSCRIBED) {
      await deactivate(button);
      return;
    }
    if (button.dataset.state === STATE.DENIED) {
      return;
    }
    await activate(button);
  });

  void refreshButtonState(button);
}
