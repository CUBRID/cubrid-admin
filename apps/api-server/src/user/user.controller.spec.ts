import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@config/config.service';
import { AUTH_THROTTLE_OPTIONS } from '../auth/auth-throttle';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  let controller: UserController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      // The login rate limit guard on its routes needs these.
      imports: [ThrottlerModule.forRoot(AUTH_THROTTLE_OPTIONS)],
      controllers: [UserController],
      providers: [
        { provide: UserService, useValue: {} },
        { provide: ConfigService, useValue: { isDesktopMode: () => false } },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
