import type {
  DbConnectionConfig,
  LoadProjectConfigResponse,
  SaveProjectConfigResponse,
} from '@/types/api'
import type {ProjectFile} from '@/types/schema'

import client from './client'

/** 在目标库创建 __dbdesign 配置表（幂等） */
export async function initProjectTable(connection: DbConnectionConfig): Promise<void> {
  await client.post('/project/init', {connection})
}

/** upsert 当前 ProjectFile 到数据库 */
export async function saveProjectToDb(
  connection: DbConnectionConfig,
  project: ProjectFile
): Promise<SaveProjectConfigResponse> {
  const {data} = await client.post<SaveProjectConfigResponse>('/project/save', {
    connection,
    project,
  })
  return data
}

/** 从数据库读取已保存的 ProjectFile */
export async function loadProjectFromDb(
  connection: DbConnectionConfig
): Promise<LoadProjectConfigResponse> {
  const {data} = await client.post<LoadProjectConfigResponse>('/project/load', {
    connection,
  })
  return data
}
