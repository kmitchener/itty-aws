# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`itty-aws` is a lightweight AWS SDK implementation for [Effect](https://effect.website) that provides type-safe AWS service clients generated from official AWS API specifications. Each service is individually importable for optimal tree-shaking, and implements aws4fetch for request signing.

## Development Commands

### Build and Test
- `bun run build` - Compile TypeScript to dist/
- `bun run test` - Run all tests with Vitest
- `bun run test:run` - Run tests once (no watch mode)
- `bun run test:watch` - Run tests in watch mode
- `bun vitest run ./test/smoke.test.ts` - Run specific test file

### Code Generation
- `bun run generate` or `bun gen` - Generate all service clients from AWS models + lint + build
- `bun scripts/generate-clients.ts` - Generate service clients only
- `bun scripts/generate-ec2-parsers.ts` - Generate EC2 XML parsers

### Code Quality
- `bun biome check` - Run linter
- `bun biome check --write` - Run linter with auto-fix
- `bun biome format` - Format code

### Bundle Analysis
- `bun scripts/bundle-size.ts` - Analyze bundle size

## Architecture

### Core Components

1. **AWSServiceClient (`src/client.ts`)**: Base class that all services extend
2. **Individual Services (`src/services/`)**: Tree-shakable service classes with complete implementations
3. **Service Proxy (`src/client.ts`)**: Core client implementation with request/response handling
4. **AWS Models (`aws-models/`)**: Git submodule containing official AWS API specifications

### Key Files

- `src/client.ts`: Core AWS client base class and service proxy implementation
- `src/index.ts`: Main exports (AWSServiceClient and types)
- `src/metadata.ts`: Service metadata (endpoints, protocols, target prefixes)
- `src/error.ts`: Common AWS error types and tagged error implementations
- `src/ec2-parsers.ts`: Auto-generated XML parsers for EC2 Query protocol

### Code Generation Process

1. AWS API models are stored as Smithy JSON in `aws-models/models/`
2. `scripts/generate-clients.ts` reads these models and generates TypeScript runtime classes
3. Each service gets its own file in `src/services/` with complete implementations and default exports
4. Services extend `AWSServiceClient` and delegate to the service proxy for actual AWS calls

### Request Flow

1. `import ServiceName from "itty-aws/servicename"` imports individual service
2. `new ServiceName(config)` creates a service instance extending `AWSServiceClient`
3. Method calls like `client.methodName(input)` delegate to the service proxy
4. `createServiceProxy` converts the call to AWS API format
5. Request is signed with aws4fetch and sent to AWS
6. Response is parsed based on service protocol (JSON, XML, Query)
7. Errors are converted to typed Effect errors

### Protocols Supported

- `awsJson1_0` / `awsJson1_1`: JSON-based protocols (DynamoDB, etc.)
- `restJson1`: REST JSON protocol (S3, API Gateway, etc.)
- `ec2Query`: EC2-specific XML query protocol with custom parsers
- `awsQuery`: General XML query protocol

## Important Notes

- Uses Effect.js for functional error handling and composable operations
- All operations return `Effect<Success, Error, Requirements>` values
- Credentials are resolved automatically using AWS credential chain
- Tree-shakable: import only the services you need for optimal bundle size
- Each service is individually exported via package.json exports (e.g., "itty-aws/dynamodb")
- XML protocols (S3) are not fully supported yet
- Service generation requires the aws-models git submodule to be present

## Testing

Tests are located in `test/` and use Vitest. The test suite includes:
- `smoke.test.ts`: Basic integration tests
- `ec2-*.test.ts`: EC2-specific protocol tests
- `content-type.test.ts`: Content-Type header validation

Run tests with AWS credentials configured for integration tests to pass.