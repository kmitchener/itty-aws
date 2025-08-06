import type { ProtocolHandler, ServiceMetadata } from "./interface.ts";
import { type Ec2ModelMeta, type ShapeMeta, type MemberMeta } from "../ec2-metadata.js";
import { XMLParser } from "fast-xml-parser";

let ec2ModelMeta: Ec2ModelMeta | null = null;

// Lazy load the metadata to avoid circular dependencies
function getEc2ModelMeta(): Ec2ModelMeta | null {
  if (!ec2ModelMeta) {
    try {
      // Try synchronous import (this will only work if the module is already loaded)
      const { ec2ModelMeta: meta } = require("../ec2-metadata.js");
      ec2ModelMeta = meta;
    } catch {
      // If synchronous import fails, return null and fallback to basic implementation
      return null;
    }
  }
  return ec2ModelMeta;
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
  shapes: Record<string, ShapeMeta>,
  shapeId: string,
  value: any,
  prefix: string,
  out: Record<string, string>
) {
  const shape = shapes[shapeId];
  if (!shape) return;

  switch (shape.type) {
    case "structure": {
      if (value == null) return;
      for (const [memberName, member] of Object.entries(shape.members ?? {})) {
        const fieldName = member.locationName ?? memberName;
        const nextPrefix = prefix ? `${prefix}.${fieldName}` : fieldName;
        toParams(shapes, member.target, value[memberName], nextPrefix, out);
      }
      break;
    }

    case "list": {
      if (!Array.isArray(value)) return;
      const memberName = shape.member?.locationName ?? shape.member?.queryName ?? "member";
      // EC2 Query usually uses 1-based indices with no "member" word for many lists (e.g., Filter.1, Filter.1.Value.1)
      // We'll support both patterns by preferring plain indices when flattened=true.
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
        const entryBase = `${prefix}.${shape.flattened ? "" : "entry."}${i}`.replace(/\.$/, "");
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
      // base64 encode if not a string
      out[prefix] = typeof value === "string" ? value : Buffer.from(value).toString("base64");
      break;
    }

    default /* string, etc. */: {
      if (value == null) return;
      out[prefix] = String(value);
    }
  }
}

function fromXml(
  shapes: Record<string, ShapeMeta>,
  shapeId: string,
  node: any
): any {
  const shape = shapes[shapeId];
  if (!shape) return node;

  switch (shape.type) {
    case "structure": {
      const out: any = {};
      for (const [memberName, member] of Object.entries(shape.members ?? {})) {
        const key = member.locationName ?? memberName;
        const child = node?.[key];
        if (child !== undefined) {
          out[memberName] = fromXml(shapes, member.target, child);
        }
      }
      return out;
    }

    case "list": {
      const memberName = shape.member?.locationName ?? shape.member?.queryName ?? "member";
      const flattened = shape.member?.flattened || shape.flattened;
      const arrNode = flattened ? node : node?.[memberName];
      const items = Array.isArray(arrNode) ? arrNode : arrNode != null ? [arrNode] : [];
      return items.map((it) => fromXml(shapes, shape.member!.target, it));
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
      // Coerce common forms
      if (typeof node === "number") return new Date(node * 1000).toISOString();
      if (/^\d+$/.test(String(node))) return new Date(Number(node) * 1000).toISOString();
      const d = new Date(node);
      return isNaN(+d) ? node : d.toISOString();
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
  // Find the top-level wrapper: <ActionResponse>…</ActionResponse>
  const keys = Object.keys(doc);
  return keys.find(key => key.endsWith("Response")) || keys[0];
}

export const Ec2QueryHandler: ProtocolHandler = {
  name: "ec2Query",
  contentType: "application/x-www-form-urlencoded; charset=utf-8",

  buildRequest(input, action, metadata) {
    const model = getEc2ModelMeta();
    
    // Fallback to basic implementation if model metadata is not available
    if (!model) {
      const params = new URLSearchParams();
      params.append("Action", action);
      params.append("Version", "2016-11-15");
      
      // Basic parameter serialization (without schema validation)
      if (input && typeof input === 'object') {
        for (const [key, value] of Object.entries(input as Record<string, any>)) {
          if (value != null) {
            params.append(key, String(value));
          }
        }
      }
      
      return params.toString();
    }

    const op = model.operations[action];
    if (!op) throw new Error(`Unknown EC2 operation: ${action}`);

    const params: Record<string, string> = {
      Action: op.name,
      Version: model.version,
    };

    if (op.input && input) {
      toParams(model.shapes, op.input, input, "", params);
    }

    // Form-encode (EC2 accepts POST with body form-encoded)
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) usp.append(k, v);
    return usp.toString();
  },

  getHeaders(action, metadata, body) {
    return {
      "Content-Type": this.contentType,
      "User-Agent": "itty-aws",
    };
  },

  parseResponse(xmlText, statusCode) {
    if (statusCode >= 400) return this.parseError(xmlText, statusCode);

    const doc = safeParseXml(xmlText);
    if (!doc) return {};

    // Find the top-level wrapper: <ActionResponse>…</ActionResponse>
    const wrapperName = findResponseWrapperName(doc);
    const payloadNode = doc[wrapperName] ?? doc;
    
    const model = getEc2ModelMeta();
    
    // If model is not available, return basic parsing
    if (!model) return payloadNode;

    // Find operation by wrapper name
    const opName = wrapperName.replace(/Response$/, "");
    const opMeta = model.operations[opName];
    const outShape = opMeta?.output;
    
    if (!outShape) return payloadNode;

    return fromXml(model.shapes, outShape, payloadNode);
  },

  parseError(xmlText, statusCode, headers) {
    const doc = safeParseXml(xmlText);

    // Handle common patterns:
    // 1) <Response><Errors><Error><Code>..</Code><Message>..</Message></Error></Errors><RequestID>..</RequestID></Response>
    // 2) <ErrorResponse><Error><Code>..</Code><Message>..</Message></Error><RequestId>..</RequestId></ErrorResponse>
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
  },
};