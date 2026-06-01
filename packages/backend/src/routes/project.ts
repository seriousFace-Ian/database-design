import { Router, Request, Response, NextFunction } from 'express';
import { initConfigTable, saveProjectConfig, loadProjectConfig } from '../services/configStore';
import { DbConnectionConfig } from '../types';

const router = Router();

// POST /api/project/init — 在目标库创建 __dbdesign 配置表（幂等）
router.post('/init', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { connection }: { connection: DbConnectionConfig } = req.body;
    validateConnection(connection);
    await initConfigTable(connection);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/project/save — upsert 当前 ProjectFile
router.post('/save', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { connection, project }: { connection: DbConnectionConfig; project: unknown } = req.body;
    validateConnection(connection);
    if (!project) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'project is required' },
      });
    }
    const updatedAt = await saveProjectConfig(connection, project);
    return res.json({ success: true, updatedAt });
  } catch (err) {
    return next(err);
  }
});

// POST /api/project/load — 读取库中保存的 ProjectFile
// 注意：用 POST 而非 GET，因为连接凭据必须放在请求体，不能进 URL query
router.post('/load', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { connection }: { connection: DbConnectionConfig } = req.body;
    validateConnection(connection);
    const result = await loadProjectConfig(connection);
    res.json({ success: true, found: result !== null, ...(result ?? {}) });
  } catch (err) {
    next(err);
  }
});

function validateConnection(config: DbConnectionConfig): void {
  // password 不强制：本地 trust/peer 认证下密码为空属正常
  const required: (keyof DbConnectionConfig)[] = ['host', 'port', 'database', 'username'];
  for (const field of required) {
    if (!config?.[field] && config?.[field] !== 0) {
      const err = new Error(`Missing required connection field: ${field}`);
      throw Object.assign(err, { statusCode: 400, code: 'VALIDATION_ERROR' });
    }
  }
}

export default router;
