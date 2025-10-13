"use strict";
/**
 * CI Pipeline Abstractions for GitHub Actions
 *
 * This module provides interfaces and abstractions for CI/CD pipeline integrations.
 * It allows the GitHub Action to work with different CI systems (GitHub, GitLab, etc.)
 * without being tightly coupled to any specific implementation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuccessCriteria = void 0;
/**
 * Test success criteria options
 */
var SuccessCriteria;
(function (SuccessCriteria) {
    /** Original test run must be successful */
    SuccessCriteria["ORIGINAL_SUCCESS"] = "ORIGINAL_SUCCESS";
    /** If original fails, repair must be successful with confidence >= threshold */
    SuccessCriteria["REPAIR_SUCCESS_WITH_CONFIDENCE"] = "REPAIR_SUCCESS_WITH_CONFIDENCE";
})(SuccessCriteria || (exports.SuccessCriteria = SuccessCriteria = {}));
//# sourceMappingURL=ci-pipeline.js.map