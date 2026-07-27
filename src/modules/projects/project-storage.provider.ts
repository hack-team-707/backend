import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const PROJECT_STORAGE = Symbol('PROJECT_STORAGE');

export interface StorageUpload {
  storageKey: string;
  storedName: string;
}

export interface StorageProvider {
  upload(
    projectId: string,
    extension: string,
    content: Buffer,
  ): Promise<StorageUpload>;
  download(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  getSignedUrl(fileId: string): Promise<string>;
  exists(storageKey: string): Promise<boolean>;
}

@Injectable()
export class LocalProjectStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(private readonly config: ConfigService) {
    this.root = resolve(
      this.config.get<string>(
        'PROJECT_FILE_STORAGE_PATH',
        '.data/project-files',
      ),
    );
  }

  async upload(
    projectId: string,
    extension: string,
    content: Buffer,
  ): Promise<StorageUpload> {
    const storedName = `${randomUUID()}.${extension}`;
    const storageKey = `${projectId}/${storedName}`;
    const directory = join(this.root, projectId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(this.path(storageKey), content, { mode: 0o600 });
    return { storageKey, storedName };
  }

  download(storageKey: string): Promise<Buffer> {
    return readFile(this.path(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    await unlink(this.path(storageKey)).catch(() => undefined);
  }

  getSignedUrl(fileId: string): Promise<string> {
    return Promise.resolve(
      `/project-files/${encodeURIComponent(fileId)}/download`,
    );
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await access(this.path(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  private path(storageKey: string): string {
    const target = resolve(this.root, storageKey);
    if (!target.startsWith(`${this.root}/`))
      throw new Error('Invalid storage key');
    return target;
  }
}
