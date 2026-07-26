import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapabilityPortfoliosController } from './capability-portfolios.controller';
import { CapabilityPortfoliosService } from './capability-portfolios.service';
import { CapabilityPortfolio } from './entities/capability-portfolio.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CapabilityPortfolio])],
  controllers: [CapabilityPortfoliosController],
  providers: [CapabilityPortfoliosService],
  exports: [CapabilityPortfoliosService],
})
export class CapabilityPortfoliosModule {}
