import { apiRequest } from "./client";

export function uploadImage(dataUrl: string): Promise<{ url: string }> {
  return apiRequest<{ url: string }>("/uploads", { method: "POST", body: { dataUrl } });
}
