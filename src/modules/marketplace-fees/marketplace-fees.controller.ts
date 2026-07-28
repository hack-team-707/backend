import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../common/auth.decorators';
import { UserRole } from '../../shared';
import { AuditService } from '../admin/audit.service';
import { CreateMarketplaceFeeDto } from './dto/marketplace-fee.dto';
import { MarketplaceFeeConfig } from './entities/marketplace-fee-config.entity';
import { MarketplaceFeesService } from './marketplace-fees.service';

@ApiTags('admin/marketplace-fees')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/marketplace-fees')
export class MarketplaceFeesController {
  constructor(
    private readonly fees: MarketplaceFeesService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMarketplaceFeeDto,
  ): Promise<MarketplaceFeeConfig> {
    const config = await this.fees.createVersion(user.userId, dto);
    await this.audit.record({
      actor: user.userId,
      action: 'marketplace_fee.version_created',
      entity: 'MarketplaceFeeConfig',
      entityId: config.id,
      metadata: {
        name: config.name,
        version: config.version,
        currency: config.currency,
        sessionId: user.sessionId,
      },
    });
    return config;
  }

  @Get()
  current(
    @Query('currency') currency: string,
    @Query('at') at?: string,
  ): Promise<MarketplaceFeeConfig> {
    return this.fees.current(currency, at ? new Date(at) : new Date());
  }
}
