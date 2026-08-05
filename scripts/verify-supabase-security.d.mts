export interface ScanTrackedContentResult {
  readonly findings: string[];
  readonly skippedBinary: boolean;
}

export function isBinaryContent(content: Uint8Array): boolean;
export function scanTrackedContent(
  filePath: string,
  content: Uint8Array,
): ScanTrackedContentResult;
export function verifyTrackedFiles(): Promise<void>;
