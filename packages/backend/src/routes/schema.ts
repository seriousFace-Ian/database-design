import {Router, Request, Response, NextFunction} from 'express'
import {executeInTransaction, executeStatements} from '../services/pgClient'
import {ExecuteDdlRequest} from '../types'

const router = Router()

// POST /api/schema/execute
router.post('/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {connection, statements, transactional = true}: ExecuteDdlRequest = req.body

    if (!statements || !Array.isArray(statements) || statements.length === 0) {
      return res.status(400).json({
        success: false,
        error: {code: 'VALIDATION_ERROR', message: 'statements must be a non-empty array'},
      })
    }

    const result = transactional
      ? await executeInTransaction(connection, statements)
      : await executeStatements(connection, statements)

    const success = result.errors.length === 0
    return res.status(success ? 200 : 207).json({
      success,
      executedCount: result.executedCount,
      errors: result.errors.length > 0 ? result.errors : undefined,
    })
  } catch (err) {
    return next(err)
  }
})

export default router
