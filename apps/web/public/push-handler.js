/* eslint-env serviceworker */
/* global self, clients */

/**
 * Push handler injetado no Service Worker via workbox.importScripts em vite.config.js.
 *
 * Recebe payload JSON do tipo:
 *   { title, body, icon?, tag?, url?, data? }
 *
 * Mostra notificacao nativa do SO. Ao clicar, abre/foca a aba do app na URL alvo.
 */

self.addEventListener("push", (event) => {
  let payload = {
    title: "BotFinanceiro",
    body: "Novo evento de mercado",
  };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: "BotFinanceiro", body: event.data.text() };
    }
  }

  const title = typeof payload.title === "string" ? payload.title : "BotFinanceiro";
  const body = typeof payload.body === "string" ? payload.body : "Novo evento de mercado";
  const icon = typeof payload.icon === "string" ? payload.icon : "/pwa-icon.svg";
  const tag = typeof payload.tag === "string" ? payload.tag : "botfinanceiro-default";
  const url = typeof payload.url === "string" ? payload.url : "/";
  const data = typeof payload.data === "object" && payload.data !== null ? payload.data : {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      tag,
      renotify: true,
      requireInteraction: false,
      data: { url, ...data },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    event.notification.data && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client && client.url !== targetUrl) {
            client.navigate(targetUrl);
          }
          return undefined;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
