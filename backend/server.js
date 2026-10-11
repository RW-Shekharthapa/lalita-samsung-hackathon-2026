const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(express.json());

const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 3000 });
const folders = () => client.db().collection('folders');

const api = express.Router();

api.get('/db', async (_q, r) => {
  try { await client.db().command({ ping: 1 }); r.json({ db: 'ok' }); }
  catch (e) { r.status(503).json({ db: 'error', message: e.message }); }
});

const toId = (v) => (v && ObjectId.isValid(v) ? new ObjectId(v) : null);
const cleanName = (v) => (typeof v === 'string' ? v.trim() : '');
const wrap = (fn) => (q, r) => fn(q, r).catch((e) => r.status(500).json({ error: e.message }));

// Flat list; the client builds the tree.
api.get('/folders', wrap(async (_q, r) => {
  const list = await folders().find().sort({ name: 1 }).toArray();
  r.json(list.map((f) => ({ id: f._id, name: f.name, parentId: f.parentId || null })));
}));

api.post('/folders', wrap(async (q, r) => {
  const name = cleanName(q.body.name);
  if (!name) return r.status(400).json({ error: 'Name is required' });
  const parentId = q.body.parentId ? toId(q.body.parentId) : null;
  if (q.body.parentId && !parentId) return r.status(400).json({ error: 'Invalid parent' });
  if (parentId && !(await folders().findOne({ _id: parentId }))) return r.status(404).json({ error: 'Parent not found' });
  if (await folders().findOne({ parentId, name })) return r.status(409).json({ error: 'A folder with that name already exists here' });
  const { insertedId } = await folders().insertOne({ name, parentId, createdAt: new Date() });
  r.status(201).json({ id: insertedId, name, parentId });
}));

api.patch('/folders/:id', wrap(async (q, r) => {
  const _id = toId(q.params.id);
  const name = cleanName(q.body.name);
  if (!_id) return r.status(400).json({ error: 'Invalid id' });
  if (!name) return r.status(400).json({ error: 'Name is required' });
  const f = await folders().findOne({ _id });
  if (!f) return r.status(404).json({ error: 'Not found' });
  if (await folders().findOne({ parentId: f.parentId, name, _id: { $ne: _id } })) return r.status(409).json({ error: 'A folder with that name already exists here' });
  await folders().updateOne({ _id }, { $set: { name } });
  r.json({ id: _id, name, parentId: f.parentId || null });
}));

// Deletes the folder and all its descendants.
api.delete('/folders/:id', wrap(async (q, r) => {
  const _id = toId(q.params.id);
  if (!_id) return r.status(400).json({ error: 'Invalid id' });
  if (!(await folders().findOne({ _id }))) return r.status(404).json({ error: 'Not found' });
  const ids = [_id];
  for (let i = 0; i < ids.length; i++) {
    const kids = await folders().find({ parentId: ids[i] }, { projection: { _id: 1 } }).toArray();
    ids.push(...kids.map((k) => k._id));
  }
  const { deletedCount } = await folders().deleteMany({ _id: { $in: ids } });
  r.json({ deleted: deletedCount });
}));

// The Ultron proxy may or may not strip its prefix, so accept both.
app.use('/api', api);
app.use('/proxy/8080/api', api);

const port = process.env.PORT || 8080;
client.connect().then(() => app.listen(port, '0.0.0.0', () => console.log('API on :' + port)))
  .catch((e) => { console.error('DB connection failed:', e.message); process.exit(1); });
