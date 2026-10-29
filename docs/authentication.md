# Authentication

All API requests must be authenticated and sent over HTTPS. Requests over plain HTTP are rejected.

## API keys

API keys are the primary authentication method. Send the key in the `Authorization` header using the Bearer scheme: `Authorization: Bearer <api_key>`. Keys are created in the dashboard and are shown only once at creation. Each account can hold up to 10 active keys. Keys should be rotated at least every 90 days.

## OAuth 2.0

For server-to-server integrations, the API supports the OAuth 2.0 client credentials grant. Access tokens are obtained from the `/oauth/token` endpoint and expire after 1 hour. Refresh tokens are not issued for the client credentials grant; request a new access token instead.

## Mutual TLS

Mutual TLS (mTLS) is available as an additional authentication layer on the Enterprise plan only.

## Unsupported methods

HTTP Basic authentication and passing API keys as query string parameters are not supported.
