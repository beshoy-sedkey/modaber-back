// Augment Express Request to include rawBody (used by webhook verification)
import 'express';

declare module 'express' {
  interface Request {
    rawBody?: Buffer;
  }
}
