# itty-aws

A lightweight AWS SDK implementation for [Effect](https://effect.website) implemented with a single [Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) and types generated from the AWS API specifications. 

`itty-aws` captures the entire AWS API surface area, including each API's exact error codes:

- **Effect**: Type-safe error handling, built-in retries, composable operations
- **Simple API**: `client.apiName(..)` instead of `client.send(Command)`
- **Tree-shakable**: Import only the services you need for optimal bundle size
- **Lightweight**: Much smaller than AWS SDK v3
- **Fast cold starts**: No impact on Lambda startup times

```ts
import DynamoDB from "itty-aws/dynamodb";
import { Effect, Schedule } from "effect";

const ddb = new DynamoDB({ region: "us-east-1" });

// Type-safe operations with built-in error handling
const program = Effect.gen(function* () {
  const user = yield* ddb.getItem({
    TableName: "users",
    Key: { id: { S: "123" } }
  }).pipe(
    Effect.catchTag("ResourceNotFoundException", () => 
      Effect.succeed({ Item: undefined })
    ),
    Effect.retry({
      times: 3,
      schedule: Schedule.exponential("1 second")
    })
  );

  return user.Item;
});
```

## Why?

The official AWS SDK v3 is a massive 200+ NPM package monorepo with an awkward `client.send(new Command())` syntax that is a heavy dependency in your bundle. The `@effect-aws/*` project adapts the AWS SDK v3 to Effect, but at the cost of an additional 200+ NPM packages. 

`itty-aws` implements a standlone AWS SDK with a single PM package containing a `Proxy` and types generated from the Smithy spec. 

`itty-aws` supports direct method calls with tree-shakable imports. Instead of the clunky `client.send(new Command())` syntax, `itty-aws` supports `client.apiName(..)` syntax:

```ts
import DynamoDB from "itty-aws/dynamodb";

const client = new DynamoDB({ region: "us-east-1" });

// instead of just simply calling a method
yield* client.getItem({
  TableName: "users",
  Key: { id: { S: "123" } }
})
```

Compare this to the official AWS SDK v3, which requires you to construct a Command:

```ts
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });

// instead of just simply calling a method
await client.send(new GetItemCommand({
  TableName: "users",
  Key: { id: { S: "123" } }
}))
```

## Installation

```bash
npm install itty-aws effect
```

> [!NOTE]
> `itty-aws` requires [Effect](https://effect.website) as a peer dependency for type-safe error handling and composable operations.

## Usage

Import individual services for optimal tree-shaking and create a client for the service you want to use. Each service exposes its APIs as methods that return `Effect` values with the correct response and error types.

```ts
import DynamoDB from "itty-aws/dynamodb";
import { Effect, Console, Schedule } from "effect";

const ddb = new DynamoDB({ region: "us-east-1" });

const program = Effect.gen(function* () {
  // All operations return Effect values with typed errors
  const response = yield* ddb.getItem({
    TableName: "my-table",
    Key: { pk: { S: "user#123" } }
  }).pipe(
    // Handle specific AWS errors
    Effect.catchTag("ResourceNotFoundException", () => 
      Effect.succeed({ Item: undefined })
    ),
    // Built-in retry with exponential backoff
    Effect.retry({
      times: 3,
      schedule: Schedule.exponential("1 second"),
      while: (error) => error._tag === "ThrottlingException"
    }),
    Effect.timeout("30 seconds")
  );
  
  yield* Console.log("Item:", response.Item);
});

// Execute the program
Effect.runPromise(program);
```

## Tree-Shakable Service Imports

Each AWS service can be imported individually for optimal bundle size:

```ts
// Import only the services you need
import DynamoDB from "itty-aws/dynamodb";
import S3 from "itty-aws/s3";
import Lambda from "itty-aws/lambda";

// Create clients for each service
const ddb = new DynamoDB({ region: "us-east-1" });
const s3 = new S3({ region: "us-west-2" });
const lambda = new Lambda({ region: "eu-west-1" });
```

Available service imports include all AWS services:
- `itty-aws/dynamodb` - DynamoDB
- `itty-aws/s3` - S3
- `itty-aws/lambda` - Lambda
- `itty-aws/ec2` - EC2
- `itty-aws/cloudformation` - CloudFormation
- And 400+ more services...

## Exact Error Modeling

Each operation's `Effect.Effect` type specifies exactly which errors can occur:

```ts
putItem(
  input: PutItemInput,
): Effect.Effect<
  PutItemOutput,
  | ConditionalCheckFailedException
  | InternalServerError
  | InvalidEndpointException
  | ItemCollectionSizeLimitExceededException
  | ProvisionedThroughputExceededException
  | ReplicatedWriteConflictException
  | RequestLimitExceeded
  | ResourceNotFoundException
  | TransactionConflictException
  | CommonAwsError
>;
```

## How It Works

We use the official AWS API models from the [`aws/api-models-aws`](https://github.com/aws/api-models-aws) repository as a git submodule to bring in the latest published models from AWS.

The Smithy specifications are then used to generate TypeScript types (types only, no runtime code) for each service in [src/services](src/services).

Each service is generated as a class that extends `AWSServiceClient` from [src/client.ts](src/client.ts). The base class contains a service proxy that:
1. Dynamically constructs service clients based on the class name
2. Intercepts method calls to infer the API name 
3. Submits requests to AWS via `aws4fetch` which signs the request

All service errors are modeled with TaggedErrors as `declare class` to avoid runtime code size costs while maintaining full type safety.

## Status

The entire AWS SDK (including all Services and APIs) fits in to a

- Minified bundle size of: `1347.3 KB`.
- Un-minified bundle size of: `2066.0 KB`.
- Core bundle size (excluding Effect.js): `1215.3 KB`.

