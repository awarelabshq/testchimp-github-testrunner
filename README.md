# TestChimp GitHub Action

🤖 AI-powered test repair for GitHub Actions - automatically fix failing tests with intelligent repair suggestions.

## Features

- **AI-Powered Test Repair**: Automatically repairs failing tests using advanced AI
- **Configurable Success Criteria**: Choose between original success only or repair success with confidence thresholds
- **Pull Request Integration**: Automatically creates PRs with repaired test files
- **Comprehensive Reporting**: Detailed metrics on test execution and repair success rates
- **CI/CD Integration**: Seamlessly integrates with existing GitHub workflows

## Quick Start

### 1. Set up GitHub Secrets

Add these secrets to your repository:

1. Go to your repository → Settings → Secrets and variables → Actions
2. Add these repository secrets:
   - `TESTCHIMP_API_KEY`: Your TestChimp project API key
   - `TESTCHIMP_PROJECT_ID`: Your TestChimp project ID

### 2. Configure Repository Permissions

The action requires specific permissions to write to the repository and create pull requests:

1. Go to your repository → Settings → Actions → General
2. Under "Workflow permissions", select "Read and write permissions"
3. Check "Allow GitHub Actions to create and approve pull requests"

### 3. Add the Action to Your Workflow

Create `.github/workflows/run_tests.yml`:

```yaml
name: TestChimp AI Test Repair
on: [push, pull_request]
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
        uses: awarelabshq/testchimp-github-testrunner@v1.0.16
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          api-key: ${{ secrets.TESTCHIMP_API_KEY }}
          project-id: ${{ secrets.TESTCHIMP_PROJECT_ID }}
          test-directory: "tests"
          success-criteria: "REPAIR_SUCCESS_WITH_CONFIDENCE"
          repair-confidence-threshold: "4"
```

### 4. Run Your Tests

Push your code or create a pull request - TestChimp will automatically:
- Scan for TestChimp-managed tests
- Execute tests with AI repair capabilities
- Create pull requests with repaired files (if any repairs are made)
- Provide detailed reporting on test results

## Configuration Options

### Required Parameters

| Parameter | Description |
|-----------|-------------|
| `api-key` | TestChimp project API key |
| `project-id` | TestChimp project ID |

### Optional Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `test-directory` | `tests` | Directory to scan for tests |
| `success-criteria` | `ORIGINAL_SUCCESS` | Success criteria (`ORIGINAL_SUCCESS` or `REPAIR_SUCCESS_WITH_CONFIDENCE`) |
| `repair-confidence-threshold` | `4` | Minimum confidence score (1-5) for repair success |
| `mode` | `RUN_WITH_AI_REPAIR` | Execution mode |
| `deflake-runs` | `2` | Number of deflake runs to attempt |
| `max-workers` | `4` | Maximum number of parallel test workers (1-10) |

## Success Criteria

### ORIGINAL_SUCCESS (Default)
Only tests that pass on their original run are considered successful. AI repairs don't count as success.

```yaml
success-criteria: 'ORIGINAL_SUCCESS'
```

### REPAIR_SUCCESS_WITH_CONFIDENCE
Tests that either pass originally OR are successfully repaired with sufficient confidence.

```yaml
success-criteria: 'REPAIR_SUCCESS_WITH_CONFIDENCE'
repair-confidence-threshold: '4'  # 1-5 scale
```

## Parallel Execution

### Max Workers Configuration

The action supports parallel test execution to improve performance. Use the `max-workers` parameter to control the number of concurrent test workers:

```yaml
max-workers: '3'  # Run up to 6 tests in parallel
```

**Guidelines:**
- **Default**: 3 workers (good balance for most projects)
- **Range**: 1-10 workers
- **Low-resource projects**: Use 1-2 workers
- **High-performance projects**: Use 6-8 workers
- **Memory-intensive tests**: Use fewer workers to avoid resource conflicts

