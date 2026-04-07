import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_USER_EMAIL || "local-dev@paperchat.dev";
  const name = process.env.SEED_USER_NAME || "Local Dev User";
  const slug = process.env.SEED_DOCUMENT_SLUG || "seed-doc-1";
  const objectKey = process.env.SEED_DOCUMENT_OBJECT_KEY || "seed-doc-1.pdf";
  const fileName = process.env.SEED_DOCUMENT_FILE_NAME || "Seed Document.pdf";

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      ip: `seed:${email}`,
    },
    update: {
      name,
    },
  });

  await prisma.usage.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      email: user.email,
      ip: user.ip || `seed:${email}`,
      pdfCount: 0,
      messageCount: 0,
    },
  });

  const seedChatHistory = [
    {
      role: "assistant",
      content: "Welcome! This is seeded chat history for local manual testing.",
    },
    {
      role: "user",
      content: "What is this document about?",
    },
    {
      role: "assistant",
      content:
        "This is a seeded placeholder document used to test chat flows locally.",
    },
  ];

  await prisma.document.upsert({
    where: { slug },
    create: {
      slug,
      objectKey,
      fileName,
      userId: user.id,
      extractedText:
        "This is seeded extracted text. Replace by uploading and processing a real PDF.",
      embeddingsGenerated: false,
      processingStatus: "DONE",
      chatHistory: seedChatHistory,
    },
    update: {
      fileName,
      userId: user.id,
      processingStatus: "DONE",
      chatHistory: seedChatHistory,
    },
  });

  console.log("Local seed complete.");
  console.log(`User email: ${email}`);
  console.log(`Document slug: ${slug}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
