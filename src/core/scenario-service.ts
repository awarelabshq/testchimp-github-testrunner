import { EventEmitter } from 'events';
import dotenv from 'dotenv';
import { ScenarioJob, ScenarioRunJob, ScenarioResponse, PlaywrightConfig } from './types';
import { ScenarioWorker } from './scenario-worker-class';
import { FileHandler, NoOpFileHandler } from './file-handler';
import { AuthConfig } from './auth-config';

// Load environment variables
dotenv.config();

/**
 * Service for processing scenarios using LLM + Playwright
 */
export class ScenarioService extends EventEmitter {
  private workers: ScenarioWorker[] = [];
  private jobQueue: ScenarioRunJob[] = [];
  private busyWorkers: Set<ScenarioWorker> = new Set();
  private maxWorkers: number;
  private fileHandler: FileHandler;
  private authConfig: AuthConfig | null;
  private backendUrl?: string;

  constructor(maxWorkers: number = 2, fileHandler?: FileHandler, authConfig?: AuthConfig, backendUrl?: string) {
    super();
    this.maxWorkers = maxWorkers;
    this.fileHandler = fileHandler || new NoOpFileHandler();
    this.authConfig = authConfig || null;
    this.backendUrl = backendUrl;
  }

  private async initializeWorkers(): Promise<void> {
    for (let i = 0; i < this.maxWorkers; i++) {
      await this.createWorker();
    }
  }

  private async createWorker(): Promise<void> {
    const worker = new ScenarioWorker(this.fileHandler, this.authConfig || undefined, this.backendUrl);
    await worker.initialize();
    this.workers.push(worker);
    console.log(`Scenario worker initialized with session: ${worker['sessionId']}`);
  }

  async initialize(): Promise<void> {
    // Wait for workers to be initialized
    await this.initializeWorkers();
    console.log('Scenario service initialized');
  }

  processScenario(scenario: string, testName?: string, config?: PlaywrightConfig, model?: string, outputDirectory?: string, logsDirectory?: string): string {
    const jobId = `scenario_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add job to queue
    const job: ScenarioRunJob = {
      id: jobId,
      scenario,
      testName,
      playwrightConfig: config,
      model,
      outputDirectory,
      logsDirectory
    };

    this.jobQueue.push(job);
    this.processNextJob();
    
    return jobId; // Return job ID for tracking
  }

  private async processNextJob(): Promise<void> {
    if (this.jobQueue.length === 0) {
      return;
    }

    console.log(`[ScenarioService] Processing next job. Queue length: ${this.jobQueue.length}, Workers: ${this.workers.length}, Busy workers: ${this.busyWorkers.size}`);

    // Find available worker (proper load balancing)
    const availableWorker = this.workers.find(worker => !this.busyWorkers.has(worker));
    if (!availableWorker) {
      console.log('[ScenarioService] No available workers, waiting...');
      return; // All workers busy, wait for one to become available
    }

    const job = this.jobQueue.shift();
    if (!job) {
      return;
    }

    console.log(`[ScenarioService] Processing job ${job.id} with worker`);

    // Mark worker as busy
    this.busyWorkers.add(availableWorker);
    
    try {
      // Process job directly with worker
      const result = await availableWorker.processScenarioJob(job);
      console.log(`[ScenarioService] Job ${job.id} completed with result:`, result);
      this.handleJobResult(job.id, result);
    } catch (error) {
      console.error('Error processing job with worker:', error);
      this.emit('jobError', job.id, error);
      // Put job back in queue if it failed
      this.jobQueue.unshift(job);
    } finally {
      // Mark worker as available again
      this.busyWorkers.delete(availableWorker);
      // Process next job
      this.processNextJob();
    }
  }

  private handleJobResult(jobId: string, result: ScenarioResponse): void {
    // Emit result event
    this.emit('jobComplete', jobId, result);
    
    // Mark worker as available and process next job
    this.busyWorkers.clear(); // Simple approach - clear all busy workers
    this.processNextJob();
  }

  private handleJobError(jobId: string, error: string): void {
    // Emit error event
    this.emit('jobError', jobId, new Error(error));
    
    // Mark worker as available and process next job
    this.busyWorkers.clear(); // Simple approach - clear all busy workers
    this.processNextJob();
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down scenario service...');
    
    // Cleanup all workers
    const cleanupPromises = this.workers.map(worker => worker.cleanup());
    await Promise.all(cleanupPromises);
    
    this.workers = [];
    this.busyWorkers.clear();
    console.log('Scenario service shutdown complete');
  }
}
