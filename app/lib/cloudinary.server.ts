import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadImage(buffer: Buffer, filename: string): Promise<string> {
  if (buffer.byteLength > MAX_BYTES) throw new Error("圖片不能超過 5MB");

  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: "jp-purchase",
          public_id: `${Date.now()}-${filename.replace(/\.[^.]+$/, "")}`,
          resource_type: "image",
          transformation: [{ quality: "auto", fetch_format: "auto", width: 1600, crop: "limit" }],
        },
        (err, result) => {
          if (err) return reject(err);
          resolve(result!.secure_url);
        }
      )
      .end(buffer);
  });
}

/** Returns a thumbnail version of any Cloudinary URL */
export function toThumbUrl(url: string, size = 400): string {
  return url.replace("/upload/", `/upload/w_${size},h_${size},c_fill,f_auto,q_auto/`);
}

export function isCloudinaryUrl(url: string) {
  return url.includes("res.cloudinary.com");
}
