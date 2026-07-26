import { NvidiaProvider } from './providers';

describe('NvidiaProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses NVIDIA NIM chat completions with bearer authentication', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"result":"ok"}' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const provider = new NvidiaProvider({
      apiKey: 'test-key',
      model: 'nvidia/nvidia-nemotron-nano-9b-v2',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
    });

    await expect(provider.generate('Analyze this')).resolves.toBe(
      '{"result":"ok"}',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual(
      expect.objectContaining({
        model: 'nvidia/nvidia-nemotron-nano-9b-v2',
        messages: [
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('/no_think'),
          }),
          { role: 'user', content: 'Analyze this' },
        ],
        stream: false,
      }),
    );
  });
});
