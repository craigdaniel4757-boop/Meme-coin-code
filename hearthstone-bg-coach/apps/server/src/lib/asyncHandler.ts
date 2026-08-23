import { NextFunction, Request, Response } from "express";

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Express 4 doesn't forward a rejected promise from an async handler to the
 * error middleware on its own - without this, a thrown error in an async
 * route just hangs the request instead of returning a 500.
 */
export function asyncHandler(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
