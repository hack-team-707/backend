import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface CreateAuditLogInput {
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
  ) {}

  findAll(): Promise<AuditLog[]> {
    return this.auditLogs.find({ order: { timestamp: 'DESC' } });
  }

  record(input: CreateAuditLogInput): Promise<AuditLog> {
    return this.auditLogs.save(
      this.auditLogs.create({
        id: randomUUID(),
        actor: input.actor,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        timestamp: new Date().toISOString(),
        metadata: input.metadata ?? {},
        ...(typeof input.metadata?.sessionId === 'string'
          ? { sessionId: input.metadata.sessionId }
          : {}),
        ...(typeof input.metadata?.outcome === 'string'
          ? { outcome: input.metadata.outcome }
          : {}),
        ...(typeof input.metadata?.correlationId === 'string'
          ? { correlationId: input.metadata.correlationId }
          : {}),
        ...(typeof input.metadata?.ipAddressHash === 'string'
          ? { ipAddressHash: input.metadata.ipAddressHash }
          : {}),
        ...(typeof input.metadata?.userAgent === 'string'
          ? { userAgent: input.metadata.userAgent.slice(0, 500) }
          : {}),
      }),
    );
  }
}
