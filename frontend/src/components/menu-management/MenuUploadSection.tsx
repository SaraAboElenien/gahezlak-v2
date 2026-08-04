import { useMenuQuery } from "@/hooks/useMenuQuery";
import { AxiosError } from "axios";
import { Upload, Image, X } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import OcrDataHandler from "./OcrDataHandler";
import type { OcrData } from "@/types/menuOcr";

interface MenuUploadSectionProps {
  onComplete: () => void;
}

const MenuUploadSection = ({ onComplete }: MenuUploadSectionProps) => {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [ocrData, setOcrData] = useState<OcrData | null>(null);
  const { uploadMenuUsingOCR, uploadMenuUsingOCRLoading } = useMenuQuery();
  const [error, setError] = useState<string | Error>();

  useEffect(() => {
    setError("");
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles([...files, ...Array.from(e.target.files)]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      setFiles([...files, ...Array.from(e.dataTransfer.files)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    setError("");
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });
    try {
      const response = await uploadMenuUsingOCR(formData);
      setOcrData(response.data);
      setFiles([]);
      toast.success(t("menu.uploadSuccess"));
    } catch (err) {
      if (err instanceof AxiosError) {
        setError(err.response?.data?.message || t("common.errors.generic"));
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t("common.errors.generic"));
      }
      toast.error(t("common.errors.generic"));
    }
  };

  return (
    <div className="bg-white dark:bg-card rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {t("menu.upload.Upload title")}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {t("menu.upload.Upload description")}
        </p>
      </div>

      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
          isDragging
            ? "border-primary bg-primary/10"
            : "border-gray-300 dark:border-gray-600"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center gap-4">
          <Upload className="w-12 h-12 text-gray-400" />
          <p className="text-gray-600 dark:text-gray-400">
            {t("Drag & drop files here, or click to browse")}
          </p>
          <input
            type="file"
            id="menu-upload"
            multiple
            accept=".jpg,.jpeg,.png"
            onChange={handleFileChange}
            className="hidden"
            disabled={uploadMenuUsingOCRLoading}
          />
          <label
            htmlFor="menu-upload"
            className="bg-primary hover:bg-darker-primary text-white px-6 py-3 rounded-lg font-medium cursor-pointer transition-all  disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("menu.upload.Select Files")}
          </label>
        </div>
      </div>

      {/* Display selected files */}
      {files.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t("upload.Selected Files")} ({files.length})
          </h3>
          <div className="space-y-3">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Image className="w-5 h-5 text-blue-500" />
                  <span className="text-gray-700 dark:text-gray-300">
                    {file.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {(file.size / 1024).toFixed(2)} KB
                  </span>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-gray-400 hover:text-red-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
          {/* errors */}
          {error && (
            <div className="p-3 mt-5 max-w-[50%] mx-auto text-md text-center text-red-600 bg-red-50 rounded-md dark:bg-red-900/20 dark:text-red-400">
              {typeof error === "string" ? error : error.message}
            </div>
          )}
          {/* submit files */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={uploadFiles}
              disabled={uploadMenuUsingOCRLoading || files.length === 0}
              className="bg-primary hover:bg-darker-primary text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadMenuUsingOCRLoading
                ? t("upload.uploading")
                : t("upload.Upload files")}
            </button>
          </div>
        </div>
      )}

      {/* modals handler */}
      <OcrDataHandler ocrData={ocrData} onComplete={onComplete} />
    </div>
  );
};

export default MenuUploadSection;
