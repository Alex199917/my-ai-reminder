self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {title:"🔔 My Reminder",body:"You have a reminder."};
  event.waitUntil(self.registration.showNotification(data.title, {
    body:data.body,
    icon:"/icon.svg",
    badge:"/icon.svg",
    data:{url:data.url||"/"}
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || "/"));
});