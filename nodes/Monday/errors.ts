import { NodeApiError, NodeOperationError, type INode, type JsonObject } from 'n8n-workflow';

/**
 * Rethrow helper for catch blocks: errors from MondayGraphQLClient arrive
 * already mapped to NodeApiError/NodeOperationError and pass through
 * unchanged (preserving retryability markers and HTTP context); anything
 * else is wrapped so the n8n UI never receives a raw error.
 */
export function ensureNodeError(node: INode, error: unknown): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		return error;
	}
	if (error instanceof Error) {
		return new NodeOperationError(node, error);
	}
	return new NodeApiError(node, { message: String(error) } as JsonObject);
}
