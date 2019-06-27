const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = 'token.json';

fs.readFile('credentials.json', (err, content) => {
  authorize(JSON.parse(content), process.argv.slice(2).includes('--quiet') ? (() => console.log('OK')) : getEmails);
});

function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Authorize this app by visiting this url:', authUrl);
  rl.question('Enter the code from that page here: ', code => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), err => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

async function listEmails(auth, pageToken) {
  const all = [];
  const results = await new Promise((resolve, reject) => {
    google.gmail({ version: 'v1', auth }).users.messages.list({ userId: 'me', q: 'from:wakatime.com', pageToken }, (err, res) => {
      if (err) return reject(err);
      res.data.messages.forEach(msg => {
        all.push(msg.id);
      });
      resolve(res.data);
    });
  });

  if (results.nextPageToken) {
    const next = await listEmails(auth, results.nextPageToken);
    all.push(...next);
  }

  return all;
}

function getEmail(auth, id) {
  const gmail = google.gmail({ version: 'v1', auth });
  return new Promise((resolve, reject) => {
    gmail.users.messages.get({ userId: 'me', id }, (err, res) => {
      if (err) return reject(err);
      resolve(res.data);
    });
  });
}

function extractTime(value) {
  const [time, unit] = value.split(' ');

  if (unit.includes('min')) return (parseInt(time, 10) * 60) * 1000;
  if (unit.includes('hr')) return ((parseInt(time, 10) * 60) * 60) * 1000;

  return parseInt(time, 10) * 1000;
}

function toSecs(values) {
  return values.reduce((prev, cur) => extractTime(cur) + prev, 0);
}

function getStats(email) {
  const stats = {};
  const lines = email.trim().split('\n');

  for (let i = 0, label; i < lines.length; i += 1) {
    if (/^\s*(?:Unsubscribe|Upgrade|Change)/.test(lines[i])) break;

    const line = lines[i].trim();
    const isDashLink = line.match(/(?:start|end)=[\d-]+/g);
    const isLabel = line.match(/^([^:]+)\s*:\s*$/);
    const hasTime = line.match(/(\d+)\s+(hr|min)s/g);

    if (isDashLink) stats.date = [isDashLink[0].split('=')[1], isDashLink[1].split('=')[1]];
    if (isLabel) label = isLabel[1].replace(/\W/g, '_').toLowerCase();
    if (hasTime) {
      if (line.includes(':')) {
        stats[label] = stats[label] || {};
        stats[label][line.split(':')[0].trim()] = toSecs(hasTime);
      } else {
        stats.total = toSecs(hasTime);
      }
    }
  }

  return stats;
}

async function getEmails(auth, first) {
  const ids = await listEmails(auth);

  await Promise.all(ids.slice(0, ids.length - 2).map((x, i) => getEmail(auth, x).then(resp => {
    if (!resp.payload.parts) {
      return;
    }

    const text = Buffer.from(resp.payload.parts[0].body.data, 'base64').toString();
    const stats = JSON.stringify(getStats(text));

    return stats;
  }))).then(all => {
    process.stdout.write(`${all.filter(Boolean).join('\n')}`);
  });

  process.stdout.write('\n');
}
