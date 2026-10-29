# API Rate Limits

Rate limits are applied per API key using a sliding one-minute window.

## Limits by plan

- Free: 60 requests per minute
- Pro: 600 requests per minute
- Enterprise: custom, set in the contract

Short bursts of up to 2x the per-minute limit are tolerated for at most 10 seconds.

## Exceeding the rate limit

When a client exceeds its rate limit, the API rejects the request with HTTP status 429 Too Many Requests. The response includes a `Retry-After` header giving the number of seconds to wait before retrying. Rejected requests are not counted against the monthly quota.

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers so clients can throttle themselves before hitting the limit.

If a key keeps exceeding its limit continuously for more than 15 minutes, the key is temporarily blocked for 1 hour and the account owner is notified by email.

## Recommended client behavior

Clients should retry 429 responses with exponential backoff, starting at the `Retry-After` value and doubling on each attempt, up to a maximum of 5 retries.
