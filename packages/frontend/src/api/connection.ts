import client from './client';
import type { DbConnectionConfig, ConnectionTestResponse, InspectSchemaResponse } from '@/types/api';

export async function testConnection(config: DbConnectionConfig): Promise<ConnectionTestResponse> {
  const { data } = await client.post<ConnectionTestResponse>('/connection/test', config);
  return data;
}

export async function inspectSchema(
  config: DbConnectionConfig,
  schemas: string[] = ['public']
): Promise<InspectSchemaResponse> {
  const { data } = await client.post<InspectSchemaResponse>('/connection/inspect', {
    connection: config,
    schemas,
  });
  return data;
}
