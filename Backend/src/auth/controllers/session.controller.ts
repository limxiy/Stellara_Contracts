import { Controller, Get, Delete, Param, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SessionService } from '../session.service';

@ApiTags('auth')
@Controller('auth/sessions')
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Get()
  @ApiOperation({ summary: 'List active sessions for current user' })
  list(@Req() req: any) {
    return this.sessions.listSessions(req.user?.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Terminate a specific session' })
  terminate(@Param('id') id: string, @Req() req: any) {
    return this.sessions.terminateSession(id, req.user?.id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Terminate all sessions (logout everywhere)' })
  terminateAll(@Req() req: any) {
    return this.sessions.terminateAllSessions(req.user?.id);
  }
}
