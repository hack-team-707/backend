import { Injectable } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
  persistence: 'postgresql';
}

@Injectable()
export class AppService {
  getHealth(): HealthResponse {
    return { status: 'ok', persistence: 'postgresql' };
  }
}
