import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import TelegramBot from 'node-telegram-bot-api';
import { Octokit } from '@octokit/core';

const LOG_PATH = 'logs/daily.md';

export function isAllowed(msg, allowedId) {
  return String(msg.chat?.id) === allowedId && String(msg.from?.id) === allowedId;
}

export function formatEntries(content, messages) {
  let out = content;
  for (const { date, text } of messages) {
    const iso = new Date(date * 1000).toISOString();
    const day = iso.slice(0, 10);
    const time = iso.slice(11, 16);
    if (!out.includes(`## ${day}`)) {
      out += `${out && !out.endsWith('\n') ? '\n' : ''}${out ? '\n' : ''}## ${day}\n\n`;
    } else if (!out.endsWith('\n')) {
      out += '\n';
    }
    out += `- [${day} ${time}] ${text.replace(/\r?\n/g, ' ')}\n`;
  }
  return out;
}

async function getFile(octokit, owner, repo) {
  try {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', { owner, repo, path: LOG_PATH });
    return { content: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha };
  } catch (err) {
    if (err.status === 404) return { content: '', sha: undefined };
    throw err;
  }
}

export async function appendToLog(octokit, repository, messages) {
  const [owner, repo] = repository.split('/');
  const lastDay = new Date(messages.at(-1).date * 1000).toISOString().slice(0, 10);
  for (let attempt = 1; ; attempt++) {
    const { content, sha } = await getFile(octokit, owner, repo);
    try {
      await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
        owner, repo, path: LOG_PATH, sha,
        message: `log: ${lastDay}`,
        content: Buffer.from(formatEntries(content, messages), 'utf8').toString('base64'),
      });
      return;
    } catch (err) {
      if (err.status !== 409 || attempt >= 3) throw err;
    }
  }
}

export async function run({ bot, octokit, allowedId, repository }) {
  const updates = await bot.getUpdates({ timeout: 0 });
  if (!updates.length) return console.log('No pending updates');

  const messages = [];
  for (const u of updates) {
    const msg = u.message;
    if (!msg?.text) continue;
    if (!isAllowed(msg, allowedId)) {
      console.log('rejected unauthorized sender');
      continue;
    }
    messages.push({ date: msg.date, text: msg.text, chatId: msg.chat.id });
  }

  if (messages.length) {
    await appendToLog(octokit, repository, messages);
    console.log(`Logged ${messages.length} message(s)`);
  }

  // Confirm updates only after the write succeeded, so failures retry next run.
  const lastId = updates.at(-1).update_id;
  await bot.getUpdates({ offset: lastId + 1, limit: 1, timeout: 0 });

  if (messages.length) {
    await bot.sendMessage(messages[0].chatId, '✅ logged').catch(() => console.log('reply failed'));
  }
}

async function main() {
  if (fs.existsSync('.env')) await import('dotenv/config');
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const allowedId = process.env.ALLOWED_USER_ID;
  const repository = process.env.GITHUB_REPOSITORY;
  for (const [name, val] of Object.entries({ TELEGRAM_BOT_TOKEN: token, GH_TOKEN: ghToken, ALLOWED_USER_ID: allowedId, GITHUB_REPOSITORY: repository })) {
    if (!val) {
      console.error(`Missing required env var: ${name}`);
      process.exit(1);
    }
  }
  await run({
    bot: new TelegramBot(token, { polling: false }),
    octokit: new Octokit({ auth: ghToken }),
    allowedId: allowedId.trim(),
    repository,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Run failed:', err.status || '', err.message);
    process.exit(1);
  });
}
