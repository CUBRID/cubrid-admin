export const MAX_GENERAL_VOLUME_SIZE_MB = 20 * 1024;
export const BYTES_PER_MB = 1024 * 1024;

export const isPositiveVolumeSize = (sizeMb) => (
  Number.isFinite(sizeMb) && sizeMb > 0
);

export const isValidGeneralVolumeSize = (sizeMb) => (
  isPositiveVolumeSize(sizeMb) && sizeMb <= MAX_GENERAL_VOLUME_SIZE_MB
);

export const volumeSizeMbToPages = (sizeMb, pageSizeBytes) => (
  Math.floor((sizeMb * BYTES_PER_MB) / pageSizeBytes)
);
