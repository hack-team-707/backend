import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER, AiProvider, AiProviderName } from './ai-provider';
import { AiEngineController } from './ai-engine.controller';
import { AiEngineService } from './ai-engine.service';
import {
  AnthropicProvider,
  DisabledAiProvider,
  GeminiProvider,
  NvidiaProvider,
  OpenAiProvider,
} from './providers';

@Module({
  controllers: [AiEngineController],
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AiProvider => {
        const provider = config.get<AiProviderName>('AI_PROVIDER', 'disabled');
        if (provider === 'disabled') return new DisabledAiProvider();
        const prefix = provider.toUpperCase();
        const options = {
          apiKey: config.getOrThrow<string>(`${prefix}_API_KEY`),
          baseUrl: config.getOrThrow<string>(`${prefix}_BASE_URL`),
          model: config.getOrThrow<string>(`${prefix}_MODEL`),
        };
        if (provider === 'nvidia') return new NvidiaProvider(options);
        if (provider === 'openai') return new OpenAiProvider(options);
        if (provider === 'anthropic') return new AnthropicProvider(options);
        return new GeminiProvider(options);
      },
    },
    AiEngineService,
  ],
  exports: [AiEngineService],
})
export class AiEngineModule {}
