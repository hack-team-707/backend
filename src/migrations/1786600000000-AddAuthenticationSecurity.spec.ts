import { QueryRunner } from 'typeorm';
import { AddAuthenticationSecurity1786600000000 } from './1786600000000-AddAuthenticationSecurity';

describe('AddAuthenticationSecurity1786600000000', () => {
  it('creates additive session, refresh, MFA and audit structures', async () => {
    const statements: string[] = [];
    const runner = {
      query: jest.fn(async (statement: string) => {
        statements.push(statement.replace(/\s+/g, ' ').trim());
      }),
    } as unknown as QueryRunner;

    await new AddAuthenticationSecurity1786600000000().up(runner);

    const sql = statements.join('\n');
    expect(sql).toContain('ADD COLUMN "passwordAlgorithm"');
    expect(sql).toContain('CREATE TABLE "auth_sessions"');
    expect(sql).toContain('CREATE TABLE "refresh_tokens"');
    expect(sql).toContain('"tokenHash" varchar(64) NOT NULL');
    expect(sql).toContain('WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL');
    expect(sql).toContain('ADD COLUMN "mfaSecretEncrypted"');
    expect(sql).toContain('ADD COLUMN "correlationId"');
  });
});
