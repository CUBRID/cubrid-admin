import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from './config.service';

describe('ConfigService', () => {
  let service: ConfigService;
  let prevSeed: string | undefined;
  let prevSalt: string | undefined;
  let prevEnvironment: string | undefined;

  beforeEach(async () => {
    prevSeed = process.env.SEED;
    prevSalt = process.env.SALT;
    prevEnvironment = process.env.ENVIRONMENT;
    process.env.SEED = 'test-seed';
    process.env.SALT = 'test-salt';
    process.env.ENVIRONMENT = 'development';
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfigService],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    if (prevSeed === undefined) {
      delete process.env.SEED;
    } else {
      process.env.SEED = prevSeed;
    }
    if (prevSalt === undefined) {
      delete process.env.SALT;
    } else {
      process.env.SALT = prevSalt;
    }
    if (prevEnvironment === undefined) {
      delete process.env.ENVIRONMENT;
    } else {
      process.env.ENVIRONMENT = prevEnvironment;
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCmsRejectUnauthorized', () => {
    let caCertPath: string;
    let prevCmsRejectUnauthorized: string | undefined;
    let prevCmsCaCertPath: string | undefined;

    beforeEach(() => {
      caCertPath = path.join(os.tmpdir(), `cms-ca-cert-${Date.now()}.pem`);
      fs.writeFileSync(caCertPath, '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n');
      prevCmsRejectUnauthorized = process.env.CMS_REJECT_UNAUTHORIZED;
      prevCmsCaCertPath = process.env.CMS_CA_CERT_PATH;
      delete process.env.CMS_REJECT_UNAUTHORIZED;
      delete process.env.CMS_CA_CERT_PATH;
    });

    afterEach(() => {
      fs.rmSync(caCertPath, { force: true });
      if (prevCmsRejectUnauthorized === undefined) {
        delete process.env.CMS_REJECT_UNAUTHORIZED;
      } else {
        process.env.CMS_REJECT_UNAUTHORIZED = prevCmsRejectUnauthorized;
      }
      if (prevCmsCaCertPath === undefined) {
        delete process.env.CMS_CA_CERT_PATH;
      } else {
        process.env.CMS_CA_CERT_PATH = prevCmsCaCertPath;
      }
    });

    it('defaults to false (no verification) when no CA cert and no explicit override are configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigService],
      }).compile();
      const svc = module.get<ConfigService>(ConfigService);

      expect(svc.getCmsRejectUnauthorized()).toBe(false);
    });

    it('defaults to true (verify) when a CA cert is configured, since getHttpsAgent() would otherwise accept any cert despite the configured CA', async () => {
      process.env.CMS_CA_CERT_PATH = caCertPath;
      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigService],
      }).compile();
      const svc = module.get<ConfigService>(ConfigService);

      expect(svc.getCmsRejectUnauthorized()).toBe(true);
    });

    it('honors an explicit CMS_REJECT_UNAUTHORIZED=false even when a CA cert is configured', async () => {
      process.env.CMS_CA_CERT_PATH = caCertPath;
      process.env.CMS_REJECT_UNAUTHORIZED = 'false';
      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigService],
      }).compile();
      const svc = module.get<ConfigService>(ConfigService);

      expect(svc.getCmsRejectUnauthorized()).toBe(false);
    });

    it('honors an explicit CMS_REJECT_UNAUTHORIZED=true even without a CA cert configured', async () => {
      process.env.CMS_REJECT_UNAUTHORIZED = 'true';
      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigService],
      }).compile();
      const svc = module.get<ConfigService>(ConfigService);

      expect(svc.getCmsRejectUnauthorized()).toBe(true);
    });
  });
});
