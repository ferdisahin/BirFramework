import { UploadedFile } from './uploaded-file.js';

export interface MultipartResult {
  fields: Record<string, any>;
  files: Record<string, UploadedFile[]>;
}

export function parseMultipart(bodyBuffer: Buffer, boundary: string): MultipartResult {
  const fields: Record<string, any> = {};
  const files: Record<string, UploadedFile[]> = {};

  const delimiter = Buffer.from(`--${boundary}`);
  const crlf = Buffer.from('\r\n');
  const doubleCrlf = Buffer.from('\r\n\r\n');

  let startIndex = bodyBuffer.indexOf(delimiter);

  while (startIndex !== -1) {
    const nextDelimiterIndex = bodyBuffer.indexOf(delimiter, startIndex + delimiter.length);
    if (nextDelimiterIndex === -1) {
      break;
    }

    // Slice part content between delimiter and nextDelimiter
    // Account for \r\n after the first delimiter
    let partStart = startIndex + delimiter.length;
    if (bodyBuffer.subarray(partStart, partStart + 2).equals(crlf)) {
      partStart += 2;
    }

    // Account for \r\n right before the closing delimiter
    let partEnd = nextDelimiterIndex;
    if (bodyBuffer.subarray(partEnd - 2, partEnd).equals(crlf)) {
      partEnd -= 2;
    }

    const partBuffer = bodyBuffer.subarray(partStart, partEnd);

    // Find double CRLF which separates headers and payload
    const headerEndIndex = partBuffer.indexOf(doubleCrlf);
    if (headerEndIndex !== -1) {
      const headerString = partBuffer.subarray(0, headerEndIndex).toString('utf-8');
      const bodyPart = partBuffer.subarray(headerEndIndex + 4);

      // Parse headers
      const lines = headerString.split('\r\n');
      let fieldName = '';
      let filename = '';
      let contentType = 'application/octet-stream';

      for (const line of lines) {
        const [headerName, ...rest] = line.split(':');
        if (!headerName || rest.length === 0) continue;
        const headerValue = rest.join(':').trim();

        if (headerName.toLowerCase() === 'content-disposition') {
          const nameMatch = headerValue.match(/name="([^"]+)"/);
          if (nameMatch && nameMatch[1]) {
            fieldName = nameMatch[1];
          }
          const fileMatch = headerValue.match(/filename="([^"]*)"/);
          if (fileMatch && fileMatch[1] !== undefined) {
            filename = fileMatch[1];
          }
        } else if (headerName.toLowerCase() === 'content-type') {
          contentType = headerValue;
        }
      }

      if (fieldName && fieldName !== '__proto__' && fieldName !== 'constructor' && fieldName !== 'prototype') {
        if (filename) {
          // It's a file - strip any directory traversal from original filename
          const safeFilename = filename.replace(/^.*[/\\]/, '');
          const uploadedFile = new UploadedFile(
            fieldName,
            safeFilename,
            contentType,
            bodyPart.length,
            Buffer.from(bodyPart)
          );

          if (!files[fieldName]) {
            files[fieldName] = [];
          }
          files[fieldName]!.push(uploadedFile);
        } else {
          // It's a regular form field
          const textValue = bodyPart.toString('utf-8');
          if (fields[fieldName] !== undefined) {
            if (Array.isArray(fields[fieldName])) {
              fields[fieldName].push(textValue);
            } else {
              fields[fieldName] = [fields[fieldName], textValue];
            }
          } else {
            fields[fieldName] = textValue;
          }
        }
      }
    }

    startIndex = nextDelimiterIndex;
  }

  return { fields, files };
}
