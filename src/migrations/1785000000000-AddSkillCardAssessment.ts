import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkillCardAssessment1785000000000 implements MigrationInterface {
  name = 'AddSkillCardAssessment1785000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "skill_cards" ADD "assessment" jsonb`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "skill_cards" DROP COLUMN "assessment"`,
    );
  }
}
