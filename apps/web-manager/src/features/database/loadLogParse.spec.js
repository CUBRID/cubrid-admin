import { describe, expect, it } from 'vitest';
import { parseLoadLog } from './loadLogParse';
import { LOAD_DATA_ERROR, LOAD_OK, LOAD_SYNTAX_ERROR, SYNTAX_CHECK } from './__fixtures__/loaddbOutput';

describe('parseLoadLog (real loaddb output)', () => {
  it('reads the inserted and failed counts of a load', () => {
    expect(parseLoadLog(LOAD_OK)).toEqual({ mode: 'load', summary: { inserted: 5, failed: 0 }, rows: [] });
  });

  it('reads the error count and the line of a syntax error', () => {
    expect(parseLoadLog(LOAD_SYNTAX_ERROR)).toEqual({
      mode: 'load',
      summary: { errors: 1 },
      rows: [{ line: 3, message: 'syntax error at "abc"' }],
    });
  });

  it('lists each failed line once, with every message about it', () => {
    expect(parseLoadLog(LOAD_DATA_ERROR).rows).toEqual([
      { line: 4, message: 'Data overflow on data type "character varying".' },
      { line: 4, message: "Error parsing 'toolongvalue' as a 'character varying' value for attribute 'b' of 'dba.t_load'" },
    ]);
  });

  it('reads a syntax check', () => {
    expect(parseLoadLog(SYNTAX_CHECK)).toEqual({
      mode: 'syntax',
      summary: {},
      rows: [
        { line: 5, message: 'No class named t_nosuch, ignoring tuples' },
        { line: 6, message: 'Unknown class "dba.t_nosuch".' },
      ],
    });
  });

  it('reads the other count sentences of the message set', () => {
    expect(parseLoadLog(['Total 7 objects inserted.', 'Total        9 object(s) checked, 2 object(s) failed.', 'Last committed line : 120']).summary)
      .toEqual({ inserted: 7, checked: 9, failed: 2, lastCommittedLine: 120 });
  });

  it('gives null when no line is one it knows', () => {
    expect(parseLoadLog(['', 'something else'])).toBeNull();
    expect(parseLoadLog([])).toBeNull();
  });
});
