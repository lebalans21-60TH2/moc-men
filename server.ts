import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { initDatabase } from './server/db.ts';
import { MongoStore } from './server/mongo.ts';
import { registerApiRoutes } from './server/routes.ts';
import { SqliteStore, type IDataStore } from './server/store.ts';

async function resolveDataStore(): Promise<IDataStore> {
  const mongoUri = (process.env.MONGODB_URI || '').trim();
  const mongoDbName = (process.env.MONGODB_DB_NAME || 'moc_men_craft').trim();

  if (mongoUri) {
    try {
      const mongoStore = new MongoStore(mongoUri, mongoDbName);
      await mongoStore.connectAndInit();
      console.log(`Connected to MongoDB database "${mongoDbName}".`);
      return mongoStore;
    } catch (err: any) {
      console.error('MongoDB connection failed, falling back to local SQLite:', err?.message || err);
    }
  } else {
    console.log('MONGODB_URI not set — using local SQLite persistence. Set MONGODB_URI in Secrets to switch to MongoDB.');
  }

  initDatabase();
  return new SqliteStore();
}

async function startServer() {
  const store = await resolveDataStore();

  const app = express();
  const PORT = 3000;

  registerApiRoutes(app, store);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mộc & Men server listening on http://localhost:${PORT} [${store.driverName}]`);
  });
}

startServer();
