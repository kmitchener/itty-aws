import type { Effect, Data as EffectData } from "effect";
import type { CommonAwsError } from "../../error.ts";
import { AWSServiceClient } from "../../client.ts";

export class KinesisVideoWebRTCStorage extends AWSServiceClient {
  joinStorageSession(
    input: JoinStorageSessionInput,
  ): Effect.Effect<
    {},
    | AccessDeniedException
    | ClientLimitExceededException
    | InvalidArgumentException
    | ResourceNotFoundException
    | CommonAwsError
  > {
    return this.call("JoinStorageSession", input);
  }
  joinStorageSessionAsViewer(
    input: JoinStorageSessionAsViewerInput,
  ): Effect.Effect<
    {},
    | AccessDeniedException
    | ClientLimitExceededException
    | InvalidArgumentException
    | ResourceNotFoundException
    | CommonAwsError
  > {
    return this.call("JoinStorageSessionAsViewer", input);
  }
}

export class KinesisVideoWebrtcStorage extends KinesisVideoWebRTCStorage {}

export default KinesisVideoWebRTCStorage;

export declare class AccessDeniedException extends EffectData.TaggedError(
  "AccessDeniedException",
)<{
  readonly message?: string;
}> {}
export type ChannelArn = string;

export type ClientId = string;

export declare class ClientLimitExceededException extends EffectData.TaggedError(
  "ClientLimitExceededException",
)<{
  readonly message?: string;
}> {}
export declare class InvalidArgumentException extends EffectData.TaggedError(
  "InvalidArgumentException",
)<{
  readonly message?: string;
}> {}
export interface JoinStorageSessionAsViewerInput {
  channelArn: string;
  clientId: string;
}
export interface JoinStorageSessionInput {
  channelArn: string;
}
export declare class ResourceNotFoundException extends EffectData.TaggedError(
  "ResourceNotFoundException",
)<{
  readonly message?: string;
}> {}
export declare namespace JoinStorageSession {
  export type Input = JoinStorageSessionInput;
  export type Output = {};
  export type Error =
    | AccessDeniedException
    | ClientLimitExceededException
    | InvalidArgumentException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace JoinStorageSessionAsViewer {
  export type Input = JoinStorageSessionAsViewerInput;
  export type Output = {};
  export type Error =
    | AccessDeniedException
    | ClientLimitExceededException
    | InvalidArgumentException
    | ResourceNotFoundException
    | CommonAwsError;
}
