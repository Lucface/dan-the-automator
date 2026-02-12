import { JobStatus, type FixJob, type JobStatusType, type AgentFixResult } from "../types";

/**
 * In-memory job queue for fix requests.
 * Phase 1 MVP - will be replaced with BullMQ/Redis in Phase 2.
 */
class FixQueue {
  private jobs: Map<string, FixJob> = new Map();
  private processingCallbacks: Array<(job: FixJob) => Promise<void>> = [];

  /**
   * Add a new fix job to the queue.
   */
  enqueue(params: {
    issueId: string;
    title: string;
    seerAnalysis?: string;
    file?: string;
    line?: number;
  }): FixJob {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    const job: FixJob = {
      id,
      issueId: params.issueId,
      title: params.title,
      seerAnalysis: params.seerAnalysis,
      file: params.file,
      line: params.line,
      status: JobStatus.PENDING,
      createdAt: now,
      updatedAt: now,
      agentOutput: undefined,
      prUrl: undefined,
      error: undefined,
    };

    this.jobs.set(id, job);
    console.log(`[Queue] Job ${id} enqueued for issue ${params.issueId}: "${params.title}"`);

    // Fire-and-forget processing
    this.processNext(job).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Queue] Processing failed for job ${id}:`, message);
    });

    return job;
  }

  /**
   * Update a job's status.
   */
  updateStatus(jobId: string, status: JobStatusType, extras?: Partial<FixJob>): FixJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    job.status = status;
    job.updatedAt = new Date();

    if (extras) {
      if (extras.agentOutput !== undefined) job.agentOutput = extras.agentOutput;
      if (extras.prUrl !== undefined) job.prUrl = extras.prUrl;
      if (extras.error !== undefined) job.error = extras.error;
    }

    console.log(`[Queue] Job ${jobId} status: ${status}`);
    return job;
  }

  /**
   * Set the agent output for a job.
   */
  setAgentOutput(jobId: string, output: AgentFixResult): FixJob | undefined {
    return this.updateStatus(jobId, JobStatus.FIXED, { agentOutput: output });
  }

  /**
   * Set the PR URL for a job.
   */
  setPRUrl(jobId: string, prUrl: string): FixJob | undefined {
    return this.updateStatus(jobId, JobStatus.PR_CREATED, { prUrl });
  }

  /**
   * Mark a job as failed.
   */
  fail(jobId: string, error: string): FixJob | undefined {
    return this.updateStatus(jobId, JobStatus.FAILED, { error });
  }

  /**
   * Get a job by ID.
   */
  getJob(jobId: string): FixJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get a job by issue ID.
   */
  getJobByIssueId(issueId: string): FixJob | undefined {
    for (const job of this.jobs.values()) {
      if (job.issueId === issueId) return job;
    }
    return undefined;
  }

  /**
   * Get all jobs, optionally filtered by status.
   */
  getAllJobs(status?: JobStatusType): FixJob[] {
    const jobs = Array.from(this.jobs.values());
    if (status) return jobs.filter((j) => j.status === status);
    return jobs;
  }

  /**
   * Register a callback to process jobs.
   */
  onProcess(callback: (job: FixJob) => Promise<void>): void {
    this.processingCallbacks.push(callback);
  }

  /**
   * Process a job through all registered callbacks.
   */
  private async processNext(job: FixJob): Promise<void> {
    this.updateStatus(job.id, JobStatus.PROCESSING);

    for (const callback of this.processingCallbacks) {
      try {
        await callback(job);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.fail(job.id, message);
        throw err;
      }
    }
  }

  /**
   * Get queue stats.
   */
  stats(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const job of this.jobs.values()) {
      counts[job.status] = (counts[job.status] ?? 0) + 1;
    }
    return counts;
  }

  /**
   * Clear all jobs (for testing).
   */
  clear(): void {
    this.jobs.clear();
  }
}

// Singleton instance
export const fixQueue = new FixQueue();
