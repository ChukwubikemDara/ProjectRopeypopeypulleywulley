// Play over local Wi-Fi with HTTPS (iPhones only give motion data to https pages).
// local-ip.sh publishes a trusted wildcard cert for names like 192-168-1-5.local-ip.sh, which
// resolve to that IP. So phones load the game straight from this laptop: no ngrok, no cert setup.
// Run: npm run lan   (fetches the cert if needed, prints the link, starts the server)
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { X509Certificate } = require('crypto');

const dir = path.join(__dirname, '..', 'certs');
const port = process.env.HTTPS_PORT || 3443;

function download(url, file) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`${url} -> HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => { fs.writeFileSync(file, data); resolve(); });
    }).on('error', reject);
  });
}

function certGoodFor(file) {
  try { return (new Date(new X509Certificate(fs.readFileSync(file)).validTo) - Date.now()) / 86400000; } catch (e) { return -1; }
}

(async () => {
  fs.mkdirSync(dir, { recursive: true });
  const pem = path.join(dir, 'server.pem'), key = path.join(dir, 'server.key');
  if (certGoodFor(pem) < 7 || !fs.existsSync(key)) {
    console.log('Fetching the local-ip.sh certificate...');
    await download('https://local-ip.sh/server.pem', pem);
    await download('https://local-ip.sh/server.key', key);
  }
  console.log(`Certificate valid for ${Math.floor(certGoodFor(pem))} more days.\n`);

  const ips = Object.values(os.networkInterfaces()).flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
  if (!ips.length) { console.log('No network connection found. Join Wi-Fi (or a phone hotspot) first.'); process.exit(1); }
  console.log('Open this on the laptop (big screen); phones scan its QR code:');
  for (const ip of ips) console.log(`  https://${ip.replace(/\./g, '-')}.local-ip.sh:${port}/screen.html`);
  console.log('\nPhones must be on the same network. If they can\'t load it, the Wi-Fi blocks\n' +
    'device-to-device traffic: put the laptop and phones on a phone hotspot instead.\n');
})().catch((e) => { console.error('Could not set up the LAN link:', e.message); process.exit(1); });
