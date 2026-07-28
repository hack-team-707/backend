import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  actor!: string;

  @Column()
  action!: string;

  @Column()
  entity!: string;

  @Column()
  @Index()
  entityId!: string;

  @Column()
  @Index()
  timestamp!: string;

  @Column('jsonb')
  metadata!: Record<string, unknown>;

  @Column('uuid', { nullable: true })
  @Index()
  sessionId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  outcome?: string | null;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  correlationId?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddressHash?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent?: string | null;
}
