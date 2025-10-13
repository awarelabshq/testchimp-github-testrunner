/**
 * GitHub-specific CI Pipeline Implementation
 *
 * This module implements the CI pipeline interfaces for GitHub Actions.
 * It handles Git operations and GitHub API interactions for PR creation.
 */
import { GitOperations, CIPipelineOperations, CIPipeline, CIPipelineConfig, BranchInfo, CommitInfo, PullRequestInfo, PullRequestResult, TestResults, SuccessCriteria } from './ci-pipeline';
/**
 * GitHub Git Operations Implementation
 */
export declare class GitHubGitOperations implements GitOperations {
    private config;
    constructor(config: CIPipelineConfig);
    initialize(): Promise<void>;
    isGitRepository(): Promise<boolean>;
    getCurrentBranch(): Promise<string>;
    branchExists(branchName: string): Promise<boolean>;
    createBranch(branchInfo: BranchInfo): Promise<void>;
    checkoutBranch(branchName: string): Promise<void>;
    addFiles(files: string[]): Promise<void>;
    commit(commitInfo: CommitInfo): Promise<void>;
    pushBranch(branchName: string, force?: boolean): Promise<void>;
    getRepositoryUrl(): Promise<string>;
    getRepositoryInfo(): Promise<{
        owner: string;
        repo: string;
    }>;
}
/**
 * GitHub CI Operations Implementation
 */
export declare class GitHubCIOperations implements CIPipelineOperations {
    private octokit;
    private config;
    constructor(config: CIPipelineConfig, token: string);
    createPullRequest(prInfo: PullRequestInfo): Promise<PullRequestResult>;
    isRunningInCI(): boolean;
    getCIInfo(): {
        provider: string;
        repository: string;
        branch: string;
        commit: string;
        pullRequest: number | undefined;
    };
    getAuthToken(): string | undefined;
    private getRepositoryInfo;
}
/**
 * GitHub CI Pipeline Implementation
 */
export declare class GitHubCIPipeline implements CIPipeline {
    git: GitOperations;
    ci: CIPipelineOperations;
    config: CIPipelineConfig;
    constructor(config: CIPipelineConfig, token: string);
    processRepairedFiles(testResults: TestResults): Promise<PullRequestResult | null>;
    private generateCommitMessage;
    private generatePullRequestInfo;
}
/**
 * GitHub CI Pipeline Factory
 */
export declare class GitHubCIPipelineFactory {
    static createPipeline(config: CIPipelineConfig): CIPipeline;
    static detectAndCreatePipeline(): CIPipeline | null;
    static getSupportedProviders(): string[];
}
export { SuccessCriteria };
