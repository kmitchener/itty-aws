import { XMLParser } from "fast-xml-parser";
import type { ProtocolHandler, ServiceMetadata } from "./interface.ts";
import { awsQueryMetadata } from "./aws-query-metadata.ts";

type AwsQueryMetadata = typeof awsQueryMetadata;
type ServiceName = keyof AwsQueryMetadata;
type ShapeMetadata = AwsQueryMetadata[ServiceName]["shapes"][string];

const parser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (_name, jpath, _isLeafNode, _isAttribute) => {
    // This is a heuristic. A proper implementation would need to consult
    // the metadata to know which paths should always be arrays.
    // For now, this covers the most common cases in AWS APIs.
    return jpath.endsWith(".member") || jpath.endsWith(".item") ||
      jpath.endsWith(".entry");
  },
});

export class AwsQueryHandler implements ProtocolHandler {
  readonly name = "awsQuery";
  readonly contentType = "application/x-www-form-urlencoded";

  buildRequest(
    input: unknown,
    action: string,
    metadata: ServiceMetadata,
  ): string {
    const params = new URLSearchParams();
    params.append("Action", action);

    const serviceName = metadata.sdkId.toLowerCase() as ServiceName;
    const serviceMeta = awsQueryMetadata[serviceName];

    // The version is part of the XML namespace URL
    const version = serviceMeta?.xmlNamespace.match(/(\d{4}-\d{2}-\d{2})/)?.[0];
    if (version) {
      params.append("Version", version);
    }

    // TODO: Implement metadata-driven request serialization
    this.flattenObject(input as Record<string, any>, "", params);

    return params.toString();
  }

  getHeaders(
    _action: string,
    _metadata: ServiceMetadata,
    _body?: string,
  ): Record<string, string> {
    return {
      "Content-Type": this.contentType,
      "User-Agent": "itty-aws",
    };
  }

  parseResponse(
    responseText: string,
    _statusCode: number,
    action: string,
    metadata: ServiceMetadata,
  ): unknown {
    if (!responseText) return {};

    const serviceName = metadata.sdkId.toLowerCase() as ServiceName;
    const serviceMeta = awsQueryMetadata[serviceName];
    if (!serviceMeta) {
      throw new Error(`No aws-query metadata found for service: ${serviceName}`);
    }

    const operation = serviceMeta.operations[action];
    if (!operation?.output) {
      return {};
    }

    const parsedXml = parser.parse(responseText);
    const responseWrapperName = `${action}Response`;
    const resultWrapperName = `${action}Result`;

    const responseData = parsedXml[responseWrapperName];
    if (!responseData) return {};

    const resultData = responseData[resultWrapperName];
    const outputShapeName = operation.output;
    const outputShape = serviceMeta.shapes[outputShapeName];

    if (!outputShape || resultData === undefined) {
      return {};
    }

    const deserialized = this.deserializeShape(resultData, outputShape, serviceMeta.shapes);

    if (responseData.ResponseMetadata) {
        // AWS Query puts ResponseMetadata at the same level as the Result wrapper
        deserialized.ResponseMetadata = responseData.ResponseMetadata;
    }

    return deserialized;
  }

  parseError(responseText: string, _statusCode: number): unknown {
    if (!responseText) {
      return { __type: "UnknownError", message: "Empty error response" };
    }
    try {
      const parsedXml = parser.parse(responseText);
      const error = parsedXml?.ErrorResponse?.Error;
      if (error) {
        return {
          __type: error.Code || "UnknownError",
          message: error.Message || "An unknown error occurred",
          Type: error.Type,
        };
      }
      return { __type: "UnknownError", message: responseText };
    } catch (e) {
      return { __type: "UnknownError", message: responseText };
    }
  }

  private deserializeShape(data: any, shape: ShapeMetadata, allShapes: Record<string, ShapeMetadata>): any {
    if (data == null) return data;

    switch (shape.type) {
      case "structure": {
        const obj: Record<string, any> = {};
        for (const [memberName, memberInfo] of Object.entries(shape.members ?? {})) {
            const memberShape = allShapes[memberInfo.shape];
            if (!memberShape) continue;

            const xmlName = memberInfo.xmlName || memberName;

            if (memberInfo.xmlAttribute) {
                const attributeName = `@_${xmlName}`;
                if (data[attributeName] != null) {
                    obj[memberName] = this.deserializeShape(data[attributeName], memberShape, allShapes);
                }
            } else if (memberShape.type === "list" && memberInfo.xmlFlattened) {
                const itemXmlName = memberShape.member?.xmlName || xmlName;
                const items = data[itemXmlName];
                if (items != null) {
                    const listData = { [itemXmlName]: items };
                    obj[memberName] = this.deserializeShape(listData, memberShape, allShapes);
                }
            } else {
                if (data[xmlName] != null) {
                    obj[memberName] = this.deserializeShape(data[xmlName], memberShape, allShapes);
                }
            }
        }
        return obj;
      }
      case "list": {
        const memberInfo = shape.member;
        if (!memberInfo) return [];

        const itemXmlName = memberInfo.xmlName || 'member';
        const items = data[itemXmlName];
        if (items == null) return [];

        const memberShape = allShapes[memberInfo.shape];
        const list = Array.isArray(items) ? items : [items];
        return list.map(item => this.deserializeShape(item, memberShape, allShapes));
      }
      case "map": {
        const obj: Record<string, any> = {};
        const entries = Array.isArray(data.entry) ? data.entry : (data.entry ? [data.entry] : []);

        const keyInfo = shape.key;
        const valueInfo = shape.value;
        const keyShape = allShapes[keyInfo.shape];
        const valueShape = allShapes[valueInfo.shape];
        const keyXmlName = keyInfo.xmlName || 'key';
        const valueXmlName = valueInfo.xmlName || 'value';

        if (!keyShape || !valueShape) return {};

        for (const entry of entries) {
            const key = this.deserializeShape(entry[keyXmlName], keyShape, allShapes);
            const value = this.deserializeShape(entry[valueXmlName], valueShape, allShapes);
            obj[key] = value;
        }
        return obj;
      }
      case "timestamp": return new Date(data);
      case "boolean": return data === "true" || data === true;
      case "integer":
      case "long":
      case "float":
      case "double": return Number(data);
      default: return data;
    }
  }

  private flattenObject(
    obj: any,
    prefix: string,
    params: URLSearchParams,
  ): void {
    if (!obj || typeof obj !== "object") return;

    for (const key in obj) {
      if (Object.hasOwn(obj, key)) {
        const value = obj[key];
        const paramKey = prefix ? `${prefix}.${key}` : key;

        if (value !== null && value !== undefined) {
          if (Array.isArray(value)) {
            if (value.length === 0) {
              params.append(paramKey, "");
              continue;
            }
            value.forEach((item, index) => {
              const listMemberKey = `${paramKey}.member.${index + 1}`;
              if (item !== null && typeof item === "object") {
                this.flattenObject(item, listMemberKey, params);
              } else {
                params.append(listMemberKey, String(item));
              }
            });
          } else if (value instanceof Date) {
            params.append(paramKey, value.toISOString());
          } else if (typeof value === "object") {
            this.flattenObject(value, paramKey, params);
          } else {
            params.append(paramKey, String(value));
          }
        }
      }
    }
  }
}
