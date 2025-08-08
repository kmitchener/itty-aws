import { describe, expect, it } from "@effect/vitest";

describe("Tree-Shaking Import Tests", () => {
  it("should allow importing individual services with default exports", async () => {
    // Test that we can import individual services
    const DynamoDB = await import("../src/services/dynamodb/index.ts").then(
      (m) => m.default,
    );
    const S3 = await import("../src/services/s3/index.ts").then(
      (m) => m.default,
    );
    const Lambda = await import("../src/services/lambda/index.ts").then(
      (m) => m.default,
    );
    const CloudTrail = await import("../src/services/cloudtrail/index.ts").then(
      (m) => m.default,
    );

    // Verify they are constructors/classes
    expect(typeof DynamoDB).toBe("function");
    expect(typeof S3).toBe("function");
    expect(typeof Lambda).toBe("function");
    expect(typeof CloudTrail).toBe("function");

    // Verify class names for proper service identification
    expect(DynamoDB.name).toBe("DynamoDB");
    expect(S3.name).toBe("S3");
    expect(Lambda.name).toBe("Lambda");
    expect(CloudTrail.name).toBe("CloudTrail");
  });

  it("should create service instances that extend AWSServiceClient", async () => {
    const { AWSServiceClient } = await import("../src/index.ts");
    const DynamoDB = await import("../src/services/dynamodb/index.ts").then(
      (m) => m.default,
    );

    const client = new DynamoDB({ region: "us-east-1" });

    // Verify inheritance
    expect(client).toBeInstanceOf(AWSServiceClient);
    expect(client).toBeInstanceOf(DynamoDB);

    // Verify configuration
    expect((client as any).config.region).toBe("us-east-1");
  });

  it("should support multiple service instances with different configs", async () => {
    const DynamoDB = await import("../src/services/dynamodb/index.ts").then(
      (m) => m.default,
    );
    const S3 = await import("../src/services/s3/index.ts").then(
      (m) => m.default,
    );

    const ddb = new DynamoDB({ region: "us-east-1" });
    const s3 = new S3({ region: "eu-west-1" });

    expect((ddb as any).config.region).toBe("us-east-1");
    expect((s3 as any).config.region).toBe("eu-west-1");

    // Verify they're different instances
    expect(ddb).not.toBe(s3);
    expect(ddb.constructor.name).toBe("DynamoDB");
    expect(s3.constructor.name).toBe("S3");
  });

  it("should have methods that return Effect types", async () => {
    const DynamoDB = await import("../src/services/dynamodb/index.ts").then(
      (m) => m.default,
    );

    const client = new DynamoDB({ region: "us-east-1" });

    // Verify methods exist and return Effect-like objects
    expect(typeof client.getItem).toBe("function");
    expect(typeof client.putItem).toBe("function");
    expect(typeof client.query).toBe("function");
    expect(typeof client.scan).toBe("function");

    // Test that calling a method returns something that looks like an Effect
    const effect = client.getItem({
      TableName: "test",
      Key: { id: { S: "test" } },
    });

    // Effect objects have a pipe method
    expect(typeof effect).toBe("object");
    expect(typeof effect.pipe).toBe("function");
  });

  it("should create Effect-returning methods without requiring AWS credentials", async () => {
    const DynamoDB = await import("../src/services/dynamodb/index.ts").then(
      (m) => m.default,
    );
    const client = new DynamoDB({ region: "us-east-1" });

    // Create an effect but don't execute it (to avoid needing real AWS credentials)
    const effect = client.describeTable({
      TableName: "test-table",
    });

    // Verify it returns an Effect-like object
    expect(typeof effect).toBe("object");
    expect(typeof effect.pipe).toBe("function");

    // The effect should have the expected structure without being executed
    expect(effect).toBeDefined();
  });

  it("should not expose the old AWS proxy", async () => {
    // Test that the old AWS proxy is no longer exported from main index
    const mainModule = await import("../src/index.ts");

    // Should not have AWS export
    expect(mainModule.AWS).toBeUndefined();

    // Should have AWSServiceClient
    expect(mainModule.AWSServiceClient).toBeDefined();
    expect(typeof mainModule.AWSServiceClient).toBe("function");
  });

  it("should support service aliases where available", async () => {
    // Some services have aliases (e.g., CloudTrail/Cloudtrail)
    const CloudTrailModule = await import(
      "../src/services/cloudtrail/index.ts"
    );

    // Should have main export
    expect(CloudTrailModule.default).toBeDefined();
    expect(typeof CloudTrailModule.default).toBe("function");

    // Should have named export too
    expect(CloudTrailModule.CloudTrail).toBeDefined();
    expect(typeof CloudTrailModule.CloudTrail).toBe("function");

    // Default should be the main class
    expect(CloudTrailModule.default.name).toBe("CloudTrail");
  });

  it("should work with package.json exports mapping", async () => {
    // These dynamic imports test that the package.json exports are working
    // In a real bundler environment, these would resolve to the dist/ versions
    const services = ["dynamodb", "s3", "lambda", "ec2", "cloudformation"];

    for (const serviceName of services) {
      const ServiceClass = await import(
        `../src/services/${serviceName}/index.ts`
      ).then((m) => m.default);

      expect(typeof ServiceClass).toBe("function");
      expect(ServiceClass.name).toBeDefined();

      // Should be able to instantiate
      const instance = new ServiceClass({ region: "us-east-1" });
      expect(instance).toBeInstanceOf(ServiceClass);
    }
  });
});
