import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AiAnalysis, AiProviderName } from './ai-provider';
import { AnalyzeProblemDto } from './ai-engine.dto';
import { AiEngineService } from './ai-engine.service';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiEngineController {
  constructor(private readonly service: AiEngineService) {}

  @Get('provider')
  provider(): { provider: AiProviderName } {
    return { provider: this.service.providerName };
  }

  @Post('analyze')
  analyze(@Body() dto: AnalyzeProblemDto): Promise<AiAnalysis> {
    return this.service.analyzeProblem(dto.description);
  }
}
