import { Request } from 'express';

export function getParam(req: Request, name: string): string {
  const val = req.params[name];
  if (Array.isArray(val)) return val[0];
  return val;
}

export function getQuery(req: Request, name: string): string | undefined {
  const val = req.query[name];
  if (Array.isArray(val)) return val[0] as string;
  if (typeof val === 'string') return val;
  return undefined;
}
