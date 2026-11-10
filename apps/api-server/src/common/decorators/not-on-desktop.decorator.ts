import { SetMetadata } from '@nestjs/common';

export const NOT_ON_DESKTOP = 'notOnDesktop';

/**
 * Marks a route the desktop app has no use for — app login, tokens and
 * accounts — so DesktopUserGuard refuses it in desktop mode. The web server
 * (JwtAuthGuard) ignores it.
 */
export const NotOnDesktop = () => SetMetadata(NOT_ON_DESKTOP, true);
