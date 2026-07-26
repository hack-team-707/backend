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
}
