import nextEnv from '@next/env';
import sql from 'mssql';
import { readFile } from 'node:fs/promises';

nextEnv.loadEnvConfig(process.cwd());
const pool = await new sql.ConnectionPool({
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || '', port: Number(process.env.DB_PORT || 1433),
  database: 'Transcription', options: { encrypt: false, trustServerCertificate: true },
}).connect();
try {
  await pool.request().batch(await readFile(new URL('../database/transcription.sql', import.meta.url), 'utf8'));
  console.log('Transcription database schema is ready.');
} finally { await pool.close(); }
