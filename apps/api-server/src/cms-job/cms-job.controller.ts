import { Controller, Get, Logger, Param, Request } from '@nestjs/common';
import { CmsJobStatusResponse } from '@api-interfaces';
import { CmsJobService } from './cms-job.service';

@Controller('jobs')
export class CmsJobController {
  private readonly logger = new Logger(CmsJobController.name);

  constructor(private readonly cmsJobService: CmsJobService) {}

  @Get('active')
  async listActive(@Request() req): Promise<CmsJobStatusResponse[]> {
    return this.cmsJobService.listActiveJobs(req.user.sub);
  }

  @Get('recent')
  async listRecent(@Request() req): Promise<CmsJobStatusResponse[]> {
    return this.cmsJobService.listRecentJobs(req.user.sub);
  }

  @Get(':jobId')
  async getJob(@Request() req, @Param('jobId') jobId: string): Promise<CmsJobStatusResponse> {
    this.logger.log(`Job status: ${jobId}`);
    return this.cmsJobService.getJob(req.user.sub, jobId);
  }
}
