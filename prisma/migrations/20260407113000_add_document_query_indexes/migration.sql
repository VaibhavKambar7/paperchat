-- CreateIndex
CREATE INDEX "Document_userId_updatedAt_idx" ON "Document"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Document_userId_fileName_idx" ON "Document"("userId", "fileName");

