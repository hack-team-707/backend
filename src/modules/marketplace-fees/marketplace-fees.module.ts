import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { MarketplaceFeeConfig } from './entities/marketplace-fee-config.entity';
import { MarketplaceFeesController } from './marketplace-fees.controller';
import { MarketplaceFeesService } from './marketplace-fees.service';

@Module({
  imports: [TypeOrmModule.forFeature([MarketplaceFeeConfig]), AdminModule],
  controllers: [MarketplaceFeesController],
  providers: [MarketplaceFeesService],
  exports: [MarketplaceFeesService],
})
export class MarketplaceFeesModule {}
