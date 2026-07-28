import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditService } from '../modules/admin/audit.service';

export interface AuthAuditInput {
  eventType: string;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  outcome: 'success' | 'failure' | 'blocked';
  metadata?: Record<string, string | number | boolean | null>;
}

@Injectable()
export class AuthAuditService {
  constructor(private readonly audit: AuditService) {}

  async record(input: AuthAuditInput): Promise<void> {
    await this.audit.record({
      actor: input.userId ?? 'anonymous',
      action: input.eventType,
      entity: 'authentication',
      entityId: input.sessionId ?? input.userId ?? 'anonymous',
      metadata: {
        outcome: input.outcome,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.ipAddress
          ? {
              ipAddressHash: createHash('sha256')
                .update(input.ipAddress)
                .digest('hex'),
            }
          : {}),
        ...(input.userAgent
          ? { userAgent: input.userAgent.slice(0, 500) }
          : {}),
        ...(input.correlationId
          ? { correlationId: input.correlationId.slice(0, 120) }
          : {}),
        ...(input.metadata ?? {}),
      },
    });
  }
}
