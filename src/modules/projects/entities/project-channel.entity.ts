import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ProjectChannelType } from '../../../shared';

@Entity('project_channels')
@Index(['projectId', 'type'], {
  unique: true,
  where: "\"type\" IN ('general', 'team_internal')",
})
export class ProjectChannel {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  projectId!: string;

  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'varchar' })
  type!: ProjectChannelType;

  @Column('uuid')
  createdBy!: string;

  @Column({ default: false })
  isDefault!: boolean;

  @Column({ default: false })
  isArchived!: boolean;

  @Column({ default: false })
  clientIncluded!: boolean;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}
