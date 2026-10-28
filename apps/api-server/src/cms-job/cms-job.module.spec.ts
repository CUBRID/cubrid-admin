import { MODULE_METADATA } from '@nestjs/common/constants';
import { DatabaseUserModule } from '@database/user/database-user.module';
import { DatabaseUserService } from '@database/user/database-user.service';
import { CmsJobModule } from './cms-job.module';

describe('CmsJobModule', () => {
  // A private DatabaseUserService copy here kept its own dbLoginCache, so a
  // DB login made inside a job never showed up in start-info's isLoggedIn.
  it('uses the shared DatabaseUserService from DatabaseUserModule, not its own copy', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CmsJobModule) ?? [];
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, CmsJobModule) ?? [];

    expect(providers).not.toContain(DatabaseUserService);
    expect(imports).toContain(DatabaseUserModule);
  });
});
