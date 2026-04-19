export interface StorageProvider {
  toPublicUrl(filename: string): string;
}

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly baseUrl: string) {}

  toPublicUrl(filename: string) {
    return `${this.baseUrl}/uploads/${filename}`;
  }
}