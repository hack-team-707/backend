import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth.decorators';
import { AppService, HealthResponse } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  getHealth(): HealthResponse {
    return this.appService.getHealth();
  }
}
