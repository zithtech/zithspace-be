const fs = require('fs');

const b64 = fs.readFileSync('c:/Users/Bharathi-Zithtech/Desktop/zithspace1/zithspace-fe/public/smallLogo.png').toString('base64');
const dataUri = 'data:image/png;base64,' + b64;

const swContent = `// Embedded Base64 Zukvo logo
const ZUKVO_LOGO_BASE64 = "${dataUri}";

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    
    // Ensure title has Zukvo branding
    let title = data.title || 'Zukvo';
    if (!title.toLowerCase().includes('zukvo')) {
      title = \`Zukvo - \${title}\`;
    }

    // Append the company website link/info and origin text to the body
    const displayBody = data.body 
      ? \`\${data.body}\\n\\nThis notification is coming from Zukvo (zukvo.in)\` 
      : 'This notification is coming from Zukvo (zukvo.in)';

    const options = {
      body: displayBody,
      icon: ZUKVO_LOGO_BASE64,
      badge: ZUKVO_LOGO_BASE64,
      image: ZUKVO_LOGO_BASE64,
      data: {
        url: data.url || '/'
      }
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (error) {
    console.error('[Service Worker] Error parsing push event payload:', error);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const targetUrl = event.notification.data?.url || '/';

      // If a tab is already open with our URL, focus it
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }

      // If no tab is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
`;

fs.writeFileSync('c:/Users/Bharathi-Zithtech/Desktop/zithspace1/zithspace-fe/public/sw.js', swContent);
console.log('✅ Service worker generated successfully with embedded logo!');
