// server.js
// RESTful MongoDB API for Trustbit + Game & Store endpoints
// Updated with newer features while keeping old routes intact

// server.js
// RESTful MongoDB API for Trustbit + Game & Store endpoints + Panel & Telegram integration

import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import fetch from 'node-fetch'; // Required for Node.js fetch

const app = express();
app.use(cors());
app.use(express.json());

// -------------------- CONFIG --------------------
const MONGO_URI =
  'mongodb+srv://trustsolo01_db_user:tejiri12@cluster0.ctwfjwi.mongodb.net/trustbit?retryWrites=true&w=majority';

const DB_NAME = 'trustbit';
const PORT = process.env.PORT || 5000;

const CONFIG = {
  TELEGRAM_BOT_TOKEN: '8381248395:AAGZZg1RGNFSmM0y1vvfh-1N-HFqvqQmdw8',
  TELEGRAM_ADMIN_CHAT_ID: '6499793556',
  PTERO_PANEL_URL: '143.244.132.2',
  PTERO_API_KEY: 'ptla_WlmLJ9kxZEVL440FrGXhytT9UP8dXxM9miSqnNoFes2',
  PTERO_LOCATION_ID: 1,
  PTERO_NEST_ID: 1,
  PTERO_EGG_ID: 1
};

// -------------------- MONGO CONNECTION --------------------
const client = new MongoClient(MONGO_URI);
let db;

async function connectDB() {
  await client.connect();
  db = client.db(DB_NAME);
  console.log('[MongoDB] Connected to', DB_NAME);
}
connectDB().catch(console.error);

// -------------------- GENERIC COLLECTIONS --------------------
const COLLECTIONS = [
  'users',
  'messages',
  'orders',
  'projects',
  'notifications',
  'courses',
  'rooms'
];

// Generic CRUD
COLLECTIONS.forEach((col) => {
  // GET /api/collection
  app.get(`/api/${col}`, async (req, res) => {
    const data = await db.collection(col).find({}).toArray();
    res.json(data);
  });

  // POST /api/collection
  app.post(`/api/${col}`, async (req, res) => {
    const doc = { ...req.body, timestamp: Date.now() };
    const result = await db.collection(col).insertOne(doc);
    res.json(result);
  });

  // DELETE /api/collection/:id
  app.delete(`/api/${col}/:id`, async (req, res) => {
    const id = req.params.id;

    let result;
    if (ObjectId.isValid(id)) {
      result = await db.collection(col).deleteOne({ _id: new ObjectId(id) });
    } else {
      result = await db.collection(col).deleteOne({ id });
    }

    res.json({
      deletedCount: result.deletedCount,
      id
    });
  });

  // PATCH /api/collection/:id
  app.patch(`/api/${col}/:id`, async (req, res) => {
    const result = await db.collection(col).updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );
    res.json(result);
  });
});

// DELETE all notifications
app.delete('/api/notifications', async (req, res) => {
  const result = await db.collection('notifications').deleteMany({});
  res.json({ deletedCount: result.deletedCount });
});

// -------------------- CUSTOM ROUTES --------------------

// GET /api/leaderboard
app.get('/api/leaderboard', async (req, res) => {
  const users = await db
    .collection('users')
    .find({})
    .sort({ points: -1, wins: -1 })
    .limit(20)
    .toArray();

  res.json(users);
});

// POST /api/store/purchase
app.post('/api/store/purchase', async (req, res) => {
  const { userId, item, cost } = req.body;

  const user = await db.collection('users').findOne({
    _id: new ObjectId(userId),
  });

  if (!user) return res.status(404).json({ error: 'User not found' });
  if ((user.points || 0) < cost)
    return res.status(400).json({ error: 'Not enough points' });

  const inventory = user.inventory || [];
  inventory.push(item);

  await db.collection('users').updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        points: user.points - cost,
        inventory,
      },
    }
  );

  res.json({ success: true });
});

// -------------------- TELEGRAM ALERT --------------------
const sendTelegramAlert = async (userName, planName, specs) => {
  const message = `
🚀 *NEW TRUSTBIT ORDER*
--------------------------
👤 User: @${userName}
📦 Plan: ${planName}
💻 Specs: ${specs.ram} RAM / ${specs.cpu} CPU
--------------------------
⚠️ *Action Required:* Check Admin Panel to verify receipt and deploy.
  `;

  try {
    const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CONFIG.TELEGRAM_ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    return response.ok;
  } catch (error) {
    console.error('Telegram sync failed:', error);
    return false;
  }
};

// POST /api/notify/order
app.post('/api/notify/order', async (req, res) => {
  const { userName, planName, specs } = req.body;
  try {
    const ok = await sendTelegramAlert(userName, planName, specs);
    res.json({ success: ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- PTERODACTYL PROVISION --------------------
app.post('/api/pterodactyl/provision', async (req, res) => {
  const { userData, planSpecs } = req.body;

  const payload = {
    name: `Trustbit-${userData.username || 'client'}-${Math.floor(Math.random() * 1000)}`,
    user: 1, // admin user id in panel
    egg: CONFIG.PTERO_EGG_ID,
    docker_image: 'ghcr.io/pterodactyl/yolks:debian',
    startup: 'npm start',
    environment: {
      "USER_UPLOAD": "0",
      "AUTO_UPDATE": "1"
    },
    limits: {
      memory: parseInt(planSpecs.ram) * 1024,
      swap: 0,
      disk: parseInt(planSpecs.disk) * 1024,
      io: 500,
      cpu: parseInt(planSpecs.cpu) * 100
    },
    feature_limits: {
      databases: 1,
      allocations: 1,
      backups: 1
    },
    deploy: {
      locations: [CONFIG.PTERO_LOCATION_ID],
      dedicated_ip: false,
      port_range: []
    }
  };

  try {
    const response = await fetch(`${CONFIG.PTERO_PANEL_URL}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.PTERO_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json();
      return res.status(response.status).json({ error: errData });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('Panel provisioning failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------- SERVER --------------------
app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
});


