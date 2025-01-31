# **TestChimp GitHub Test Runner Action**  

![License](https://img.shields.io/github/license/awarelabshq/testchimp-github-testrunner)  

A GitHub Action that triggers test runs on the **TestChimp** platform and polls for results. Supports both **API** and **UI tests**.

---

## **📌 Features**
✔️ Trigger API or UI tests on TestChimp  
✔️ Poll for test results and determine success/failure  
✔️ Configurable logging (`all`, `failures`, `none`)  
✔️ Works in **GitHub Actions Workflows**  

---

## **🚀 Usage**
### **1️⃣ Add to Your GitHub Workflow**
Create or update your workflow yml file:

```yaml
name: Run TestChimp Tests

on: [push, pull_request]

jobs:
  testchimp:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Run TestChimp Tests
        uses: awarelabshq/testchimp-github-testrunner@v1
        with:
          project-id: ${{ secrets.TESTCHIMP_PROJECT_ID }}
          api-key: ${{ secrets.TESTCHIMP_API_KEY }}
          testchimp-endpoint: "https://featureservice.testchimp.io"  # Optional
          test-type: "FS_TEST"  # Options: FS_TEST (for API), UI_TEST (for UI tests)
          test-case-regex: ".*"  # Optional: Regex for selecting test cases
          test-suite-regex: ".*"  # Optional: Regex for selecting test suites
          log-level: "all"  # Options: all, failures, none
```

### **2️⃣ Required Inputs**
| Input                | Description                              | Required | Default |
|----------------------|------------------------------------------|----------|---------|
| `project-id`         | Your TestChimp project ID               | ✅ Yes   | -       |
| `api-key`            | Your TestChimp API key                  | ✅ Yes   | -       |
| `testchimp-endpoint` | TestChimp API endpoint                  | ❌ No    | `https://featureservice.testchimp.io` |
| `test-type`          | Test type: `FS_TEST` (API) or `UI_TEST` | ✅ Yes   | -       |
| `test-case-regex`    | Regex to filter test cases              | ❌ No    | `.*`    |
| `test-suite-regex`   | Regex to filter test suites             | ❌ No    | `.*`    |
| `log-level`          | Log output level (`all`, `failures`, `none`) | ❌ No | `all`   |

## **🔒 Setting Up Secrets**
To keep credentials secure, store them as **GitHub Secrets**:

1. Go to **Repository Settings → Secrets and Variables → Actions**.
2. Click **"New repository secret"**.
3. Add the following secrets:
   - `TESTCHIMP_PROJECT_ID`: Your TestChimp project ID.
   - `TESTCHIMP_API_KEY`: Your TestChimp API key.
