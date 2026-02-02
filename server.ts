// server.ts
// RESTful MongoDB API for Trustbit + Game & Store endpoints
// Hardcoded MongoDB Atlas URI & database name

import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';

const app = express();
app.use(cors());
app.use(express.json());

// -------------------- HARD-CODED CONFIG --------------------
const MONGO_URI = 'mongodb+srv://trustsolo01_db_user:tejiri12@cluster0.ctwfjwi.mongodb.net/trustbit?retryWrites=true&w=majority';
const DB_NAME = 'trustbit';
const PORT = 5000;

// -------------------- MONGO CONNECTION --------------------
const client = new MongoClient(MONGO_URI);
let db: ReturnType<typeof client.db>;

async function connectDB() {
  await client.connect();
  db = client.db(DB_NAME);
  console.log(`[MongoDB] Connected to ${DB_NAME}`);
}
connectDB().catch(console.error);

// -------------------- COLLECTIONS --------------------
const COLLECTIONS = ['users', 'messages', 'orders', 'projects', 'notifications', 'courses', 'rooms', 'leaderboard', 'store'];

// -------------------- GENERIC CRUD ROUTES --------------------
COLLECTIONS.forEach((col) => {
  // GET /collection → find
  app.get(`/api/${col}`, async (req, res) => {
    const items = await db.collection(col).find({}).toArray();
    res.json(items);
  });

  // POST /collection → insertOne
  app.post(`/api/${col}`, async (req, res) => {
    const doc = { ...req.body, timestamp: Date.now() };
    const result = await db.collection(col).insertOne(doc);
    res.json(result);
  });

  // DELETE /collection/:id → deleteOne
  app.delete(`/api/${col}/:id`, async (req, res) => {
    const result = await db.collection(col).deleteOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  });

  // PATCH /collection/:id → updateOne
  app.patch(`/api/${col}/:id`, async (req, res) => {
    const update = req.body;
    const result = await db.collection(col).updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: update }
    );
    res.json(result);
  });
});

// -------------------- GAME & STORE SPECIFIC ROUTES --------------------

// GET /api/courses → all courses
app.get('/api/courses', async (req, res) => {
  const courses = await db.collection('courses').find({}).toArray();
  res.json(courses);
});

// GET /api/leaderboard → top users sorted by points/wins
app.get('/api/leaderboard', async (req, res) => {
  const users = await db.collection('users').find({}).sort({ points: -1, wins: -1 }).limit(20).toArray();
  res.json(users);
});

// POST /api/rooms → create a game room
app.post('/api/rooms', async (req, res) => {
  const doc = { ...req.body, createdAt: Date.now(), active: true };
  const result = await db.collection('rooms').insertOne(doc);
  res.json(result);
});

// GET /api/rooms → poll active game rooms
app.get('/api/rooms', async (req, res) => {
  const rooms = await db.collection('rooms').find({ active: true }).toArray();
  res.json(rooms);
});

// PATCH /api/users/:id → update points, badges, premium
app.patch('/api/users/:id', async (req, res) => {
  const update = req.body; // { points, badges, premium }
  const result = await db.collection('users').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: update }
  );
  res.json(result);
});

// POST /api/store/purchase → deduct points and add item
app.post('/api/store/purchase', async (req, res) => {
  const { userId, item, cost } = req.body;

  const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
  if (!user) return res.status(404).json({ error: 'User not found' });

  if ((user.points || 0) < cost) return res.status(400).json({ error: 'Not enough points' });

  // Deduct points and add item
  const updatedInventory = user.inventory ? [...user.inventory, item] : [item];
  const result = await db.collection('users').updateOne(
    { _id: new ObjectId(userId) },
    { $set: { points: user.points - cost, inventory: updatedInventory } }
  );

  res.json({ success: true, result });
});

// -------------------- SERVER START --------------------
app.listen(PORT, () => console.log(`[Express] Server running on port ${PORT}`));
