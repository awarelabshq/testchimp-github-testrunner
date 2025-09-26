/**
 * File Handler Interface
 * Defines how different platforms handle file operations
 */

export interface FileHandler {
  /**
   * Write repaired test content to file
   * @param filePath Path to the test file
   * @param content Repaired test content
   */
  writeRepairedTest(filePath: string, content: string): Promise<void>;
  
  /**
   * Read test file content
   * @param filePath Path to the test file
   * @returns File content as string
   */
  readTestFile(filePath: string): Promise<string>;
  
  /**
   * Write generated script to file
   * @param filePath Path where to write the script
   * @param content Generated script content
   */
  writeGeneratedScript(filePath: string, content: string): Promise<void>;
  
  /**
   * Write execution log to file
   * @param filePath Path where to write the log
   * @param content Log content
   */
  writeExecutionLog(filePath: string, content: string): Promise<void>;

  /**
   * Resolve a relative path to an absolute path based on the current working directory
   * @param relativePath Relative path to resolve
   * @returns Absolute path
   */
  resolvePath(relativePath: string): string;

  /**
   * Check if a file exists
   * @param filePath Path to check
   * @returns True if file exists
   */
  fileExists(filePath: string): Promise<boolean>;
}

/**
 * Local File Handler - Direct file system operations
 * Used by VS Code extension for local development
 */
export class LocalFileHandler implements FileHandler {
  private fs = require('fs');
  private path = require('path');
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || process.cwd();
  }

  async writeRepairedTest(filePath: string, content: string): Promise<void> {
    this.fs.writeFileSync(filePath, content, 'utf8');
  }

  async readTestFile(filePath: string): Promise<string> {
    return this.fs.readFileSync(filePath, 'utf8');
  }

  async writeGeneratedScript(filePath: string, content: string): Promise<void> {
    // Ensure directory exists
    const dir = this.path.dirname(filePath);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }
    this.fs.writeFileSync(filePath, content, 'utf8');
  }

  async writeExecutionLog(filePath: string, content: string): Promise<void> {
    // Ensure directory exists
    const dir = this.path.dirname(filePath);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }
    this.fs.writeFileSync(filePath, content, 'utf8');
  }

  resolvePath(relativePath: string): string {
    return this.path.resolve(this.basePath, relativePath);
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      return this.fs.existsSync(filePath);
    } catch {
      return false;
    }
  }
}

/**
 * CI/CD File Handler - Creates PRs instead of direct file writes
 * Used by GitHub Actions for CI/CD environments
 */
export class CIFileHandler implements FileHandler {
  private fs = require('fs');
  private path = require('path');
  private repairedFiles: Map<string, string> = new Map();
  private logArtifacts: Map<string, string> = new Map();
  private artifactsDir: string;
  private basePath: string;

  constructor(artifactsDir?: string, basePath?: string) {
    // Default to ./testchimp-artifacts if not specified
    this.artifactsDir = artifactsDir || './testchimp-artifacts';
    this.basePath = basePath || process.cwd();
  }

  async writeRepairedTest(filePath: string, content: string): Promise<void> {
    // Store repaired content for PR creation instead of direct write
    this.repairedFiles.set(filePath, content);
    console.log(`[CI] Repaired test stored for PR: ${filePath}`);
  }

  async readTestFile(filePath: string): Promise<string> {
    return this.fs.readFileSync(filePath, 'utf8');
  }

  async writeGeneratedScript(filePath: string, content: string): Promise<void> {
    // Store generated scripts as artifacts for CI/CD
    const artifactPath = this.path.join(this.artifactsDir, 'generated-scripts', this.path.basename(filePath));
    this.logArtifacts.set(artifactPath, content);
    console.log(`[CI] Generated script stored as artifact: ${artifactPath}`);
  }

  async writeExecutionLog(filePath: string, content: string): Promise<void> {
    // Store logs as artifacts AND output to console for immediate visibility
    const artifactPath = this.path.join(this.artifactsDir, 'execution-logs', this.path.basename(filePath));
    this.logArtifacts.set(artifactPath, content);
    
    // Output to console with clear markers for CI/CD visibility
    console.log(`[CI] === EXECUTION LOG: ${this.path.basename(filePath)} ===`);
    console.log(content);
    console.log(`[CI] === END LOG: ${this.path.basename(filePath)} ===`);
    console.log(`[CI] Full log available as artifact: ${artifactPath}`);
  }

  /**
   * Get all repaired files for PR creation
   */
  getRepairedFiles(): Map<string, string> {
    return this.repairedFiles;
  }

  /**
   * Clear repaired files after PR creation
   */
  clearRepairedFiles(): void {
    this.repairedFiles.clear();
  }

  /**
   * Get all log artifacts for CI/CD upload
   */
  getLogArtifacts(): Map<string, string> {
    return this.logArtifacts;
  }

  /**
   * Write all artifacts to filesystem for CI/CD artifact upload
   */
  async writeArtifactsToFilesystem(): Promise<string[]> {
    const writtenFiles: string[] = [];
    
    for (const [artifactPath, content] of this.logArtifacts) {
      // Ensure directory exists
      const dir = this.path.dirname(artifactPath);
      if (!this.fs.existsSync(dir)) {
        this.fs.mkdirSync(dir, { recursive: true });
      }
      
      this.fs.writeFileSync(artifactPath, content, 'utf8');
      writtenFiles.push(artifactPath);
    }
    
    return writtenFiles;
  }

  /**
   * Get GitHub Actions artifact upload commands
   */
  getGitHubActionsArtifactCommands(): string[] {
    const commands: string[] = [];
    
    if (this.logArtifacts.size > 0) {
      commands.push(`# Upload TestChimp artifacts`);
      commands.push(`- name: Upload TestChimp artifacts`);
      commands.push(`  uses: actions/upload-artifact@v4`);
      commands.push(`  with:`);
      commands.push(`    name: testchimp-logs-$(date +%s)`);
      commands.push(`    path: ${this.artifactsDir}/`);
      commands.push(`    retention-days: 30`);
    }
    
    return commands;
  }

  resolvePath(relativePath: string): string {
    return this.path.resolve(this.basePath, relativePath);
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      return this.fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Helper method to get GitHub run ID (for documentation purposes)
   */
  private getGitHubRunId(): string {
    return '${{ github.run_id }}';
  }
}

/**
 * No-op File Handler - For testing or when file operations are not needed
 */
export class NoOpFileHandler implements FileHandler {
  async writeRepairedTest(filePath: string, content: string): Promise<void> {
    // No operation
  }

  async readTestFile(filePath: string): Promise<string> {
    return '';
  }

  async writeGeneratedScript(filePath: string, content: string): Promise<void> {
    // No operation
  }

  async writeExecutionLog(filePath: string, content: string): Promise<void> {
    // No operation
  }

  resolvePath(relativePath: string): string {
    return relativePath;
  }

  async fileExists(filePath: string): Promise<boolean> {
    return false;
  }
}
