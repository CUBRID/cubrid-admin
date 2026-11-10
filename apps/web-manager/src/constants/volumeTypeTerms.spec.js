import { expect, it } from 'vitest';
import { CM_KO } from './cmLabels.ko';

// User decision (PM request, kept since #126): the volume types Permanent and
// Temp/Temporary are not translated. Korean words for "permanently delete",
// "temporary disk space" and the like are not volume types.
const NOT_A_VOLUME_TYPE = /영구히|영구적|영구 삭제|임시 디스크|임시 작업 공간|임시 파일/g;

it('keeps the volume types Permanent and Temp in English in Korean labels', () => {
  const translated = Object.entries(CM_KO)
    .map(([key, value]) => [key, typeof value === 'function' ? value.toString() : JSON.stringify(value)])
    .filter(([, text]) => /영구|임시/.test(text.replace(NOT_A_VOLUME_TYPE, '')))
    .map(([key]) => key);
  expect(translated).toEqual([]);
});
