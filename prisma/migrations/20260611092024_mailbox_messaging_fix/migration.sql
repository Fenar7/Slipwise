-- AlterTable
ALTER TABLE "e_invoice_request" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "mailbox_saved_view" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE IF EXISTS "mailbox_send_attempt";

-- DropEnum
DROP TYPE IF EXISTS "mailbox_send_attempt_status";

