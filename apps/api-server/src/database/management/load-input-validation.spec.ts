import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DatabaseManagementController } from './database-management.controller';
import { DatabaseManagementService } from './database-management.service';
import { CmsJobService } from '../../cms-job/cms-job.service';
import { createValidationPipe } from '../../error/validation/create-validation-pipe';
import { GlobalExceptionFilter } from '../../error/global-filter';

const validRequest = {
  checkoption: 'both', period: '10000', estimated: 'none',
  _DBID: 'dba', _DBPASSWD: '', oiduse: 'yes', statisticsuse: 'yes', nolog: 'no',
  schema: 'none', object: '/server/dump_objects', index: 'none',
  errorcontrolfile: 'none', ignoreclassfile: 'none',
};

describe('Load database numeric input validation', () => {
  let app: INestApplication;
  const createLoadJob = jest.fn();
  let logError: jest.SpyInstance;
  beforeAll(async () => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const module = await Test.createTestingModule({
      controllers: [DatabaseManagementController],
      providers: [
        { provide: DatabaseManagementService, useValue: {} },
        { provide: CmsJobService, useValue: { createLoadJob } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: any) => { req.user = { sub: 'test-user' }; next(); });
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  beforeEach(() => createLoadJob.mockReset().mockResolvedValue({ jobId: 'job-1' }));
  afterAll(async () => { await app.close(); logError.mockRestore(); });

  describe.each(['period', 'estimated'])('%s', field => {
    it.each(['1', '2147483647', '5000', '0001', 'none'])('accepts %s without changing the argument', async value => {
      const body = { ...validRequest, [field]: value };
      await request(app.getHttpServer()).post('/host-1/database/load/testdb').send(body).expect(202);
      expect(createLoadJob).toHaveBeenCalledWith('test-user', 'host-1', 'testdb', expect.objectContaining({ [field]: value }));
    });

    it.each(['0', '-1', '1.5', '2147483648', '9007199254740993', '1e3', '0x10', '', ' ', '1\n', 'none ', null, undefined, 1000])(
      'rejects %j before creating a job', async value => {
        const response = await request(app.getHttpServer()).post('/host-1/database/load/testdb')
          .send({ ...validRequest, [field]: value }).expect(400);
        expect(response.body.data.missingFields).toContain(field);
        expect(createLoadJob).not.toHaveBeenCalled();
      });
  });
});
