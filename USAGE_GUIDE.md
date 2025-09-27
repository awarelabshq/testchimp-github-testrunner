# TestChimp GitHub Action - Usage Guide

A comprehensive guide for setting up and using the TestChimp GitHub Action for AI-powered test repair.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Repository Configuration](#repository-configuration)
5. [Workflow Setup](#workflow-setup)
6. [Configuration Options](#configuration-options)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Usage](#advanced-usage)

## Quick Start

### 1. Add Repository Secrets
Go to your repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret Name | Description |
|-------------|-------------|
| `TESTCHIMP_API_KEY` | Your TestChimp project API key |
| `TESTCHIMP_PROJECT_ID` | Your TestChimp project ID |

You can find these by logging in to your TestChimp Account -> Click on Project (at top of sidebar) -> Settings.
The API Key to be used here is the *Data API Key*.

### 2. Enable Repository Permissions
**Critical Step**: Go to **Settings** → **Actions** → **General** → **Workflow permissions**
- Select **"Read and write permissions"** (required to create branches and push commits)
- ✅ **Check**: "Allow GitHub Actions to create and approve pull requests"

### 3. Add Workflow
Create `.github/workflows/testchimp.yml`:

```yaml
name: TestChimp AI Test Runner

on:
  workflow_dispatch:
  pull_request:
    branches: [ main, develop ]
    paths: [ 'ui/tests/**' ]

jobs:
  testchimp-tests:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run TestChimp Tests with AI Repair
        uses: awarelabshq/testchimp-github-testrunner@v1.0.8
        env:
          TESTCHIMP_ENV: staging
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          api-key: ${{ secrets.TESTCHIMP_API_KEY }}
          project-id: ${{ secrets.TESTCHIMP_PROJECT_ID }}
          testchimp-endpoint: "https://featureservice-staging.testchimp.io"
          test-directory: "ui/tests,services/tests"
          success-criteria: "REPAIR_SUCCESS_WITH_CONFIDENCE"
          repair-confidence-threshold: "4"
          create-pr-on-repair: "true"
```

## Prerequisites

### TestChimp Account Setup
1. Sign up at [TestChimp](https://testchimp.io)
2. Create a new project
3. Get your API credentials:
   - **API Key**: Found in project settings
   - **Project ID**: Found in project settings

### Test File Requirements
Your test files must be "TestChimp-managed" by including markers:

```javascript
// TestChimp: step 1 - Login to the application
// TestChimp: step 2 - Navigate to dashboard
// TestChimp: step 3 - Verify user profile

// Or use this format:
/* TestChimp: step 1 - Login to the application */
/* TestChimp: step 2 - Navigate to dashboard */
```

## Installation

### Step 1: Repository Secrets
1. Navigate to your GitHub repository
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**
4. Add these secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `TESTCHIMP_API_KEY` | `tc_1234567890abcdef` | Your TestChimp API key |
| `TESTCHIMP_PROJECT_ID` | `proj_abc123def456` | Your TestChimp project ID |

### Step 2: Repository Permissions
1. Go to **Settings** → **Actions** → **General**
2. Scroll to **"Workflow permissions"**
3. Select **"Read and write permissions"**
4. ✅ **Check**: "Allow GitHub Actions to create and approve pull requests"

## Workflow Setup

### Basic Workflow Template

```yaml
name: TestChimp AI Test Repair

on:
  workflow_dispatch:  # Manual trigger
  pull_request:       # On PR creation
    branches: [ main, develop ]
    paths: [ 'ui/tests/**' ]  # Adjust paths as needed

jobs:
  testchimp-tests:
    runs-on: ubuntu-latest
    
    # Required permissions for PR creation
    permissions:
      contents: write      # Required to create branches and push commits
      pull-requests: write # Required to create pull requests
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run TestChimp Tests with AI Repair
        id: testchimp
        uses: awarelabshq/testchimp-github-testrunner@v1.0.8
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          api-key: ${{ secrets.TESTCHIMP_API_KEY }}
          project-id: ${{ secrets.TESTCHIMP_PROJECT_ID }}
          test-directory: "ui/tests,services/tests"
          success-criteria: "REPAIR_SUCCESS_WITH_CONFIDENCE"
          repair-confidence-threshold: "4"
          create-pr-on-repair: "true"
```

### Advanced Workflow with Custom Configuration

```yaml
name: TestChimp AI Test Repair

on:
  workflow_dispatch:
  pull_request:
    branches: [ main, develop ]
    paths: [ 'e2e-tests/**', 'integration-tests/**' ]

jobs:
  testchimp-tests:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run TestChimp Tests with AI Repair
        id: testchimp
        uses: awarelabshq/testchimp-github-testrunner@v1.0.8
        env:
          TESTCHIMP_ENV: production
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          api-key: ${{ secrets.TESTCHIMP_API_KEY }}
          project-id: ${{ secrets.TESTCHIMP_PROJECT_ID }}
          testchimp-endpoint: "https://featureservice.testchimp.io"
          test-directory: "e2e-tests,integration-tests"
          test-case-regex: ".*\\.spec\\.(js|ts)$"
          test-suite-regex: ".*"
          success-criteria: "ORIGINAL_SUCCESS"
          repair-confidence-threshold: "5"
          create-pr-on-repair: "true"
          pr-title: "🤖 TestChimp: Fixed {count} test file{count,plural,one{} other{s}}"
          pr-body: |
            ## 🤖 TestChimp AI Repair Results
            
            This PR contains test files that were automatically repaired by TestChimp AI.
            
            ### 📊 Test Results Summary
            - **Total Tests**: ${{ steps.testchimp.outputs.test-count }}
            - **Successful**: ${{ steps.testchimp.outputs.success-count }}
            - **Failed**: ${{ steps.testchimp.outputs.failure-count }}
            - **Repaired**: ${{ steps.testchimp.outputs.repaired-count }}
            
            ### 🔧 What TestChimp Fixed
            TestChimp analyzed failing tests and automatically generated repairs with confidence scoring.
            
            Please review the changes and merge if the repairs look good!

      - name: Display Results
        run: |
          echo "Tests executed: ${{ steps.testchimp.outputs.test-count }}"
          echo "Tests passed: ${{ steps.testchimp.outputs.success-count }}"
          echo "Tests repaired: ${{ steps.testchimp.outputs.repaired-count }}"
          if [ "${{ steps.testchimp.outputs.pull-request-number }}" != "" ]; then
            echo "PR created: ${{ steps.testchimp.outputs.pull-request-url }}"
          fi
```

## Configuration Options

### Required Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `api-key` | TestChimp project API key | `${{ secrets.TESTCHIMP_API_KEY }}` |
| `project-id` | TestChimp project ID | `${{ secrets.TESTCHIMP_PROJECT_ID }}` |

### Optional Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `test-directory` | `tests` | Comma-separated directories to scan |
| `test-case-regex` | `.*` | Regex pattern for test files |
| `test-suite-regex` | `.*` | Regex pattern for test suites |
| `success-criteria` | `ORIGINAL_SUCCESS` | Success criteria (see below) |
| `repair-confidence-threshold` | `4` | Minimum confidence score (1-5) |
| `create-pr-on-repair` | `false` | Create PR when files are repaired |
| `pr-title` | `TestChimp: AI-repaired test files` | PR title template |
| `pr-body` | Default template | PR description template |
| `headless` | `true` | Run browser in headless mode |
| `deflake-runs` | `2` | Number of deflake runs to attempt |

### Success Criteria

#### `ORIGINAL_SUCCESS` (Default)
Only tests that pass on their original run are considered successful. AI repairs don't count as success.

```yaml
success-criteria: 'ORIGINAL_SUCCESS'
```

#### `REPAIR_SUCCESS_WITH_CONFIDENCE`
Tests that either pass originally OR are successfully repaired with sufficient confidence.

```yaml
success-criteria: 'REPAIR_SUCCESS_WITH_CONFIDENCE'
repair-confidence-threshold: '4'  # 1-5 scale
```

## Troubleshooting

### Common Issues

#### 1. "Write access to repository not granted"
**Error**: `remote: Write access to repository not granted.`

**Solution**: 
1. Go to **Settings** → **Actions** → **General**
2. Enable **"Read and write permissions"** (required to create branches and push commits)
3. Check **"Allow GitHub Actions to create and approve pull requests"**

#### 2. "GitHub Actions is not permitted to create pull requests"
**Error**: `GitHub Actions is not permitted to create or approve pull requests.`

**Solution**: Same as above - enable PR creation permissions.

#### 3. "No tests found"
**Error**: No TestChimp-managed tests are discovered.

**Solution**: 
- Check that test files contain TestChimp markers
- Verify `test-directory` paths are correct
- Ensure test files match the regex patterns

#### 4. "Authentication errors"
**Error**: `Authentication not configured` or similar.

**Solution**: 
- Verify `TESTCHIMP_API_KEY` and `TESTCHIMP_PROJECT_ID` secrets are set correctly
- Check that the API key is valid and has the necessary permissions

#### 5. "Repairs not accepted"
**Error**: Tests are repaired but not considered successful.

**Solution**: 
- Verify your confidence threshold isn't too high
- Check the repair confidence scores in the logs
- Consider using `ORIGINAL_SUCCESS` criteria if repairs aren't reliable

### Debug Information

The action provides detailed logging:

- Success criteria being used
- Confidence threshold for repairs
- Individual test results with confidence scores
- Summary statistics including repair counts
- Git operations and PR creation status

## Advanced Usage

### Custom PR Templates

You can customize the PR title and description using templates:

```yaml
pr-title: "🤖 TestChimp: Fixed {count} test file{count,plural,one{} other{s}} ({summary})"
pr-body: |
  ## 🤖 TestChimp AI Repair Results
  
  This PR contains test files that were automatically repaired by TestChimp AI.
  
  ### 📊 Test Results Summary
  - **Total Tests**: {count}
  - **Successful**: {summary}
  - **Repaired Files**: {files}
  
  Please review the changes and merge if the repairs look good!
```

### Using Outputs

The action provides several outputs you can use in subsequent steps:

```yaml
- name: TestChimp AI Repair
  id: testchimp
  uses: awarelabshq/testchimp-github-testrunner@v1.0.8
  with:
    api-key: ${{ secrets.TESTCHIMP_API_KEY }}
    project-id: ${{ secrets.TESTCHIMP_PROJECT_ID }}

- name: Notify on Success
  if: steps.testchimp.outputs.status == 'success'
  run: |
    echo "All tests passed successfully!"
    echo "Tests executed: ${{ steps.testchimp.outputs.test-count }}"
    echo "Tests repaired: ${{ steps.testchimp.outputs.repaired-count }}"

- name: Notify on Failure
  if: steps.testchimp.outputs.status == 'failed'
  run: |
    echo "Some tests failed"
    echo "Failed tests: ${{ steps.testchimp.outputs.failure-count }}"
    echo "Repaired tests: ${{ steps.testchimp.outputs.repaired-count }}"
```

### Conditional PR Creation

You can conditionally create PRs based on certain criteria:

```yaml
- name: Run TestChimp Tests with AI Repair
  id: testchimp
  uses: awarelabshq/testchimp-github-testrunner@v1.0.8
  with:
    api-key: ${{ secrets.TESTCHIMP_API_KEY }}
    project-id: ${{ secrets.TESTCHIMP_PROJECT_ID }}
    create-pr-on-repair: "true"
    repair-confidence-threshold: "4"  # Only create PR if confidence >= 4

- name: Create PR for High Confidence Repairs
  if: steps.testchimp.outputs.repaired-above-threshold > 0
  run: |
    echo "High confidence repairs found: ${{ steps.testchimp.outputs.repaired-above-threshold }}"
    echo "PR created: ${{ steps.testchimp.outputs.pull-request-url }}"
```

## Best Practices

### 1. Test File Organization
- Keep TestChimp-managed tests in dedicated directories
- Use consistent naming conventions
- Include clear step descriptions in TestChimp markers

### 2. Confidence Thresholds
- Start with threshold 4 for high confidence
- Lower to 3 for more aggressive repairs
- Use 5 for very conservative approach

### 3. Success Criteria
- Use `ORIGINAL_SUCCESS` for production environments
- Use `REPAIR_SUCCESS_WITH_CONFIDENCE` for development/testing

### 4. Review Process
- Always review AI-generated repairs before merging
- Test repaired files manually when possible
- Use PR reviews to validate changes

### 5. Monitoring
- Monitor repair success rates
- Track confidence scores over time
- Adjust thresholds based on results

## Support

- 📖 [TestChimp Documentation](https://docs.testchimp.io)
- 🐛 [Report Issues](https://github.com/awarelabshq/testchimp-github-testrunner/issues)
- 💬 [Ask Questions](https://github.com/awarelabshq/testchimp-github-testrunner/discussions)

## License

This project is licensed under the GPL-3.0 License - see the [LICENSE](LICENSE) file for details.
