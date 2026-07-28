import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { WalletStatus } from '../../../shared';

@Entity('wallets')
@Unique('UQ_wallets_user_currency', ['userId', 'currency'])
export class Wallet {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  userId!: string;

  @Column('varchar', { length: 3 })
  currency!: string;

  @Column('varchar')
  @Index()
  status!: WalletStatus;

  @Column('timestamptz')
  createdAt!: Date;

  @Column('timestamptz')
  updatedAt!: Date;
}
