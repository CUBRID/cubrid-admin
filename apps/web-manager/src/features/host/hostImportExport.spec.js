import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildGroupedExportPayload,
  buildImportPreviewList,
  exportHostGroupsToNativeXml,
  parseHostsImportFile,
  partitionImportRows,
  validateImportHostEntry,
  validateSelectedImportRows,
} from './hostImportExport';
import { LOCALE_STORAGE_KEY } from '../../constants/useCM';
import { UNGROUPED_GROUP_ID } from './hostGroupUtils';

const host = (uid, address) => ({ uid, alias: uid, address, port: 8001, id: 'admin' });
// Stored shape: the bucket is named "Ungrouped" on the server; g1 is a user
// group that happens to have the same name.
const hostGroups = {
  [UNGROUPED_GROUP_ID]: { name: 'Ungrouped', hosts: { a: host('a', '10.0.0.1') } },
  g1: { name: 'Ungrouped', hosts: { b: host('b', '10.0.0.2') } },
  g2: { name: 'Prod', hosts: { c: host('c', '10.0.0.3') } },
};

const importRows = (text) => partitionImportRows(buildImportPreviewList(parseHostsImportFile(text), []));
const aliases = (rows) => rows.map((r) => r.alias);
// jsdom's Blob has no text().
const readBlob = (blob) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.readAsText(blob);
});

afterEach(() => vi.restoreAllMocks());

describe('exporting hosts', () => {
  it('writes the no-group bucket without a name, so a group may be called "Ungrouped"', () => {
    const groups = buildGroupedExportPayload(hostGroups);

    expect(groups[0]).toEqual({ hosts: [expect.objectContaining({ alias: 'a' })] });
    expect(groups[1]).toEqual({ name: 'Ungrouped', hosts: [expect.objectContaining({ alias: 'b' })] });
  });
});

describe('importing an exported file', () => {
  it('puts the no-group hosts back without a group and keeps a group named "Ungrouped", in JSON', () => {
    const json = JSON.stringify({
      format: 'cubrid-webmanager-hosts', version: 1, groups: buildGroupedExportPayload(hostGroups),
    });
    const { ungrouped, byGroup, unassigned } = importRows(json);

    expect(aliases(ungrouped)).toEqual(['a']);
    expect([...byGroup.keys()]).toEqual(['Ungrouped', 'Prod']);
    expect(aliases(byGroup.get('Ungrouped'))).toEqual(['b']);
    expect(unassigned).toEqual([]);
  });

  it('puts the no-group hosts back without a group and keeps a group named "Ungrouped", in XML', async () => {
    let blob;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b; return 'blob:x'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    exportHostGroupsToNativeXml(hostGroups, null);
    const xml = await readBlob(blob);
    const { ungrouped, byGroup } = importRows(xml);

    expect(xml).toContain('<group><host');
    expect(aliases(ungrouped)).toEqual(['a']);
    expect([...byGroup.keys()]).toEqual(['Ungrouped', 'Prod']);
    expect(aliases(byGroup.get('Ungrouped'))).toEqual(['b']);
  });

  it('shows the group column even when the bucket is the only group', () => {
    const json = JSON.stringify({
      format: 'cubrid-webmanager-hosts', version: 1,
      groups: [{ hosts: [{ alias: 'a', address: '10.0.0.1', port: 8001, id: 'admin' }] }],
    });

    expect(buildImportPreviewList(parseHostsImportFile(json), [])[0].hasPrefsGroups).toBe(true);
  });
});

describe('validateImportHostEntry', () => {
  afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));
  const entry = { alias: 'web1', address: '10.0.0.9', port: '8001', id: 'admin' };

  it('says what is wrong with a row in the UI language', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ko');
    expect(validateImportHostEntry({ ...entry, alias: '' })).toEqual({ code: 'ALIAS_REQUIRED', message: '이름(별칭)을 입력하세요.' });
    expect(validateImportHostEntry({ ...entry, port: '80a' })?.message).toBe('포트는 정수여야 합니다.');
    expect(validateImportHostEntry(entry, { existingHosts: [{ alias: 'web1', address: '10.0.0.1', port: 8001 }] })?.message).toBe('이미 쓰고 있는 이름입니다.');
    expect(validateImportHostEntry(entry)).toBeNull();
  });

  it('marks a host already registered as a duplicate in Korean too', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ko');
    const [row] = buildImportPreviewList([{ ...entry, rowId: 'r1' }], [{ alias: 'old', address: '10.0.0.9', port: 8001 }]);
    expect(row).toMatchObject({ validationError: '이미 등록된 호스트입니다(주소 + 포트).', isDuplicate: true, isSelectable: false });
    expect(validateSelectedImportRows([row])).toEqual({ ok: true });
  });
});
