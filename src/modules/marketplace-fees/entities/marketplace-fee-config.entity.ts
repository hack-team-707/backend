import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

@Entity('marketplace_fee_configs')
@Unique('UQ_marketplace_fee_configs_name_version', ['name', 'version'])
@Index('IDX_marketplace_fee_configs_active_effective', [
  'isActive',
  'effectiveFrom',
])
export class MarketplaceFeeConfig {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('varchar', { length: 120 })
  name!: string;

  @Column('integer')
  version!: number;

  @Column('uuid')
  createdBy!: string;

  @Column('integer')
  feeBasisPoints!: number;

  @Column('numeric', { precision: 19, scale: 4, default: '0' })
  fixedFeeAmount!: string;

  @Column('varchar', { length: 3 })
  currency!: string;

  @Column('boolean', { default: true })
  isActive!: boolean;

  @Column('timestamptz')
  effectiveFrom!: Date;

  @Column('timestamptz', { nullable: true })
  effectiveTo?: Date | null;

  @Column('timestamptz')
  createdAt!: Date;

  @Column('timestamptz')
  updatedAt!: Date;
}
