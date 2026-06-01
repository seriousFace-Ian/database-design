import client from './client';
import type { DbConnectionConfig, ExecuteDdlResponse } from '@/types/api';

export async function executeDdl(
  connection: DbConnectionConfig,
  statements: string[],
  transactional = true
): Promise<ExecuteDdlResponse> {
  const { data } = await client.post<ExecuteDdlResponse>('/schema/execute', {
    connection,
    statements,
    transactional,
  });
  return data;
}
