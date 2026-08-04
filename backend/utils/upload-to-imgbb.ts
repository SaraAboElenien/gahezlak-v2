import { errMsg } from "../common/err-messages";
import { Errors } from "../errors";

/**
 * The subset of imgbb's upload response this project relies on.
 * See https://api.imgbb.com/ — the API returns many more fields.
 */
export interface ImgbbUploadResponse {
  success: boolean;
  status: number;
  data?: {
    id: string;
    url: string;
    display_url?: string;
    delete_url?: string;
  };
}

async function uploadToImgbb(
  file: Express.Multer.File,
): Promise<ImgbbUploadResponse> {
  const formData = new FormData();

  formData.append("image", file.buffer.toString("base64"));
  const response = await fetch(
    `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_KEY}`,
    {
      method: "POST",
      body: formData,
    },
  );
  if (!response.ok) {
    throw new Errors.BadRequestError(errMsg.IMAGE_UPLOAD_FAILED);
  }
  const data = await response.json();

  return data;
}
export default uploadToImgbb;
