import { extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Storage } from '../storage/index.js';

export class UploadedFile {
  constructor(
    public readonly name: string,
    public readonly originalName: string,
    public readonly mimeType: string,
    public readonly size: number,
    public readonly buffer: Buffer
  ) {}

  /**
   * Get the file extension without dot (e.g. 'png', 'jpg')
   */
  public extension(): string {
    const ext = extname(this.originalName);
    return ext ? ext.replace(/^\./, '').toLowerCase() : '';
  }

  /**
   * Return whether file is not empty
   */
  public isValid(): boolean {
    return this.size > 0 && this.buffer.length > 0;
  }

  /**
   * Store the uploaded file in a given folder with a randomly generated unique filename.
   * Defaults to 'local' disk (or 'public' if specified).
   * Returns the stored relative file path.
   */
  public async store(folder: string = 'uploads', diskName: string = 'local'): Promise<string> {
    if (folder.includes('..') || folder.includes('\0')) {
      throw new Error('[BirHttp] Invalid folder path (path traversal prevented).');
    }
    const ext = this.extension();
    const uniqueName = `${randomBytes(16).toString('hex')}${ext ? '.' + ext : ''}`;
    const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
    const targetPath = cleanFolder ? `${cleanFolder}/${uniqueName}` : uniqueName;

    await Storage.disk(diskName).put(targetPath, this.buffer);
    return targetPath;
  }

  /**
   * Store the uploaded file with an explicit custom filename.
   */
  public async storeAs(folder: string, name: string, diskName: string = 'local'): Promise<string> {
    if (folder.includes('..') || name.includes('..') || folder.includes('\0') || name.includes('\0')) {
      throw new Error('[BirHttp] Path traversal detected in upload destination.');
    }
    const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
    const cleanName = name.replace(/^.*[/\\]/, '');
    const targetPath = cleanFolder ? `${cleanFolder}/${cleanName}` : cleanName;

    await Storage.disk(diskName).put(targetPath, this.buffer);
    return targetPath;
  }

  /**
   * Return file content as utf-8 string
   */
  public toString(): string {
    return this.buffer.toString('utf-8');
  }
}
