-- AlterTable: campos ampliados de ValidacionResultado (scoreSnapshot ya aplicado vía db push)
ALTER TABLE "ValidacionResultado" ADD COLUMN "title" TEXT;
ALTER TABLE "ValidacionResultado" ADD COLUMN "explanation" TEXT;
ALTER TABLE "ValidacionResultado" ADD COLUMN "normativa" TEXT;
ALTER TABLE "ValidacionResultado" ADD COLUMN "referencia" TEXT;
