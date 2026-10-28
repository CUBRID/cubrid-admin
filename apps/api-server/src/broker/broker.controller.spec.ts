import { Test, TestingModule } from '@nestjs/testing';
import { BrokerController } from './broker.controller';
import { BrokerService } from './broker.service';
import { createValidationPipe } from '@error/validation/create-validation-pipe';
import { GetBrokerStatusBulkDto } from '@type/index';

describe('BrokerController', () => {
  let controller: BrokerController;
  let brokerService: jest.Mocked<BrokerService>;

  beforeEach(async () => {
    const mockBrokerService = {
      getBrokers: jest.fn(),
      stopBroker: jest.fn(),
      startBroker: jest.fn(),
      restartBroker: jest.fn(),
      getBrokerStatus: jest.fn(),
      getBrokerStatusBulk: jest.fn(),
      startAllBrokers: jest.fn(),
      stopAllBrokers: jest.fn(),
      addDbmtUser: jest.fn(),
      updateDbmtUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrokerController],
      providers: [
        {
          provide: BrokerService,
          useValue: mockBrokerService,
        },
      ],
    }).compile();

    controller = module.get<BrokerController>(BrokerController);
    brokerService = module.get(BrokerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('startAllBrokers', () => {
    it('should call brokerService.startAllBrokers and return { success: true }', async () => {
      const req = { user: { sub: 'user-123' } };
      brokerService.startAllBrokers.mockResolvedValue({ success: true });

      const result = await controller.startAllBrokers(req, 'host-uid-1');

      expect(brokerService.startAllBrokers).toHaveBeenCalledWith(
        'user-123',
        'host-uid-1'
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('stopAllBrokers', () => {
    it('should call brokerService.stopAllBrokers and return { success: true }', async () => {
      const req = { user: { sub: 'user-123' } };
      brokerService.stopAllBrokers.mockResolvedValue({ success: true });

      const result = await controller.stopAllBrokers(req, 'host-uid-1');

      expect(brokerService.stopAllBrokers).toHaveBeenCalledWith(
        'user-123',
        'host-uid-1'
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('addDbmtUser', () => {
    it('should call brokerService.addDbmtUser and return dblist and userlist', async () => {
      const req = { user: { sub: 'user-123' } };
      const body = {
        targetid: 'test_user_2',
        password: '1234',
        casauth: 'none',
        dbcreate: 'none',
        statusmonitorauth: 'none',
      };
      const mockResponse = { dblist: [], userlist: [] };
      brokerService.addDbmtUser.mockResolvedValue(mockResponse);

      const result = await controller.addDbmtUser(req, 'host-uid-1', body);

      expect(brokerService.addDbmtUser).toHaveBeenCalledWith(
        'user-123',
        'host-uid-1',
        body
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateDbmtUser', () => {
    it('should call brokerService.updateDbmtUser and return dblist and userlist', async () => {
      const req = { user: { sub: 'user-123' } };
      const body = {
        targetid: 'test_user_2',
        dbauth: [],
        casauth: 'none',
        dbcreate: 'none',
        statusmonitorauth: 'none',
      };
      const mockResponse = { dblist: [], userlist: [] };
      brokerService.updateDbmtUser.mockResolvedValue(mockResponse);

      const result = await controller.updateDbmtUser(req, 'host-uid-1', body);

      expect(brokerService.updateDbmtUser).toHaveBeenCalledWith(
        'user-123',
        'host-uid-1',
        body
      );
      expect(result).toEqual(mockResponse);
    });
  });
  describe('getBrokerStatusBulk', () => {
    it('passes body.bnames to brokerService.getBrokerStatusBulk', async () => {
      const req = { user: { sub: 'user-123' } };
      const mockResponse = { brokers: [{ bname: 'broker1', time: 't' }] };
      brokerService.getBrokerStatusBulk.mockResolvedValue(mockResponse);

      const result = await controller.getBrokerStatusBulk(req, 'host-uid-1', { bnames: ['broker1', 'broker2'] });

      expect(brokerService.getBrokerStatusBulk).toHaveBeenCalledWith('user-123', 'host-uid-1', ['broker1', 'broker2']);
      expect(result).toEqual(mockResponse);
    });

    it('validates the body: bnames must be a non-empty string array', async () => {
      const pipe = createValidationPipe();
      const meta = { type: 'body' as const, metatype: GetBrokerStatusBulkDto };

      await expect(pipe.transform({ bnames: ['broker1', 'broker2'] }, meta)).resolves.toEqual({ bnames: ['broker1', 'broker2'] });
      await expect(pipe.transform({ bnames: [] }, meta)).rejects.toThrow();
      await expect(pipe.transform({ bnames: ['broker1', 3] }, meta)).rejects.toThrow();
      await expect(pipe.transform({}, meta)).rejects.toThrow();
    });
  });
});
