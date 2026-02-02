// server.js
// RESTful MongoDB API for Trustbit + Game & Store endpoints
// Plain JavaScript version (Render-friendly)

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
  app.delete('/api/notifications', async (req, res) => {
  const result = await db.collection('notifications').deleteMany({});
  res.json({ deletedCount: result.deletedCount });
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

// -------------------- SERVER --------------------
app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
});
