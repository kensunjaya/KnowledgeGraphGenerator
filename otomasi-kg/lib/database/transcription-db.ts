import sql from 'mssql';

let poolPromise: Promise<sql.ConnectionPool> | undefined;

export function getTranscriptionPool() {
  if (!poolPromise) {
    const pool = new sql.ConnectionPool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      server: process.env.DB_SERVER || '',
      port: Number(process.env.DB_PORT || 1433),
      database: 'Transcription',
      options: { encrypt: false, trustServerCertificate: true },
    });
    poolPromise = pool.connect().catch((error: unknown) => {
      poolPromise = undefined;
      throw error;
    });
  }
  return poolPromise;
}

// A detached worker maintains a lease. A machine shutdown or killed worker
// becomes retryable, without imposing a time limit on long CPU transcriptions.
export async function recoverInterruptedTranscriptions() {
  const pool = await getTranscriptionPool();
  await pool.request().query(`
    UPDATE dbo.TranscriptionRequest SET status='FAILED', completedAt=SYSUTCDATETIME(),
      errorMessage=N'Transcription was interrupted. You can retry this file.'
    WHERE status='PROCESSING' AND heartbeatAt < DATEADD(MINUTE, -2, SYSUTCDATETIME())
  `);
}

export { sql };
