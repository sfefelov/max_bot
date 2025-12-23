// index.js
require('dotenv').config();
const { Bot } = require('@maxhub/max-bot-api');
const express = require('express');
const { MongoClient } = require('mongodb');
const { URLSearchParams } = require('url');

const app = express();
const PORT = process.env.PORT || 4444;
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017';
const DB_NAME = process.env.DB_NAME || 'maxuser';
const DB_DELETE_NAME = process.env.DB_DELETE_NAME || 'max_deleteuser';

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is required!');
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI);
let db, deleteDb;

async function connectDB() {
  await client.connect();
  db = client.db(DB_NAME);
  deleteDb = client.db(DB_DELETE_NAME);
  console.log('✅ MongoDB connected');
}

const bot = new Bot(BOT_TOKEN);

bot.api.setMyCommands([
  { name: 'start', description: 'Сказать привет' },
  { name: 'Hi', description: 'Сказать привет' },
  { name: 'hello', description: 'Сказать привет' },
  { name: 'delete', description: 'Перенести профиль в архив' },
  { name: 'bye', description: 'Перенести профиль в архив' },
]);

bot.command(['start', 'Hi', 'hello'], (ctx) => {
  ctx.reply(
    '👋 Привет! Я бот уведомлений компании **XXX**.\n' +
    'По всем вопросам вы можете связаться: **XXX**.\n\n' +
    '📲 Пожалуйста, поделитесь своим номером телефона, чтобы получать уведомления:',
    {
      attachments: [
        {
          type: 'inline_keyboard',
          payload: {
            buttons: [
              [
                {
                  type: 'request_contact',
                  text: '📱 Отправить номер'
                }
              ]
            ]
          }
        }
      ]
    }
  );
});

// ✅ Исправленный обработчик удаления
bot.command(['delete', 'bye'], async (ctx) => {
  const userId = ctx.message.sender.user_id;
  const records = await db.collection('users').find({ userId }).toArray();

  if (records.length === 0) {
    return ctx.reply('ℹ️ Вы не зарегистрированы.');
  }

  // Переносим все записи
  await Promise.all(
    records.map(record =>
      deleteDb.collection('deleted_users').insertOne({
        ...record,
        movedAt: new Date(),
        reason: 'user_requested'
      })
    )
  );

  // Удаляем из активной базы
  await db.collection('users').deleteMany({ userId });

  ctx.reply('✅ Профиль перемещён в архив.');
});

function extractPhoneFromVCard(vcf) {
  const phoneMatch = vcf.match(/TEL[^:]*:(\+?\d+)/i);
  if (phoneMatch) {
    let raw = phoneMatch[1].replace(/\D/g, '');
    if (raw.length === 11 && raw.startsWith('8')) return '7' + raw.slice(1);
    if (raw.length === 10) return '7' + raw;
    if (raw.length === 11 && raw.startsWith('7')) return raw;
  }
  return null;
}

bot.on('message_created', async (ctx) => {
  const msg = ctx.message;
  const userId = msg.sender.user_id;
  const chatId = msg.recipient.chat_id;

  if (msg.body?.attachments) {
    for (const att of msg.body.attachments) {
      if (att.type === 'contact' && att.payload?.vcf_info) {
        const phoneNumber = extractPhoneFromVCard(att.payload.vcf_info);
        if (!phoneNumber) {
          await ctx.reply('❌ Не удалось извлечь номер.');
          return;
        }

        // 🔍 Проверка дубликата
        const existing = await db.collection('users').findOne({ phoneNumber });
        if (existing) {
          await ctx.reply('ℹ️ Вы уже зарегистрированы с этим номером.');
          return;
        }

        await db.collection('users').insertOne({
          userId,
          chatId,
          phoneNumber,
          addedAt: new Date(),
        });
        await ctx.reply(`✅ Номер **${phoneNumber}** добавлен в базу!`);
        return;
      }
    }
  }

  if (msg.body?.text) {
    await ctx.reply('Бот только отправляет сообщения, отвечать не умею');
    return;
  }
});

bot.catch((err) => {
  console.error('⚠️ Bot error:', err.message || err);
});

// HTTP-отправка — рабочая версия
app.get('/', async (req, res) => {
  const { to, text } = req.query;
  if (!to || !text) {
    return res.status(400).json({ error: 'Требуются параметры: to, text' });
  }

  const digits = to.replace(/\D/g, '');
  let phoneNumber = digits;
  if (digits.length === 11 && digits.startsWith('8')) {
    phoneNumber = '7' + digits.slice(1);
  } else if (digits.length === 10) {
    phoneNumber = '7' + digits;
  }

  if (phoneNumber.length !== 11 || !phoneNumber.startsWith('7')) {
    return res.status(400).json({ error: 'Некорректный номер телефона' });
  }

  try {
    const users = await db.collection('users').find({ phoneNumber }).toArray();
    if (users.length === 0) {
      return res.status(404).json({ error: 'Номер не найден среди активных пользователей' });
    }

    const results = [];
    for (const user of users) {
      try {
        const url = new URL('https://platform-api.max.ru/messages');
        url.searchParams.append('user_id', user.userId);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': BOT_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            chat_id: user.chatId,
            text: text
          })
        });

        if (response.ok) {
          results.push({ userId: user.userId, chatId: user.chatId, status: 'sent' });
        } else {
          const errText = await response.text();
          results.push({ userId: user.userId, status: 'failed', reason: errText });
        }
      } catch (err) {
        results.push({ userId: user.userId, status: 'failed', reason: err.message });
      }
    }

    res.json({
      success: true,
      sent_to: users.length,
      details: results,
    });
  } catch (err) {
    console.error('💀 HTTP API error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

async function start() {
  await connectDB();
  bot.start();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 HTTP server on port ${PORT}`);
  });
}

start().catch(console.error);
