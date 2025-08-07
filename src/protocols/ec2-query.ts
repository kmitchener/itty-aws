import { XMLParser } from "fast-xml-parser";
import type { ProtocolHandler, ServiceMetadata } from "./interface.ts";

let ec2ModelMeta: any = null;

// Try to load the metadata synchronously at module load time
try {
  // Use dynamic import but don't await it - this will fail gracefully
  import("../ec2-metadata.js")
    .then(({ ec2ModelMeta: meta }) => {
      ec2ModelMeta = meta;
    })
    .catch(() => {
      // Metadata not available, will use fallback
      ec2ModelMeta = null;
    });
} catch {
  // Module not found or error during import
}

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  attributeNamePrefix: "",
  parseTagValue: true,
  isArray: () => false, // we'll normalize arrays manually
});

function safeParseXml(xmlText: string): any {
  try {
    return xmlParser.parse(xmlText);
  } catch {
    return null;
  }
}

function toParams(
  shapes: Record<string, any>,
  shapeId: string,
  value: any,
  prefix: string,
  out: Record<string, string>,
) {
  const shape = shapes?.[shapeId];
  if (!shape) return;

  switch (shape.type) {
    case "structure": {
      if (value == null) return;
      for (const [memberName, member] of Object.entries(shape.members ?? {})) {
        const fieldName = (member as any).locationName ?? memberName;
        const nextPrefix = prefix ? `${prefix}.${fieldName}` : fieldName;
        toParams(
          shapes,
          (member as any).target,
          value[memberName],
          nextPrefix,
          out,
        );
      }
      break;
    }

    case "list": {
      if (!Array.isArray(value)) return;
      const memberName =
        shape.member?.locationName ?? shape.member?.queryName ?? "member";
      const flattened = shape.member?.flattened || shape.flattened;
      value.forEach((item, i) => {
        const idx = i + 1;
        const base = flattened
          ? `${prefix}.${idx}` // e.g., "GroupId.1"
          : `${prefix}.${memberName}.${idx}`; // e.g., "TagSet.member.1"
        toParams(shapes, shape.member!.target, item, base, out);
      });
      break;
    }

    case "map": {
      if (!value || typeof value !== "object") return;
      let i = 1;
      for (const [k, v] of Object.entries(value)) {
        const entryBase =
          `${prefix}.${shape.flattened ? "" : "entry."}${i}`.replace(/\.$/, "");
        toParams(shapes, shape.key!.target, k, `${entryBase}.key`, out);
        toParams(shapes, shape.value!.target, v, `${entryBase}.value`, out);
        i++;
      }
      break;
    }

    case "timestamp": {
      if (value == null) return;
      const fmt = (shape as any).timestampFormat ?? "iso8601";
      const str =
        fmt === "epoch-seconds"
          ? Math.floor(new Date(value).getTime() / 1000).toString()
          : fmt === "http-date"
            ? new Date(value).toUTCString()
            : new Date(value).toISOString();
      out[prefix] = str;
      break;
    }

    case "boolean": {
      if (value == null) return;
      out[prefix] = value ? "true" : "false";
      break;
    }

    case "integer": {
      if (value == null) return;
      out[prefix] = String(value);
      break;
    }

    case "blob": {
      if (value == null) return;
      out[prefix] =
        typeof value === "string"
          ? value
          : Buffer.from(value).toString("base64");
      break;
    }

    default: /* string, etc. */ {
      if (value == null) return;
      out[prefix] = String(value);
    }
  }
}

