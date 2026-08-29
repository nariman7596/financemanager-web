import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { map } from "rxjs/operators";

/**
 * Make Prisma rows JSON-safe.
 *
 * `revision` is a BigInt (the per-household sync counter), and JSON.stringify
 * throws outright on a BigInt — every list endpoint returned a 500 until this
 * existed. It is serialised as a **string**, not a number: revisions are
 * cursors that clients compare and echo back, and above 2^53 a JSON number
 * silently loses precision, which would corrupt a cursor rather than fail
 * loudly.
 *
 * A `BigInt.prototype.toJSON` monkey-patch would also work, but it mutates a
 * global for the whole process; this stays scoped to HTTP responses.
 */
@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map((value) => convert(value)));
  }
}

function convert(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(convert);

  // Prisma Decimal and anything else with its own JSON form is left alone.
  if (typeof (value as { toJSON?: unknown }).toJSON === "function") return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = convert(v);
  return out;
}
