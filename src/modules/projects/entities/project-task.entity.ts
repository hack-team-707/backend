import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ProjectTaskStatus } from '../../../shared';

@Entity('project_tasks')
export class ProjectTask {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  projectId!: string;

  @Column()
  title!: string;

  @Column({ nullable: true })
  description?: string;

  @Column()
  assigneeId!: string;

  @Column()
  status!: ProjectTaskStatus;

  @Column()
  createdBy!: string;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}
