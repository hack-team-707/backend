import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

export class ExternalTalentProviderUnavailableException extends ServiceUnavailableException {}
export class ExternalTalentAuthenticationException extends UnauthorizedException {}
export class ExternalTalentRateLimitException extends HttpException {
  constructor(message = 'External talent provider rate limit exceeded') {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
export class ExternalTalentInvalidRequestException extends BadRequestException {}
export class ExternalTalentUpstreamException extends BadGatewayException {}
