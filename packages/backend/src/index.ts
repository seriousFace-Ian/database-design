import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectionRouter from './routes/connection'
import schemaRouter from './routes/schema'
import projectRouter from './routes/project'
import {errorHandler, notFoundHandler} from './middleware/errorHandler'

dotenv.config()

const app = express()
const PORT = process.env.PORT ?? 3001

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)
app.use(express.json({limit: '10mb'}))

// Health check
app.get('/api/health', (_req, res) => {
  res.json({status: 'ok', timestamp: new Date().toISOString()})
})

// Routes
app.use('/api/connection', connectionRouter)
app.use('/api/schema', schemaRouter)
app.use('/api/project', projectRouter)

// Error handling
app.use(notFoundHandler)
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`🚀 DB Design Backend running at http://localhost:${PORT}`)
  console.log(`   Health check: http://localhost:${PORT}/api/health`)
})

export default app
