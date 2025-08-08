import type { ProtocolHandler } from "./interface.ts";

// Lazy handler factory functions
type HandlerFactory = () => ProtocolHandler;

export class ProtocolRegistry {
  private handlers = new Map<string, ProtocolHandler>();
  private handlerFactories = new Map<string, HandlerFactory>();

  register(protocol: string, handler: ProtocolHandler): void {
    this.handlers.set(protocol, handler);
  }

  registerFactory(protocol: string, factory: HandlerFactory): void {
    this.handlerFactories.set(protocol, factory);
  }

  get(protocol: string): ProtocolHandler {
    // Check if handler is already instantiated
    let handler = this.handlers.get(protocol);
    if (handler) {
      return handler;
    }

    // Try to create handler from factory
    const factory = this.handlerFactories.get(protocol);
    if (factory) {
      handler = factory();
      this.handlers.set(protocol, handler);
      return handler;
    }

    throw new Error(`Unknown protocol: ${protocol}`);
  }

  has(protocol: string): boolean {
    return this.handlers.has(protocol) || this.handlerFactories.has(protocol);
  }

  getSupportedProtocols(): string[] {
    const instantiatedProtocols = Array.from(this.handlers.keys());
    const factoryProtocols = Array.from(this.handlerFactories.keys());
    return [...new Set([...instantiatedProtocols, ...factoryProtocols])];
  }

  static createDefault(): ProtocolRegistry {
    const registry = new ProtocolRegistry();

    // Register protocol handler factories instead of instances
    // This way handlers are only imported when actually needed
    registry.registerFactory("awsJson1_0", () => {
      const { AwsJson10Handler } = require("./aws-json-1-0.js");
      return new AwsJson10Handler();
    });

    registry.registerFactory("awsJson1_1", () => {
      const { AwsJson11Handler } = require("./aws-json-1-1.js");
      return new AwsJson11Handler();
    });

    registry.registerFactory("restJson1", () => {
      const { RestJson1Handler } = require("./rest-json-1.js");
      return new RestJson1Handler();
    });

    registry.registerFactory("awsQuery", () => {
      const { AwsQueryHandler } = require("./aws-query.js");
      return new AwsQueryHandler();
    });

    registry.registerFactory("ec2Query", () => {
      const { Ec2QueryHandler } = require("./ec2-query.js");
      return new Ec2QueryHandler();
    });

    registry.registerFactory("restXml", () => {
      const { RestXmlHandler } = require("./rest-xml.js");
      return new RestXmlHandler();
    });

    return registry;
  }
}
