export type UploadStatus = "pending" | "processing" | "succeeded" | "failed";

export type ExtractionSource = "text" | "ocr";

export interface Upload {
  id: string;
  user_id: string;
  storage_path: string;
  original_filename: string | null;
  status: UploadStatus;
  facility_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface Extraction {
  id: string;
  upload_id: string;
  user_id: string;
  payload: ExtractionPayload;
  created_at: string;
}

export interface Report {
  user_id: string;
  content: string;
  updated_at: string;
}

export interface LabItem {
  name: string;
  value: string;
  unit?: string;
  refRange?: string;
  date: string | null;
}

export interface ExtractionPayload {
  facility: string;
  source: ExtractionSource;
  items: LabItem[];
  rawText: string;
}
