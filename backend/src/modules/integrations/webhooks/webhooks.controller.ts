import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { WebhooksService } from './webhooks.service';

@Controller('integrations/webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Post(':providerKey')
  receive(
    @Param('providerKey') providerKey: string,
    @Headers() headers: Record<string, unknown>,
    @Body() payload: unknown,
  ) {
    return this.webhooksService.receive(providerKey, headers, payload);
  }
}
