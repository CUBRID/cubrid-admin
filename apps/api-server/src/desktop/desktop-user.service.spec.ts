import { ConfigService } from '@config/config.service';
import { UserError } from '@error/user/user-error';
import { UserRepositoryService } from '@repository';
import { DESKTOP_USER_ID } from './desktop-user.guard';
import { DesktopUserService } from './desktop-user.service';

describe('DesktopUserService', () => {
  const make = (desktop: boolean, loadUserById: jest.Mock) => {
    const repository = { loadUserById, createUser: jest.fn().mockResolvedValue(undefined) };
    const service = new DesktopUserService(
      { isDesktopMode: () => desktop } as ConfigService,
      repository as unknown as UserRepositoryService
    );
    return { service, repository };
  };

  it('creates the desktop user record when the workspace has none, so every service can load it', async () => {
    const { service, repository } = make(true, jest.fn().mockRejectedValue(UserError.UserNotFound({ userId: DESKTOP_USER_ID })));
    await service.onApplicationBootstrap();
    expect(repository.createUser).toHaveBeenCalledWith({ id: DESKTOP_USER_ID, password: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it('keeps an existing record', async () => {
    const { service, repository } = make(true, jest.fn().mockResolvedValue({ id: DESKTOP_USER_ID }));
    await service.onApplicationBootstrap();
    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it('does not create over a record it could not read for another reason', async () => {
    const { service, repository } = make(true, jest.fn().mockRejectedValue(UserError.ResourceLocked({ resourceId: 'x' })));
    await expect(service.onApplicationBootstrap()).rejects.toBeInstanceOf(UserError);
    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it('does nothing on the web server', async () => {
    const loadUserById = jest.fn();
    const { service } = make(false, loadUserById);
    await service.onApplicationBootstrap();
    expect(loadUserById).not.toHaveBeenCalled();
  });
});
