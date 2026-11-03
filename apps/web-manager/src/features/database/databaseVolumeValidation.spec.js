import { describe, expect, it } from 'vitest';
import { CM } from '../../constants/cmLabels';
import { CM_KO } from '../../constants/cmLabels.ko';
import {
  MAX_GENERAL_VOLUME_SIZE_MB,
  MIN_GENERAL_VOLUME_SIZE_MB,
  isPositiveVolumeSize,
  isValidGeneralVolumeSize,
  volumeSizeMbToPages,
} from './databaseVolumeValidation';

describe('database volume validation', () => {
  it.each([
    [20479, true],
    [20480, true],
    [20481, false],
    [1, true],
    [0.999, false],
    [0.001, false],
    [0, false],
    [-1, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
  ])('validates a general volume of %s MB', (sizeMb, expected) => {
    expect(isValidGeneralVolumeSize(sizeMb)).toBe(expected);
  });

  it('uses 20 GB expressed as 20,480 MB', () => {
    expect(MAX_GENERAL_VOLUME_SIZE_MB).toBe(20480);
  });

  it('applies the input minimum of 1 MB during validation', () => {
    expect(MIN_GENERAL_VOLUME_SIZE_MB).toBe(1);
  });

  it('requires a positive finite volume size', () => {
    expect(isPositiveVolumeSize(1)).toBe(true);
    expect(isPositiveVolumeSize(0)).toBe(false);
    expect(isPositiveVolumeSize(Number.NaN)).toBe(false);
  });

  it('converts MB to whole pages', () => {
    expect(volumeSizeMbToPages(512, 16384)).toBe(32768);
  });

  it('provides localized validation and failure-guidance keys', () => {
    for (const labels of [CM, CM_KO]) {
      expect(labels.volumeSizePositiveError).toBeTruthy();
      expect(labels.generalVolumeSizeMinError).toBeTruthy();
      expect(labels.generalVolumeSizeMaxError).toBeTruthy();
      expect(labels.createDbGuidance.some((item) => item.includes('20 GiB'))).toBe(true);
    }
  });
});
