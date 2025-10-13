"use strict";
/**
 * GitHub-specific CI Pipeline Implementation
 *
 * This module implements the CI pipeline interfaces for GitHub Actions.
 * It handles Git operations and GitHub API interactions for PR creation.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuccessCriteria = exports.GitHubCIPipelineFactory = exports.GitHubCIPipeline = exports.GitHubCIOperations = exports.GitHubGitOperations = void 0;
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const github = __importStar(require("@actions/github"));
const rest_1 = require("@octokit/rest");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ci_pipeline_1 = require("./ci-pipeline");
Object.defineProperty(exports, "SuccessCriteria", { enumerable: true, get: function () { return ci_pipeline_1.SuccessCriteria; } });
/**
 * GitHub Git Operations Implementation
 */
class GitHubGitOperations {
    constructor(config) {
        this.config = config;
    }
    async initialize() {
        // Configure git user
        const workspace = String(process.env.GITHUB_WORKSPACE || process.cwd());
        await exec.exec('git', ['config', 'user.name', this.config.git.userName], { cwd: workspace });
        await exec.exec('git', ['config', 'user.email', this.config.git.userEmail], { cwd: workspace });
    }
    async isGitRepository() {
        try {
            const workspace = String(process.env.GITHUB_WORKSPACE || process.cwd());
            await exec.exec('git', ['rev-parse', '--git-dir'], { silent: true, cwd: workspace });
            return true;
        }
        catch {
            return false;
        }
    }
    async getCurrentBranch() {
        const workspace = String(process.env.GITHUB_WORKSPACE || process.cwd());
        const { stdout } = await exec.getExecOutput('git', ['branch', '--show-current'], { cwd: workspace });
        return stdout.trim();
    }
    async branchExists(branchName) {
        try {
            const workspace = String(process.env.GITHUB_WORKSPACE || process.cwd());
            await exec.exec('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], { silent: true, cwd: workspace });
            return true;
        }
        catch {
            return false;
        }
    }
    async createBranch(branchInfo) {
        const workspace = String(process.env.GITHUB_WORKSPACE || process.cwd());
        if (branchInfo.exists) {
            await this.checkoutBranch(branchInfo.name);
        }
        else {
            await exec.exec('git', ['checkout', '-b', branchInfo.name, branchInfo.baseBranch], { cwd: workspace });
        }
    }
    async checkoutBranch(branchName) {
        const workspace = String(process.env.GITHUB_WORKSPACE || process.cwd());
        await exec.exec('git', ['checkout', branchName], { cwd: workspace });
    }
    async addFiles(files) {
        const workspace = String(process.env.GITHUB_WORKSPACE || process.cwd());
        for (const file of files) {
            await exec.exec('git', ['add', file], { cwd: workspace });
        }
    }
    async commit(commitInfo) {
        const workspace = String(process.env.GITHUB_WORKSPACE || process.cwd());
        const args = ['commit', '-m', commitInfo.message];
        if (commitInfo.amend) {
            args.push('--amend');
        }
        await exec.exec('git', args, { cwd: workspace });
    }
    async pushBranch(branchName, force = false) {
        const workspace = String(process.env.GITHUB_WORKSPACE || process.cwd());
        const args = ['push', 'origin', branchName];
        if (force) {
            args.push('--force');
        }
        await exec.exec('git', args, { cwd: workspace });
    }
    async getRepositoryUrl() {
        const workspace = String(process.env.GITHUB_WORKSPACE || process.cwd());
        const { stdout } = await exec.getExecOutput('git', ['config', '--get', 'remote.origin.url'], { cwd: workspace });
        return stdout.trim();
    }
    async getRepositoryInfo() {
        const context = github.context;
        return {
            owner: context.repo.owner,
            repo: context.repo.repo
        };
    }
}
exports.GitHubGitOperations = GitHubGitOperations;
/**
 * GitHub CI Operations Implementation
 */
class GitHubCIOperations {
    constructor(config, token) {
        this.config = config;
        this.octokit = new rest_1.Octokit({ auth: token });
    }
    async createPullRequest(prInfo) {
        try {
            const { owner, repo } = await this.getRepositoryInfo();
            const { data: pr } = await this.octokit.pulls.create({
                owner,
                repo,
                title: prInfo.title,
                head: prInfo.headBranch,
                base: prInfo.baseBranch,
                body: prInfo.description,
                labels: prInfo.labels || this.config.pullRequest.defaultLabels,
                assignees: prInfo.assignees,
                reviewers: prInfo.reviewers
            });
            return {
                number: pr.number,
                url: pr.html_url,
                success: true
            };
        }
        catch (error) {
            core.error(`Failed to create pull request: ${error}`);
            return {
                number: 0,
                url: '',
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    isRunningInCI() {
        return !!process.env.GITHUB_ACTIONS;
    }
    getCIInfo() {
        const context = github.context;
        return {
            provider: 'github',
            repository: `${context.repo.owner}/${context.repo.repo}`,
            branch: context.ref.replace('refs/heads/', ''),
            commit: context.sha,
            pullRequest: context.payload.pull_request?.number
        };
    }
    getAuthToken() {
        return process.env.GITHUB_TOKEN;
    }
    async getRepositoryInfo() {
        const context = github.context;
        return {
            owner: context.repo.owner,
            repo: context.repo.repo
        };
    }
}
exports.GitHubCIOperations = GitHubCIOperations;
/**
 * GitHub CI Pipeline Implementation
 */
class GitHubCIPipeline {
    constructor(config, token) {
        this.config = config;
        this.git = new GitHubGitOperations(config);
        this.ci = new GitHubCIOperations(config, token);
    }
    async processRepairedFiles(testResults) {
        if (testResults.repairedFiles.size === 0) {
            core.info('No files were repaired, skipping PR creation');
            return null;
        }
        try {
            // Initialize git if needed
            await this.git.initialize();
            // Generate branch name
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const branchName = this.config.branch.nameTemplate
                .replace('{timestamp}', timestamp)
                .replace('{prefix}', this.config.branch.prefix);
            // Get current branch as base
            const currentBranch = await this.git.getCurrentBranch();
            // Create branch
            const branchExists = await this.git.branchExists(branchName);
            await this.git.createBranch({
                name: branchName,
                baseBranch: currentBranch,
                exists: branchExists
            });
            // Write repaired files
            for (const [filePath, content] of testResults.repairedFiles) {
                // Resolve file path relative to the repository workspace
                const workspace = String(process.env.GITHUB_WORKSPACE || process.cwd());
                const stringFilePath = String(filePath);
                const fullPath = path.isAbsolute(stringFilePath) ? stringFilePath : path.join(workspace, stringFilePath);
                const dir = path.dirname(String(fullPath));
                // Ensure directory exists
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                // Write file
                fs.writeFileSync(fullPath, content, 'utf8');
                core.info(`TestChimp: 📝 Wrote repaired file: ${fullPath}`);
            }
            // Add and commit files
            const filesToCommit = Array.from(testResults.repairedFiles.keys());
            await this.git.addFiles(filesToCommit);
            const commitMessage = this.generateCommitMessage(testResults);
            await this.git.commit({
                message: commitMessage,
                files: filesToCommit
            });
            // Push branch
            await this.git.pushBranch(branchName);
            // Create pull request
            const prInfo = this.generatePullRequestInfo(branchName, currentBranch, testResults);
            const result = await this.ci.createPullRequest(prInfo);
            if (result.success) {
                core.info(`✅ Created pull request #${result.number}: ${result.url}`);
            }
            else {
                core.error(`❌ Failed to create pull request: ${result.error}`);
            }
            return result;
        }
        catch (error) {
            core.error(`Failed to process repaired files: ${error}`);
            return {
                number: 0,
                url: '',
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    generateCommitMessage(testResults) {
        const repairedCount = testResults.repairedFiles.size;
        const testSummary = `${testResults.successCount}/${testResults.totalTests} tests passed`;
        return `🤖 TestChimp AI Repair: Fixed ${repairedCount} test file${repairedCount > 1 ? 's' : ''}\n\n` +
            `Test Results: ${testSummary}\n` +
            `Repaired Files: ${Array.from(testResults.repairedFiles.keys()).join(', ')}`;
    }
    generatePullRequestInfo(headBranch, baseBranch, testResults) {
        const repairedCount = testResults.repairedFiles.size;
        const testSummary = `${testResults.successCount}/${testResults.totalTests} tests passed`;
        const title = this.config.pullRequest.titleTemplate
            .replace('{count}', repairedCount.toString())
            .replace('{summary}', testSummary)
            .replace('{count,plural,one{} other{s}}', repairedCount === 1 ? '' : 's');
        const description = this.config.pullRequest.descriptionTemplate
            .replace('{count}', repairedCount.toString())
            .replace('{summary}', testSummary)
            .replace('{files}', Array.from(testResults.repairedFiles.keys()).join('\n- '));
        return {
            title,
            description,
            headBranch,
            baseBranch,
            labels: this.config.pullRequest.defaultLabels
        };
    }
}
exports.GitHubCIPipeline = GitHubCIPipeline;
/**
 * GitHub CI Pipeline Factory
 */
class GitHubCIPipelineFactory {
    static createPipeline(config) {
        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            throw new Error('GITHUB_TOKEN environment variable is required');
        }
        return new GitHubCIPipeline(config, token);
    }
    static detectAndCreatePipeline() {
        if (!process.env.GITHUB_ACTIONS) {
            return null;
        }
        const config = {
            git: {
                userName: 'TestChimp Bot',
                userEmail: 'bot@testchimp.io',
                defaultBranch: 'main'
            },
            pullRequest: {
                defaultLabels: ['testchimp', 'ai-repair', 'automated'],
                titleTemplate: '🤖 TestChimp AI Repair: {count} file{count,plural,one{} other{s}} fixed ({summary})',
                descriptionTemplate: `## 🤖 TestChimp AI Repair

This PR contains automated repairs made by TestChimp AI.

### 📊 Test Results
- **Tests Passed**: {summary}
- **Files Repaired**: {count}

### 📁 Repaired Files
- {files}

### 🔧 What was fixed?
TestChimp AI analyzed the failing tests and automatically applied fixes to improve test reliability and correctness.

---
*This PR was created automatically by TestChimp. Please review the changes before merging.*`,
                autoMerge: false
            },
            branch: {
                nameTemplate: '{prefix}/ai-repairs-{timestamp}',
                prefix: 'testchimp'
            },
            successCriteria: {
                criteria: ci_pipeline_1.SuccessCriteria.ORIGINAL_SUCCESS,
                repairConfidenceThreshold: 4
            }
        };
        return this.createPipeline(config);
    }
    static getSupportedProviders() {
        return ['github'];
    }
}
exports.GitHubCIPipelineFactory = GitHubCIPipelineFactory;
//# sourceMappingURL=github-pipeline.js.map