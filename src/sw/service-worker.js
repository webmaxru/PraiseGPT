/* eslint-disable no-undef */
/* eslint-disable no-restricted-globals */
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { setCacheNameDetails, clientsClaim } from 'workbox-core';
import { NetworkOnly } from 'workbox-strategies';
import { googleFontsCache } from 'workbox-recipes';
import { BackgroundSyncPlugin } from 'workbox-background-sync';
import * as googleAnalytics from 'workbox-google-analytics';
import { offlineFallback } from 'workbox-recipes';
import { setDefaultHandler } from 'workbox-routing';

const openWindow = (url) => {
  return clients
    .openWindow(url)
    .then((windowClient) => {
      console.log('[Service Worker]: Opened window', windowClient);
      return windowClient;
    })
    .catch((error) => {
      console.error('[Service Worker]: Error opening window', error);
      throw new Error(error);
    });
};

async function messageClient(event, messageType, data = {}) {
  console.log('[Service Worker]: Sending message to app', messageType);

  let message = {
    type: messageType,
    data: data,
  };

  if (!event.clientId) {
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      client.postMessage(message);
      console.log('[Service Worker]: Sent message to app', client);
    }
  } else {
    const client = await clients.get(event.clientId);
    if (!client) return;

    client.postMessage(message);
    console.log('[Service Worker]: Sent message to app', client);
  }
}

// SETTINGS

// Claiming control to start runtime caching asap
self.skipWaiting();
clientsClaim();

// Setting custom cache names
setCacheNameDetails({ precache: 'wb6-precache', runtime: 'wb6-runtime' });

// PRECACHING

// Precache and serve resources from __WB_MANIFEST array
//precacheAndRoute(self.__WB_MANIFEST);

// NAVIGATION ROUTING

// This assumes /index.html has been precached.

/* const navHandler = createHandlerBoundToURL('/index.html');
const navigationRoute = new NavigationRoute(navHandler, {
  denylist: [
    new RegExp('/account'),
    new RegExp('/admin'),
    new RegExp('/login'),
    new RegExp('/logout'),
    new RegExp('/.auth'),
    new RegExp('/400.html'),
    new RegExp('/404.html'),
    new RegExp('/privacy.html'),
  ], // Also might be specified explicitly via allowlist
});
registerRoute(navigationRoute); */

// OFFLINE FALLBACK

setDefaultHandler(new NetworkOnly());
offlineFallback();

// STATIC RESOURCES

googleFontsCache({ cachePrefix: 'wb6-gfonts' });

// APP SHELL UPDATE FLOW

addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// BACKGROUND SYNC

const messageAboutFailPlugin = {
  fetchDidFail: async ({ originalRequest, request, error, event, state }) => {
    messageClient(event, 'REQUEST_FAILED');
  },
};

// Instantiating and configuring plugin
const bgSyncPlugin = new BackgroundSyncPlugin('apiQueue', {
  maxRetentionTime: 24 * 60, // Retry for max of 24 Hours (specified in minutes)

  onSync: async ({ queue }) => {
    // Run standard replay
    await queue.replayRequests();

    self.clients.matchAll().then((clients) => {
      clients.forEach((client) =>
        client.postMessage({ type: 'REPLAY_COMPLETED' })
      );
    });
  },
});

// Registering a route for retries
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkOnly({
    plugins: [bgSyncPlugin, messageAboutFailPlugin],
  }),
  'POST'
);

// ALL OTHER EVENTS

// Receive push and show a notification
self.addEventListener('push', (event) => {
  console.log('[Service Worker]: Received push event', event);

  let notificationData = {};

  try {
    notificationData = event.data.json();
  } catch (error) {
    console.error('[Service Worker]: Error parsing notification data', error);
    notificationData = {
      title: 'No data from server',
    };
  }

  console.log('[Service Worker]: notificationData', notificationData);

  const showNotificationPromise = self.registration.showNotification(
    notificationData.title,
    notificationData
  );

  event.waitUntil(showNotificationPromise);
});

// Custom notification actions
self.addEventListener('notificationclick', (event) => {
  console.log(
    '[Service Worker]: Received notificationclick event',
    event.notification
  );

  try {
    let notification = event.notification;

    if (event.action == 'open_url') {
      console.log('[Service Worker]: Performing action open_project_repo');

      event.waitUntil(clients.openWindow(notification.data.action.url));

      return;
    }
  } catch (error) {
    console.error('[Service Worker]: Error parsing notification data', error);
  }

  console.log('[Service Worker]: Performing default click action');

  // This looks to see if the current is already open and
  // focuses if it is
  event.waitUntil(
    clients
      .matchAll({
        includeUncontrolled: true,
        type: 'window',
      })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url == '/' && 'focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow('/');
      })
  );

  event.notification.close();
});

// Closing notification action
self.addEventListener('notificationclose', (event) => {
  console.log(
    '[Service Worker]: Received notificationclose event',
    event.notification
  );
});


googleAnalytics.initialize();
