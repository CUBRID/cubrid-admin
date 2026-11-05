import { Controller, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { NotOnDesktop } from '@common';
import { ConfigService } from '@config/config.service';
import { JwtAuthGuard } from '@token';
import { DESKTOP_USER_ID, DesktopUserGuard } from './desktop-user.guard';
import { selectAppGuard } from './select-app-guard';

@Controller('open')
class OpenController {
  @Get()
  read() {
    return 'ok';
  }

  @NotOnDesktop()
  @Get('account')
  account() {
    return 'ok';
  }
}

@NotOnDesktop()
@Controller('closed')
class ClosedController {
  @Get()
  login() {
    return 'ok';
  }
}

const contextFor = (controller: object, handler: (...args: never[]) => unknown, request: Record<string, unknown>) =>
  new ExecutionContextHost([request, {}], controller.constructor as never, handler);

describe('DesktopUserGuard', () => {
  const guard = new DesktopUserGuard(new Reflector());

  it('lets a request in as the desktop user, with no token', () => {
    const request: Record<string, unknown> = {};
    expect(guard.canActivate(contextFor(new OpenController(), OpenController.prototype.read, request))).toBe(true);
    expect(request.user).toEqual({ sub: DESKTOP_USER_ID });
  });

  it('refuses the routes marked NotOnDesktop, on the method or the controller', () => {
    expect(() => guard.canActivate(contextFor(new OpenController(), OpenController.prototype.account, {}))).toThrow();
    expect(() => guard.canActivate(contextFor(new ClosedController(), ClosedController.prototype.login, {}))).toThrow();
  });
});

describe('selectAppGuard', () => {
  const config = (desktop: boolean) => ({ isDesktopMode: () => desktop }) as ConfigService;

  it('uses the login-free guard only in desktop mode', () => {
    expect(selectAppGuard(config(true), new Reflector())).toBeInstanceOf(DesktopUserGuard);
    expect(selectAppGuard(config(false), new Reflector())).toBeInstanceOf(JwtAuthGuard);
  });
});