function fromXml(shapes: Record<string, any>, shapeId: string, node: any): any {
  const shape = shapes?.[shapeId];
  if (!shape) return node;

  switch (shape.type) {
    case "structure": {
      const out: any = {};
      for (const [memberName, member] of Object.entries(shape.members ?? {})) {
        const key = (member as any).locationName ?? memberName;
        const child = node?.[key];
        if (child !== undefined) {
          out[memberName] = fromXml(shapes, (member as any).target, child);
        }
      }
      return out;
    }

    case "list": {
      const memberName =
        shape.member?.locationName ?? shape.member?.queryName ?? "member";
      const flattened = shape.member?.flattened || shape.flattened;
      const arrNode = flattened ? node : node?.[memberName];
      const items = Array.isArray(arrNode)
        ? arrNode
        : arrNode != null
          ? [arrNode]
          : [];
      return items.map((it: any) => fromXml(shapes, shape.member!.target, it));
    }

    case "map": {
      const entry = shape.flattened ? node : node?.entry;
      const items = Array.isArray(entry) ? entry : entry != null ? [entry] : [];
      const out: any = {};
      for (const it of items) {
        const k = fromXml(shapes, shape.key!.target, it.key);
        const v = fromXml(shapes, shape.value!.target, it.value);
        out[k] = v;
      }
      return out;
    }

    case "timestamp": {
      if (typeof node === "number") return new Date(node * 1000).toISOString();
      if (/^\d+$/.test(String(node)))
        return new Date(Number(node) * 1000).toISOString();
      const d = new Date(node);
      return Number.isNaN(+d) ? node : d.toISOString();
    }

    case "boolean":
      return String(node) === "true";

    case "integer":
      return Number(node);

    case "blob":
      return typeof node === "string" ? node : node?.toString?.("base64");

    default:
      return node?.toString?.() ?? node;
  }
}

function findResponseWrapperName(doc: any): string {
  const keys = Object.keys(doc);
  return keys.find((key) => key.endsWith("Response")) || keys[0];
}

export class Ec2QueryHandler implements ProtocolHandler {
  readonly name = "ec2Query";
  readonly contentType = "application/x-www-form-urlencoded; charset=utf-8";

  buildRequest(
    input: unknown,
    action: string,
    _metadata: ServiceMetadata,
  ): string {
    // For now, use fallback synchronous implementation
    // The enhanced version with metadata will be used when available
    const params = new URLSearchParams();
    params.append("Action", action);
    params.append("Version", "2016-11-15");

    // Try to use enhanced flattening if metadata is available synchronously
    if (ec2ModelMeta) {
      const op = ec2ModelMeta.operations[action];
      if (op) {
        const enhancedParams: Record<string, string> = {
          Action: op.name,
          Version: ec2ModelMeta.version,
        };

        if (op.input && input) {
          toParams(ec2ModelMeta.shapes, op.input, input, "", enhancedParams);
        }

        const usp = new URLSearchParams();
        for (const [k, v] of Object.entries(enhancedParams)) usp.append(k, v);
        return usp.toString();
      }
    } else {
      //FIXME: should throw error
    }

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
    statusCode: number,
    _action: string,
    _metadata: ServiceMetadata,
  ): unknown {
    if (statusCode >= 400) return this.parseError(responseText, statusCode);
    if (!responseText) return {};

    const doc = safeParseXml(responseText);
    if (!doc) return {};

    // Try to use enhanced parsing if metadata is available synchronously
    if (ec2ModelMeta) {
      const wrapperName = findResponseWrapperName(doc);
      const payloadNode = doc[wrapperName] ?? doc;

      const opName = wrapperName.replace(/Response$/, "");
      const opMeta = ec2ModelMeta.operations[opName];
      const outShape = opMeta?.output;

      if (outShape) {
        return fromXml(ec2ModelMeta.shapes, outShape, payloadNode);
      }
    } else {
      //FIXME let's simplify so there's no if condition here
    }
  }

  parseError(
    responseText: string,
    statusCode: number,
    headers?: Headers,
  ): unknown {
    const doc = safeParseXml(responseText);

    const err =
      doc?.Response?.Errors?.Error ??
      doc?.ErrorResponse?.Error ??
      doc?.Response?.Error ??
      null;

    const code = err?.Code ?? err?.code ?? "UnknownError";
    const message = err?.Message ?? err?.message ?? "Unknown error";
    const requestId =
      doc?.Response?.RequestID ??
      doc?.ErrorResponse?.RequestId ??
      doc?.Response?.RequestId ??
      headers?.get("x-amzn-RequestId") ??
      null;

    const e: any = new Error(message);
    e.name = String(code);
    e.$metadata = { statusCode, requestId };
    return e;
  }
}
