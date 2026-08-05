export const NETWORK_NAME: string;
export const NETWORK_DRIVER: string;
export const BIND_OPTION_NAME: string;
export const BIND_ADDRESS: string;
export const BIND_OPTION: string;
export const RECOVERY_COMMANDS: readonly string[];

export type NetworkValidationResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

export function validateNetworkInspection(stdout: string): NetworkValidationResult;
export function isMissingNetworkError(stderr: string): boolean;
