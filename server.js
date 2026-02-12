// server.js
// RESTful MongoDB API for Trustbit + Game & Store endpoints
// Includes Telegram alerts + Pterodactyl user & server provisioning

import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';

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

  PTERO_PANEL_URL: 'http://143.244.132.2',
  PTERO_API_KEY: 'ptla_WlmLJ9kxZEVL440FrGXhytT9UP8dXxM9miSqnNoFes2',

  PTERO_LOCATION_ID: 1,
  PTERO_EGG_ID: 15
};

// -------------------- MONGO CONNECTION --------------------
const client = new MongoClient(MONGO_URI);
let db;

async function connectDB() {
  await client.connect();
  db = client.db(DB_NAME);
  console.log('[MongoDB] Connected:', DB_NAME);
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

COLLECTIONS.forEach((col) => {
  app.get(`/api/${col}`, async (_, res) => {
    res.json(await db.collection(col).find({}).toArray());
  });

  app.post(`/api/${col}`, async (req, res) => {
    const doc = { ...req.body, timestamp: Date.now() };
    res.json(await db.collection(col).insertOne(doc));
  });

  app.delete(`/api/${col}/:id`, async (req, res) => {
    const id = req.params.id;
    const result = ObjectId.isValid(id)
      ? await db.collection(col).deleteOne({ _id: new ObjectId(id) })
      : await db.collection(col).deleteOne({ id });
    res.json(result);
  });

  app.patch(`/api/${col}/:id`, async (req, res) => {
    res.json(
      await db.collection(col).updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: req.body }
      )
    );
  });
});

// -------------------- LEADERBOARD --------------------
app.get('/api/leaderboard', async (_, res) => {
  res.json(
    await db
      .collection('users')
      .find({})
      .sort({ points: -1, wins: -1 })
      .limit(20)
      .toArray()
  );
});

// -------------------- STORE PURCHASE --------------------
app.post('/api/store/purchase', async (req, res) => {
  const { userId, item, cost } = req.body;

  const user = await db.collection('users').findOne({
    _id: new ObjectId(userId)
  });

  if (!user) return res.status(404).json({ error: 'User not found' });
  if ((user.points || 0) < cost)
    return res.status(400).json({ error: 'Not enough points' });

  await db.collection('users').updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        points: user.points - cost,
        inventory: [...(user.inventory || []), item]
      }
    }
  );

  res.json({ success: true });
});

// -------------------- TELEGRAM ALERT --------------------
const sendTelegramAlert = async (userName, planName, specs) => {
  const message = `
🚀 *NEW TRUSTBIT ORDER*
👤 User: @${userName}
📦 Plan: ${planName}
💻 Specs: ${specs.ram}GB RAM / ${specs.cpu} CPU
`;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CONFIG.TELEGRAM_ADMIN_CHAT_ID,
          text: message,
          parse_mode: 'Markdown'
        })
      }
    );
    return res.ok;
  } catch (e) {
    console.error('[Telegram Error]', e);
    return false;
  }
};

app.post('/api/notify/order', async (req, res) => {
  const { userName, planName, specs } = req.body;
  res.json({ success: await sendTelegramAlert(userName, planName, specs) });
});

// -------------------- PTERODACTYL USER CREATION --------------------
const createPteroUser = async (user) => {
  const payload = {
    email: user.email || `${user.username}@trustbit.auto`,
    username: user.username,
    first_name: user.username,
    last_name: 'Trustbit',
    password: Math.random().toString(36).slice(-12)
  };

  const res = await fetch(
    `${CONFIG.PTERO_PANEL_URL}/api/application/users`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CONFIG.PTERO_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return JSON.parse(text).attributes;
};

// -------------------- PTERODACTYL SERVER PROVISION --------------------
// -------------------- PTERODACTYL SERVER PROVISION --------------------
app.post('/api/pterodactyl/provision', async (req, res) => {
  try {
    const { username, plan } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    if (!plan) {
      return res.status(400).json({ error: "Plan (1gb-10gb) is required" });
    }

    // ------------------- PLAN LIMITS -------------------
    const PLAN_LIMITS = {
      "1gb": { memory: 1024, disk: 1024, cpu: 40 },
      "2gb": { memory: 2048, disk: 2048, cpu: 60 },
      "3gb": { memory: 3072, disk: 3072, cpu: 80 },
      "4gb": { memory: 4096, disk: 4096, cpu: 100 },
      "5gb": { memory: 5120, disk: 5120, cpu: 120 },
      "6gb": { memory: 6144, disk: 6144, cpu: 140 },
      "7gb": { memory: 7168, disk: 7168, cpu: 160 },
      "8gb": { memory: 8192, disk: 8192, cpu: 180 },
      "9gb": { memory: 9216, disk: 9216, cpu: 200 },
      "10gb": { memory: 10240, disk: 10240, cpu: 220 }
    };

    const selectedPlan = PLAN_LIMITS[plan.toLowerCase()];

    if (!selectedPlan) {
      return res.status(400).json({ error: "Invalid plan selected" });
    }

    // ------------------- CREATE PTERODACTYL USER -------------------
    const userPayload = {
      email: `${username}@trustbit.auto`,
      username: username.toLowerCase(),
      first_name: username,
      last_name: "Trustbit",
      password: Math.random().toString(36).slice(-12)
    };

    const userRes = await fetch(
      `${CONFIG.PTERO_PANEL_URL}/api/application/users`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CONFIG.PTERO_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(userPayload)
      }
    );

    if (!userRes.ok) {
      const errText = await userRes.text();
      return res.status(userRes.status).json({ error: errText });
    }

    const userData = await userRes.json();
    const userId = userData.attributes.id;

    // ------------------- CREATE SERVER -------------------
    const serverPayload = {
      name: `${username}-${plan}`,
      user: userId,
      egg: CONFIG.PTERO_EGG_ID,
      docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",
      startup: "npm start",
      environment: {}, // 🔥 no unnecessary egg variables
      limits: {
        memory: selectedPlan.memory,
        swap: 0,
        disk: selectedPlan.disk,
        io: 500,
        cpu: selectedPlan.cpu
      },
      feature_limits: {
        databases: 3,
        backups: 3,
        allocations: 2
      },
      deploy: {
        locations: [CONFIG.PTERO_LOCATION_ID],
        dedicated_ip: false,
        port_range: []
      }
    };

    const serverRes = await fetch(
      `${CONFIG.PTERO_PANEL_URL}/api/application/servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CONFIG.PTERO_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(serverPayload)
      }
    );

    if (!serverRes.ok) {
      const errText = await serverRes.text();
      return res.status(serverRes.status).json({ error: errText });
    }

    const serverData = await serverRes.json();

    return res.json({
      success: true,
      user: userData.attributes,
      server: serverData.attributes
    });

  } catch (err) {
    console.error("[Provision Error]", err);
    res.status(500).json({ error: err.message });
  }
});



// -------------------- SERVER START --------------------
app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
});



