import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildGroupedExportPayload,
  buildImportPreviewList,
  exportHostGroupsToNativeXml,
  importRowBlockedReason,
  parseHostsImportFile,
  pickImportRows,
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
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
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
    const [row] = buildImportPreviewList([{ ...entry, rowId: 'r1' }], [{ alias: 'old', address: '10.0.0.9', port: 8001, id: 'admin' }]);
    expect(row).toMatchObject({ validationError: '이미 등록된 호스트입니다(주소 + 포트 + 사용자 이름).', isDuplicate: true, isSelectable: false });
    expect(validateSelectedImportRows([row])).toEqual({ ok: true });
  });

  it('imports a host with the same address and port as a registered one but another CMS user, as the server allows', () => {
    const [row] = buildImportPreviewList([{ ...entry }], [{ alias: 'old', address: '10.0.0.9', port: 8001, id: 'other' }]);
    expect(row).toMatchObject({ validationError: null, isDuplicate: false, isSelectable: true });
  });
});

describe('rows of the file that clash', () => {
  afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));
  const row = (alias, address, id = 'admin') => ({ alias, address, port: '8001', id });

  it('keeps every clashing row selectable, and picks one of each clash when the file opens or on Select all', () => {
    const rows = buildImportPreviewList([
      row('web1', '10.0.0.9'), row('web2', '10.0.0.9'), // same connection
      row('web3', '10.0.0.8'), row('web3', '10.0.0.7'), // same alias
      row('web5', '10.0.0.9', 'other'), // same address and port, another user
    ], []);
    expect(rows.every((r) => r.isSelectable && !r.validationError)).toBe(true);
    const all = rows.map((r) => r.rowId);
    expect(pickImportRows(rows, all)).toEqual([all[0], all[2], all[4]]);
    // The rows already picked stay picked.
    expect(pickImportRows(rows, [all[1], ...all])).toEqual([all[1], all[2], all[4]]);
  });

  it('says why a row cannot be picked while its twin is, and frees it once the twin is unpicked', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ko');
    const rows = buildImportPreviewList([row('web1', '10.0.0.9'), row('web2', '10.0.0.9'), row('web3', '10.0.0.8'), row('web3', '10.0.0.7')], []);
    const [a, b, c, d] = rows;
    expect(importRowBlockedReason(b, [a.rowId])).toBe('가져오기 파일 안에 주소 + 포트 + 사용자 이름이 겹칩니다.');
    expect(importRowBlockedReason(d, [c.rowId])).toBe('가져오기 파일 안에 이름이 겹칩니다.');
    expect(importRowBlockedReason(b, [])).toBeNull();
    expect(importRowBlockedReason(b, [c.rowId])).toBeNull();
  });

  it('refuses two clashing rows sent together', () => {
    const [a, b, c] = buildImportPreviewList([row('web1', '10.0.0.9'), row('web2', '10.0.0.9'), row('web3', '10.0.0.8')], []);
    expect(validateSelectedImportRows([a, c])).toEqual({ ok: true });
    expect(validateSelectedImportRows([a, b, c])).toEqual({
      ok: false, messages: ['web2: Duplicate address + port + username in import file'],
    });
  });

  it('lets a row clash only with rows that can be imported', () => {
    const rows = buildImportPreviewList([row('web1', '10.0.0.9'), row('web2', '10.0.0.9')], [{ alias: 'web1', address: '1.1.1.1', port: 8001, id: 'x' }]);
    // web1 is taken already, so web2 is free.
    expect(rows[0].isSelectable).toBe(false);
    expect(pickImportRows(rows, rows.map((r) => r.rowId))).toEqual([rows[1].rowId]);
  });
});
