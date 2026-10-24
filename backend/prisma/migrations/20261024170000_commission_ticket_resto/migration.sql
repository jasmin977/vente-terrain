-- AlterTable
ALTER TABLE "caisse_tickets_paiements" ADD COLUMN     "commission" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "societes" ADD COLUMN     "commissionTicketResto" DECIMAL(5,2) NOT NULL DEFAULT 10;

