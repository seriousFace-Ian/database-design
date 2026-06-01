import { Router, Request, Response, NextFunction } from 'express';
import { testConnection } from '../services/pgClient';
import { inspectSchema } from '../services/schemaInspector';
import { DbConnectionConfig } from '../types';

const router = Router();

// POST /api/connection/test
router.post('/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config: DbConnectionConfig = req.body;
    validateConnectionConfig(config);
    const version = await testConnection(config);
    res.json({ success: true, version });
  } catch (err) {
    next(err);
  }
});

// POST /api/connection/inspect
router.post('/inspect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { connection, schemas = ['public'] }: { connection: DbConnectionConfig; schemas?: string[] } = req.body;
    validateConnectionConfig(connection);
    const result = await inspectSchema(connection, schemas);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

function validateConnectionConfig(config: DbConnectionConfig): void {
  const required: (keyof DbConnectionConfig)[] = ['host', 'port', 'database', 'username', 'password'];
  for (const field of required) {
    if (!config[field] && config[field] !== 0) {
      const err = new Error(`Missing required field: ${field}`);
      (err as NodeJS.ErrnoException).code = 'VALIDATION_ERROR';
      throw Object.assign(err, { statusCode: 400 });
    }
  }
}

export default router;
