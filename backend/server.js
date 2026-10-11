const express = require('express');
const app = express();
app.get('/api/db', async (_q, r) => { const c = new (require('mongodb').MongoClient)(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 3000 }); try { await c.connect(); await c.db().command({ ping: 1 }); r.json({ db: 'ok' }); } catch (e) { r.status(503).json({ db: 'error', message: e.message }); } finally { await c.close(); } });
const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => console.log('API on :' + port));
