import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as dotenv from "dotenv";
import { requireEnv } from "@/lib/env";

dotenv.config();
const AWS_ACCESS_KEY_ID = requireEnv("AWS_ACCESS_KEY_ID");
const AWS_SECRET_ACCESS_KEY = requireEnv("AWS_SECRET_ACCESS_KEY");
const BUCKET_NAME = requireEnv("BUCKET_NAME");

const s3Client = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

export const createSignedURL = async (objectKey: string) => {
  const putObjectCommand = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: objectKey,
  });
  const url = await getSignedUrl(s3Client, putObjectCommand, { expiresIn: 60 });
  return url;
};

export const getFileFromS3 = async (objectKey: string) => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: objectKey,
    };

    const getObjectCommand = new GetObjectCommand(params);
    const fileObject = await s3Client.send(getObjectCommand);

    const body = await fileObject.Body?.transformToByteArray();
    if (!body) {
      throw new Error("Failed to retrieve file content from S3.");
    }

    return Buffer.from(body);
  } catch (error) {
    console.error("Error fetching file from S3:", error);
    throw error;
  }
};
