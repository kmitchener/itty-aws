import type { ProtocolHandler, ServiceMetadata } from "./interface.ts";

export class AwsJson11Handler implements ProtocolHandler {
  readonly name = "awsJson1_1";
  readonly contentType = "application/x-amz-json-1.1";

  buildRequest(
    input: unknown,
    _action: string,
    _metadata: ServiceMetadata,
  ): string {
    return JSON.stringify(input);
  }

  getHeaders(
    action: string,
    metadata: ServiceMetadata,
  ): Record<string, string> {
    return {
      "Content-Type": this.contentType,
      "X-Amz-Target": `${metadata.targetPrefix}.${action}`,
      "User-Agent": "itty-aws",
    };
  }

  parseResponse(responseText: string, _statusCode: number): unknown {
    if (!responseText) return {};
    return JSON.parse(responseText);
  }

  parseError(responseText: string, _statusCode: number): unknown {
    try {
      return JSON.parse(responseText);
    } catch {
      return { message: responseText };
    }
  }
}
