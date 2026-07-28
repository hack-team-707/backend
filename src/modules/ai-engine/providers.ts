import { ServiceUnavailableException } from '@nestjs/common';
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  AiAnalysis,
  AiGenerateOptions,
  AiProvider,
  AiProviderName,
  parseAiAnalysis,
} from './ai-provider';

interface ProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

async function jsonRequest(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const providerMessage =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      body.error &&
      typeof body.error === 'object' &&
      'message' in body.error &&
      typeof body.error.message === 'string'
        ? `: ${body.error.message.slice(0, 300)}`
        : '';
    throw new ServiceUnavailableException(
      `AI provider request failed with status ${response.status}${providerMessage}`,
    );
  }
  return body;
}

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  constructor(private readonly config: ProviderConfig) {}

  async generate(prompt: string): Promise<string> {
    const body = (await jsonRequest(
      `${this.config.baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
      },
    )) as { choices?: Array<{ message?: { content?: string } }> };
    return body.choices?.[0]?.message?.content ?? '';
  }

  async analyze(prompt: string): Promise<AiAnalysis> {
    return parseAiAnalysis(await this.generate(prompt));
  }
}

export class NvidiaProvider implements AiProvider {
  readonly name = 'nvidia' as const;
  constructor(private readonly config: ProviderConfig) {}

  async generate(prompt: string): Promise<string> {
    const body = (await jsonRequest(
      `${this.config.baseUrl ?? 'https://integrate.api.nvidia.com/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: 'system',
              content:
                '/no_think\nDevuelve únicamente el JSON válido solicitado por el usuario.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0,
          max_tokens: 1024,
          stream: false,
        }),
      },
    )) as { choices?: Array<{ message?: { content?: string } }> };
    return body.choices?.[0]?.message?.content ?? '';
  }

  async analyze(prompt: string): Promise<AiAnalysis> {
    return parseAiAnalysis(await this.generate(prompt));
  }
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic' as const;
  constructor(private readonly config: ProviderConfig) {}

  async generate(prompt: string): Promise<string> {
    const body = (await jsonRequest(
      `${this.config.baseUrl ?? 'https://api.anthropic.com/v1'}/messages`,
      {
        method: 'POST',
        headers: {
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
    )) as { content?: Array<{ type?: string; text?: string }> };
    return body.content?.find((item) => item.type === 'text')?.text ?? '';
  }

  async analyze(prompt: string): Promise<AiAnalysis> {
    return parseAiAnalysis(await this.generate(prompt));
  }
}

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  constructor(private readonly config: ProviderConfig) {}

  async generate(prompt: string): Promise<string> {
    const baseUrl =
      this.config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    const body = (await jsonRequest(
      `${baseUrl}/models/${encodeURIComponent(this.config.model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.config.apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
    )) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return body.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  async analyze(prompt: string): Promise<AiAnalysis> {
    return parseAiAnalysis(await this.generate(prompt));
  }
}

export class BedrockProvider implements AiProvider {
  readonly name = 'bedrock' as const;
  private readonly client: BedrockRuntimeClient;
  private readonly model: string;
  private readonly modelComplex?: string;

  constructor(config: {
    region: string;
    model: string;
    modelComplex?: string;
  }) {
    this.client = new BedrockRuntimeClient({ region: config.region });
    this.model = config.model;
    this.modelComplex = config.modelComplex;
  }

  async generate(prompt: string, options?: AiGenerateOptions): Promise<string> {
    const modelId =
      options?.complex && this.modelComplex ? this.modelComplex : this.model;
    const command = new ConverseCommand({
      modelId,
      system: [
        {
          text: 'Devuelve únicamente el JSON válido solicitado por el usuario.',
        },
      ],
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 1024, temperature: 0 },
    });

    try {
      const response = await this.client.send(command);
      const outputContent = response.output?.message?.content;
      if (!outputContent || outputContent.length === 0) return '';
      return outputContent[0].text ?? '';
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 300) : 'Unknown error';
      throw new ServiceUnavailableException(
        `Bedrock request failed: ${message}`,
      );
    }
  }

  async analyze(prompt: string, options?: AiGenerateOptions): Promise<AiAnalysis> {
    return parseAiAnalysis(await this.generate(prompt, options));
  }
}

export class DisabledAiProvider implements AiProvider {
  readonly name: AiProviderName = 'disabled';
  generate(): Promise<string> {
    throw new ServiceUnavailableException('AI provider is not configured');
  }
  analyze(): Promise<AiAnalysis> {
    throw new ServiceUnavailableException('AI provider is not configured');
  }
}