**Example with parallel execution:**
```yaml
- name: Run TestChimp Tests with AI Repair
  uses: awarelabshq/testchimp-github-testrunner@v1.0.16
  with:
    api-key: ${{ secrets.TESTCHIMP_API_KEY }}
    project-id: ${{ secrets.TESTCHIMP_PROJECT_ID }}
    max-workers: '6'
    test-directory: "tests"
```

## Output Parameters

The action provides these outputs:

| Parameter | Description |
|-----------|-------------|
| `status` | Overall execution status (success/failed) |
| `test-count` | Number of tests executed |
| `success-count` | Number of successful tests |
| `failure-count` | Number of failed tests |
| `repaired-count` | Number of tests that were repaired |
| `repaired-above-threshold` | Number of tests repaired with confidence above threshold |
| `repaired-below-threshold` | Number of tests repaired with confidence below threshold |
| `success-criteria-used` | Success criteria that was applied |
| `pull-request-number` | Number of created PR (if any) |
| `pull-request-url` | URL of created PR (if any) |

## Example Workflows

### Basic Usage
```yaml
- name: TestChimp AI Repair
  uses: testchimp/testchimp-github-action@v1.0.0
  with:
    api-key: ${{ secrets.TESTCHIMP_API_KEY }}
    project-id: ${{ secrets.TESTCHIMP_PROJECT_ID }}
```

### With Custom Configuration
```yaml
name: TestChimp AI Test Repair
on: [push, pull_request]
jobs:
  testchimp-tests:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: TestChimp AI Repair
        uses: awarelabshq/testchimp-github-testrunner@v1.0.16
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          api-key: ${{ secrets.TESTCHIMP_API_KEY }}
          project-id: ${{ secrets.TESTCHIMP_PROJECT_ID }}
          test-directory: 'e2e-tests'
          success-criteria: 'REPAIR_SUCCESS_WITH_CONFIDENCE'
          repair-confidence-threshold: '3'
          max-workers: '6'
```

### Using Outputs
```yaml
name: TestChimp AI Test Repair
on: [push, pull_request]
jobs:
  testchimp-tests:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: TestChimp AI Repair
        id: testchimp
        uses: awarelabshq/testchimp-github-testrunner@v1.0.16
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          api-key: ${{ secrets.TESTCHIMP_API_KEY }}
          project-id: ${{ secrets.TESTCHIMP_PROJECT_ID }}

      - name: Display Results
        run: |
          echo "Tests executed: ${{ steps.testchimp.outputs.test-count }}"
          echo "Tests passed: ${{ steps.testchimp.outputs.success-count }}"
          echo "Tests repaired: ${{ steps.testchimp.outputs.repaired-count }}"
```

## Examples

Check the `examples/` directory for:
- `basic-usage.yml` - Simple workflow setup
- `advanced-usage.yml` - Different success criteria configurations
- `ci-integration.yml` - Integration with existing CI/CD pipelines

## Troubleshooting

### Common Issues

1. **Authentication errors**: Ensure `TESTCHIMP_API_KEY` and `TESTCHIMP_PROJECT_ID` secrets are set correctly
2. **Permission denied errors**: Verify repository permissions are set to "Read and write permissions" and "Allow GitHub Actions to create and approve pull requests" is enabled
3. **No tests found**: Check that your test directory contains TestChimp-managed tests
4. **Repairs not accepted**: Verify your confidence threshold isn't too high
5. **Resource exhaustion**: Reduce `max-workers` if tests are failing due to memory or CPU limits

### Debug Information

The action provides detailed logging:
- Success criteria being used
- Confidence threshold for repairs
- Individual test results with confidence scores
- Summary statistics including repair counts

## Support

- 📖 [Full Documentation](SUCCESS_CRITERIA.md)
- 🐛 [Report Issues](https://github.com/awarelabshq/testchimp-github-testrunner/issues)
- 💬 [Ask Questions](https://github.com/awarelabshq/testchimp-github-testrunner/discussions)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md) file for details.
