import { unloadObjectTypeWarningClasses, unloadObjectTypeWarnings } from './unload-object-type-warning';

// The note CMS returned for an unload of a class with an OBJECT column
// (11.4.5.1908, measured): read_error_file joins stderr lines with <end>.
const NOTE = "warning: [dba.tb] has object type.<end>So for class [dba.tb], '--thread-count' option is ignored.<end>";
const failed = (note: string, extra: Record<string, unknown> = {}) => ({ status: 'failure', task: 'unloaddb', note, ...extra });

describe('unloadObjectTypeWarningClasses', () => {
  it('names the classes when the note holds only the OBJECT-type warning', () => {
    expect(unloadObjectTypeWarningClasses(failed(NOTE))).toEqual(['dba.tb']);
    const two = "warning: [dba.tb] has object type.\nSo for class [dba.tb], '--thread-count' option is ignored.\n\n"
      + "warning: [dba.tx] has object type.<end>So for class [dba.tx], '--thread-count' option is ignored.";
    expect(unloadObjectTypeWarningClasses(failed(two))).toEqual(['dba.tb', 'dba.tx']);
  });

  it('is null when another line is mixed in', () => {
    expect(unloadObjectTypeWarningClasses(failed(`${NOTE}ERROR: Unknown class "dba.zz".<end>`))).toBeNull();
    expect(unloadObjectTypeWarningClasses(failed(`unloaddb: Failed to connect<end>${NOTE}`))).toBeNull();
    expect(unloadObjectTypeWarningClasses(failed(NOTE, { line: ['ERROR: disk full'] }))).toBeNull();
  });

  it('is null for any other failure, half a warning, or another class in the second line', () => {
    expect(unloadObjectTypeWarningClasses(failed("unloaddb: Failed to connect to database server, 'refdb'"))).toBeNull();
    expect(unloadObjectTypeWarningClasses(failed('warning: [dba.tb] has object type.<end>'))).toBeNull();
    expect(unloadObjectTypeWarningClasses(failed("warning: [dba.tb] has object type.<end>So for class [dba.tc], '--thread-count' option is ignored."))).toBeNull();
    expect(unloadObjectTypeWarningClasses(failed("warning: [dba.tb] has set type with object type.<end>So for class [dba.tb], '--thread-count' option is ignored."))).toBeNull();
    expect(unloadObjectTypeWarningClasses(failed(''))).toBeNull();
  });

  it('is null for a response that did not fail', () => {
    expect(unloadObjectTypeWarningClasses({ status: 'success', note: NOTE })).toBeNull();
  });

  it('reports each class and that the counts were not written', () => {
    expect(unloadObjectTypeWarnings(['dba.tb']).map(({ code }) => code))
      .toEqual(['UNLOAD_OBJECT_TYPE_THREAD_COUNT_IGNORED', 'UNLOAD_RESULT_NOT_RECORDED']);
  });
});
