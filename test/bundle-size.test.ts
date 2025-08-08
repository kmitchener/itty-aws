import { describe, expect, it } from "@effect/vitest";

describe("Bundle Size and Tree-Shaking Tests", () => {
  it("should only import necessary services", async () => {
    // Test that importing a single service doesn't pull in others
    const DynamoDBModule = await import("../src/services/dynamodb/index.ts");

    // Should have the main service and types, but not other services
    expect(DynamoDBModule.default).toBeDefined();
    expect(DynamoDBModule.DynamoDB).toBeDefined();

    // Should not have other services in this module
    expect((DynamoDBModule as any).S3).toBeUndefined();
    expect((DynamoDBModule as any).Lambda).toBeUndefined();
    expect((DynamoDBModule as any).EC2).toBeUndefined();
  });

  it("should allow importing multiple services independently", async () => {
    // Import services dynamically to test tree-shaking
    const modules = await Promise.all([
      import("../src/services/dynamodb/index.ts"),
      import("../src/services/s3/index.ts"),
      import("../src/services/lambda/index.ts"),
    ]);

    const [ddbModule, s3Module, lambdaModule] = modules;

    // Each module should only export its own service
    expect(ddbModule.default.name).toBe("DynamoDB");
    expect(s3Module.default.name).toBe("S3");
    expect(lambdaModule.default.name).toBe("Lambda");

    // Modules should be independent
    expect(ddbModule.default).not.toBe(s3Module.default);
    expect(s3Module.default).not.toBe(lambdaModule.default);
  });

  it("should not have circular dependencies between services", async () => {
    // Test that services can be imported without causing circular dependency issues
    const serviceImports = ["dynamodb", "s3", "lambda", "ec2", "rds"].map(
      (service) =>
        import(`../src/services/${service}/index.ts`).then((m) => ({
          name: service,
          module: m,
          defaultExport: m.default,
        })),
    );

    const services = await Promise.all(serviceImports);

    // All should import successfully
    for (const service of services) {
      expect(service.defaultExport).toBeDefined();
      expect(typeof service.defaultExport).toBe("function");
    }

    // Should be able to instantiate all without conflicts
    const instances = services.map(
      (service) => new service.defaultExport({ region: "us-east-1" }),
    );

    expect(instances.length).toBe(5);

    // Each instance should have the correct constructor name
    const expectedNames = ["DynamoDB", "S3", "Lambda", "EC2", "RDS"];
    instances.forEach((instance, index) => {
      expect(instance.constructor.name).toBe(expectedNames[index]);
    });
  });

  it("should support conditional imports for code splitting", async () => {
    // Test dynamic imports that would support code splitting
    let DynamoDBClass: any = null;
    let S3Class: any = null;

    // Simulate conditional loading
    const needsDynamoDB = true;
    const needsS3 = false;

    if (needsDynamoDB) {
      DynamoDBClass = (await import("../src/services/dynamodb/index.ts"))
        .default;
    }

    if (needsS3) {
      S3Class = (await import("../src/services/s3/index.ts")).default;
    }

    // Only DynamoDB should be loaded
    expect(DynamoDBClass).toBeDefined();
    expect(S3Class).toBeNull();

    // Should be able to use the conditionally loaded service
    const ddb = new DynamoDBClass({ region: "us-east-1" });
    expect(ddb.constructor.name).toBe("DynamoDB");
  });

  it("should have minimal import surface area", async () => {
    // Test that individual service modules don't export unnecessary items
    const CloudTrailModule = await import(
      "../src/services/cloudtrail/index.ts"
    );

    const exports = Object.keys(CloudTrailModule);

    // Should have the main exports we expect
    expect(exports).toContain("default");
    expect(exports).toContain("CloudTrail");

    // Should have error types and interfaces, but the exact count will vary
    // The important thing is it shouldn't have other services
    const serviceExports = exports.filter(
      (key) =>
        key.match(/^[A-Z][a-z]+$/) &&
        !key.includes("Exception") &&
        !key.includes("Error"),
    );

    // Should only have CloudTrail-related service exports, not other AWS services
    const otherServices = serviceExports.filter(
      (key) => !["CloudTrail", "Cloudtrail"].includes(key),
    );

    expect(otherServices.length).toBe(0);
  });

  it("should maintain type safety with tree-shakable imports", async () => {
    const DynamoDB = (await import("../src/services/dynamodb/index.ts"))
      .default;
    const client = new DynamoDB({ region: "us-east-1" });

    // TypeScript should maintain proper typing
    expect(typeof client.getItem).toBe("function");
    expect(typeof client.putItem).toBe("function");
    expect(typeof client.query).toBe("function");

    // Should not have methods from other services
    expect((client as any).listBuckets).toBeUndefined(); // S3 method
    expect((client as any).invoke).toBeUndefined(); // Lambda method
  });
});
