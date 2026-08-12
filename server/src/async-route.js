/**
 * Express 4 doesn't understand rejected promises: an async handler that throws
 * leaves the request hanging and takes the process down with an unhandled
 * rejection. Wrapping a handler in `ah` sends the error to the error middleware
 * in server.js instead, so a bad request answers 500 rather than killing the API.
 *
 *   router.get("/", ah(async (req, res) => { ... }))
 */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ah };
