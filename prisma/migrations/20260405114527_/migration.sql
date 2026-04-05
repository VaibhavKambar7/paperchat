-- DropIndex
DROP INDEX "Usage_ip_key";

-- DropIndex
DROP INDEX "User_ip_key";

-- AlterTable
ALTER TABLE "Usage" ALTER COLUMN "ip" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "ip" DROP NOT NULL;
