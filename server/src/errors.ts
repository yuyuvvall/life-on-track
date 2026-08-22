/**
 * An error that already knows which HTTP status the handler should answer with.
 *
 * Route handlers validate inline and `return res.status(...)`, which stops
 * working once the work moves inside a `withWriteLock` callback: a `return`
 * there only exits the callback, and the handler carries on as if nothing was
 * rejected. Guards inside the callback throw this instead, and the handler's
 * catch turns it back into the intended response.
 *
 * It is NOT a rollback. Nothing is undone by throwing — the lock is a queue, not
 * a transaction. Every rejection has to be decided before the first write, or
 * the write has to be compensated by hand (see POST /expenses).
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Express-side mapping: `HttpError` keeps its status and message, anything else is
 * an unhandled fault. Those get logged and answered generically — the raw text is
 * driver internals ("SQLITE_CONSTRAINT_FOREIGNKEY: ...") that means nothing to the
 * user and describes the schema to anyone else.
 */
function errorResponse(err: unknown): { status: number; body: { message: string } } {
  if (err instanceof HttpError) {
    return { status: err.status, body: { message: err.message } };
  }
  console.error('[API] Unhandled error:', err);
  return { status: 500, body: { message: 'Something went wrong. Please try again.' } };
}

/**
 * The one place a caught error becomes a response. Every router's catch should
 * go through here, or an `HttpError` raised deep in the stack — a 409 from the
 * busy-retry wrapper, say — arrives at the client as a 500 whose body politely
 * suggests retrying.
 */
export function sendError(res: { status: (code: number) => { json: (body: unknown) => unknown } }, err: unknown): void {
  const { status, body } = errorResponse(err);
  res.status(status).json(body);
}
