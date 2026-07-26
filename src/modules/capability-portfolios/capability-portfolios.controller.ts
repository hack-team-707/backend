import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth.decorators';
import {
  CapabilityPortfoliosService,
  PublicCapabilityPortfolio,
} from './capability-portfolios.service';

@ApiTags('capability-portfolios')
@Controller('capability-portfolios')
export class CapabilityPortfoliosController {
  constructor(private readonly service: CapabilityPortfoliosService) {}

  @Public()
  @Get(':slug')
  findPublic(@Param('slug') slug: string): Promise<PublicCapabilityPortfolio> {
    return this.service.findPublic(slug);
  }
}
