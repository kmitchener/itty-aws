import { describe, it, expect } from "vitest";
import { AwsQueryHandler } from "../src/protocols/aws-query";
import type { ServiceMetadata } from "../src/protocols/interface";

describe("AwsQueryHandler", () => {
  const handler = new AwsQueryHandler();
  const serviceMetadata: ServiceMetadata = {
    sdkId: "IAM",
    endpointPrefix: "iam",
    protocol: "aws-query",
    targetPrefix: "", // Not used in aws-query
  };

  describe("parseResponse", () => {
    it("should parse a standard ListUsers response", () => {
      const xmlResponse = `
        <ListUsersResponse xmlns="https://iam.amazonaws.com/doc/2010-05-08/">
          <ListUsersResult>
            <Users>
              <member>
                <Path>/</Path>
                <UserName>testuser1</UserName>
                <UserId>USER1ID</UserId>
                <Arn>arn:aws:iam::123456789012:user/testuser1</Arn>
                <CreateDate>2023-01-01T00:00:00Z</CreateDate>
              </member>
              <member>
                <Path>/test/</Path>
                <UserName>testuser2</UserName>
                <UserId>USER2ID</UserId>
                <Arn>arn:aws:iam::123456789012:user/test/testuser2</Arn>
                <CreateDate>2023-01-02T00:00:00Z</CreateDate>
              </member>
            </Users>
            <IsTruncated>false</IsTruncated>
            <Marker/>
          </ListUsersResult>
          <ResponseMetadata>
            <RequestId>request-id-123</RequestId>
          </ResponseMetadata>
        </ListUsersResponse>
      `;

      const result = handler.parseResponse(
        xmlResponse,
        200,
        "ListUsers",
        serviceMetadata,
      ) as any;

      expect(result.ResponseMetadata).toBeDefined();
      expect(result.ResponseMetadata.RequestId).toBe("request-id-123");
      expect(result.Users).toBeInstanceOf(Array);
      expect(result.Users.length).toBe(2);
      expect(result.Users[0].UserName).toBe("testuser1");
      expect(result.Users[1].Path).toBe("/test/");
      expect(result.IsTruncated).toBe(false);
    });

    it("should handle a single-item list correctly", () => {
        const xmlResponse = `
          <ListUsersResponse xmlns="https://iam.amazonaws.com/doc/2010-05-08/">
            <ListUsersResult>
              <Users>
                <member>
                  <Path>/</Path>
                  <UserName>onlyuser</UserName>
                  <UserId>USERID</UserId>
                  <Arn>arn:aws:iam::123456789012:user/onlyuser</Arn>
                  <CreateDate>2023-01-01T00:00:00Z</CreateDate>
                </member>
              </Users>
              <IsTruncated>false</IsTruncated>
            </ListUsersResult>
            <ResponseMetadata>
              <RequestId>request-id-456</RequestId>
            </ResponseMetadata>
          </ListUsersResponse>
        `;

        const result = handler.parseResponse(
          xmlResponse,
          200,
          "ListUsers",
          serviceMetadata,
        ) as any;

        expect(result.Users).toBeInstanceOf(Array);
        expect(result.Users.length).toBe(1);
        expect(result.Users[0].UserName).toBe("onlyuser");
      });
  });

  describe("parseError", () => {
    it("should parse a standard AWS Query error response", () => {
      const xmlError = `
        <ErrorResponse>
          <Error>
            <Type>Sender</Type>
            <Code>InvalidInput</Code>
            <Message>The request was invalid.</Message>
          </Error>
          <RequestId>error-request-id-789</RequestId>
        </ErrorResponse>
      `;

      const error = handler.parseError(xmlError, 400) as any;

      expect(error.__type).toBe("InvalidInput");
      expect(error.message).toBe("The request was invalid.");
      expect(error.Type).toBe("Sender");
    });

    it("should handle empty error responses", () => {
        const error = handler.parseError("", 400) as any;
        expect(error.__type).toBe("UnknownError");
        expect(error.message).toBe("Empty error response");
    });

    it("should handle non-xml error responses", () => {
        const error = handler.parseError("just plain text", 500) as any;
        expect(error.__type).toBe("UnknownError");
        expect(error.message).toBe("just plain text");
    });
  });
});
