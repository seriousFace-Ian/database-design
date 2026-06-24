import {Request, Response, NextFunction} from 'express'

export interface AppError extends Error {
  statusCode?: number
  code?: string
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500
  const message = err.message ?? 'Internal Server Error'

  console.error(`[ERROR] ${statusCode} - ${message}`, err.stack)

  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code ?? 'INTERNAL_ERROR',
      message,
    },
  })
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  })
}
