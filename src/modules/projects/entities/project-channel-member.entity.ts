import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('project_channel_members')
@Index(['channelId', 'userId'], { unique: true })
export class ProjectChannelMember {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  channelId!: string;

  @Column('uuid')
  @Index()
  userId!: string;

  @Column({ type: 'varchar' })
  joinedAt!: string;

  @Column({ type: 'varchar', nullable: true })
  removedAt?: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastReadAt?: string | null;
}
