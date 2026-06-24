import type {Edge, Node} from '@xyflow/react'

import type {TableDefinition} from './schema'

export interface TableNodeData {
  table: TableDefinition
  isSelected: boolean
  onFieldClick?: (fieldId: string) => void
  [key: string]: unknown
}

export interface FkEdgeData {
  sourceFieldName: string
  targetFieldName: string
  onDelete: string
  constraintName?: string
  [key: string]: unknown
}

export type TableFlowNode = Node<TableNodeData, 'tableNode'>
export type FkFlowEdge = Edge<FkEdgeData, 'fkEdge'>
