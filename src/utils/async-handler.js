/**
 * Wraps an async Express route handler and forwards any thrown error to next().
 * Eliminates repetitive try/catch boilerplate in every controller method.
 *
 * @param {Function} fn - async (req, res, next) => void
 * @returns {Function} Standard Express middleware
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
