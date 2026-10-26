import { Test, TestingModule } from '@nestjs/testing';
import { CmsConfigController } from './cms-config.controller';
import { CmsConfigService } from './cms-config.service';

describe('CmsConfigController', () => {
  let controller: CmsConfigController;
  let cmsConfigService: jest.Mocked<CmsConfigService>;

  beforeEach(async () => {
    const mockCmsConfigService = {
      getAddBrokerInfo: jest.fn(),
      getEnv: jest.fn(),
      getParamDump: jest.fn(),
      getPlanDump: jest.fn(),
      getStatDump: jest.fn(),
      getAllSystemParam: jest.fn(),
      setSystemParam: jest.fn(),
      setSystemParamFromRawEdit: jest.fn(),
      setBrokerParam: jest.fn(),
      setBrokerParamFromRawEdit: jest.fn(),
    };
    cmsConfigService = mockCmsConfigService as unknown as jest.Mocked<CmsConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CmsConfigController],
      providers: [
        { provide: CmsConfigService, useValue: mockCmsConfigService },
      ],
    }).compile();

    controller = module.get<CmsConfigController>(CmsConfigController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAddBrokerInfo', () => {
    it('should call cmsConfigService.getAddBrokerInfo and return broker config', async () => {
      const mockResponse = {
        conflist: [{ confdata: ['[broker]', 'SERVICE = ON'] }],
        confname: 'broker',
      };
      cmsConfigService.getAddBrokerInfo.mockResolvedValue(mockResponse);

      const req = { user: { sub: 'user-123' } };
      const result = await controller.getAddBrokerInfo(
        req as any,
        'host-uid-1',
        'brokerconf'
      );

      expect(cmsConfigService.getAddBrokerInfo).toHaveBeenCalledWith(
        'user-123',
        'host-uid-1',
        'brokerconf'
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('setBrokerParam', () => {
    it('should call cmsConfigService.setBrokerParamFromRawEdit and return { success: true }', async () => {
      cmsConfigService.setBrokerParamFromRawEdit.mockResolvedValue({ success: true });

      const req = { user: { sub: 'user-123' } };
      const body = { confdata: ['[broker]', 'SERVICE=ON'] };
      const result = await controller.setBrokerParam(req as any, 'host-uid-1', body);

      expect(cmsConfigService.setBrokerParamFromRawEdit).toHaveBeenCalledWith(
        'user-123',
        'host-uid-1',
        body.confdata
      );
      expect(result).toEqual({ success: true });
    });
  });
});
