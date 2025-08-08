import type { Effect, Data as EffectData } from "effect";
import type { CommonAwsError } from "../../error.ts";
import { AWSServiceClient } from "../../client.ts";
import { RestJson1Protocol } from "../../protocols/restjson1.js";

export class ApiGatewayManagementApi extends AWSServiceClient {
  constructor(cfg: any) {
    super("apigatewaymanagementapi", new RestJson1Protocol(), cfg);
  }

  deleteConnection(
    input: DeleteConnectionRequest,
  ): Effect.Effect<
    {},
    ForbiddenException | GoneException | LimitExceededException | CommonAwsError
  > {
    return this.call("DeleteConnection", input);
  }
  getConnection(
    input: GetConnectionRequest,
  ): Effect.Effect<
    GetConnectionResponse,
    ForbiddenException | GoneException | LimitExceededException | CommonAwsError
  > {
    return this.call("GetConnection", input);
  }
  postToConnection(
    input: PostToConnectionRequest,
  ): Effect.Effect<
    {},
    ForbiddenException | GoneException | LimitExceededException | PayloadTooLargeException | CommonAwsError
  > {
    return this.call("PostToConnection", input);
  }
}

export class Apigatewaymanagementapi extends ApiGatewayManagementApi {}

export default ApiGatewayManagementApi;

export type __string = string;

export type __timestampIso8601 = Date | string;

export type Data = Uint8Array | string;

export interface DeleteConnectionRequest {
  ConnectionId: string;
}
export declare class ForbiddenException extends EffectData.TaggedError(
  "ForbiddenException",
)<{
}> {}
export interface GetConnectionRequest {
  ConnectionId: string;
}
export interface GetConnectionResponse {
  ConnectedAt?: Date | string;
  Identity?: Identity;
  LastActiveAt?: Date | string;
}
export declare class GoneException extends EffectData.TaggedError(
  "GoneException",
)<{
}> {}
export interface Identity {
  SourceIp: string;
  UserAgent: string;
}
export declare class LimitExceededException extends EffectData.TaggedError(
  "LimitExceededException",
)<{
}> {}
export declare class PayloadTooLargeException extends EffectData.TaggedError(
  "PayloadTooLargeException",
)<{
  readonly Message?: string;
}> {}
export interface PostToConnectionRequest {
  Data: Uint8Array | string;
  ConnectionId: string;
}
export declare namespace DeleteConnection {
  export type Input = DeleteConnectionRequest;
  export type Output = {};
  export type Error =
    | ForbiddenException
    | GoneException
    | LimitExceededException
    | CommonAwsError;
}

export declare namespace GetConnection {
  export type Input = GetConnectionRequest;
  export type Output = GetConnectionResponse;
  export type Error =
    | ForbiddenException
    | GoneException
    | LimitExceededException
    | CommonAwsError;
}

export declare namespace PostToConnection {
  export type Input = PostToConnectionRequest;
  export type Output = {};
  export type Error =
    | ForbiddenException
    | GoneException
    | LimitExceededException
    | PayloadTooLargeException
    | CommonAwsError;
}

