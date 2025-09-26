/**
 * Authentication configuration for TestChimp services
 * Supports both user PAT and project API key authentication modes
 */

export interface UserPATAuthConfig {
  mode: 'user_pat';
  userAuthKey: string;
  userMail: string;
}

export interface ProjectApiKeyAuthConfig {
  mode: 'project_api_key';
  apiKey: string;
  projectId: string;
}

export type AuthConfig = UserPATAuthConfig | ProjectApiKeyAuthConfig;

/**
 * Helper function to create user PAT auth configuration
 */
export function createUserPATAuth(userAuthKey: string, userMail: string): UserPATAuthConfig {
  return {
    mode: 'user_pat',
    userAuthKey,
    userMail
  };
}

/**
 * Helper function to create project API key auth configuration
 */
export function createProjectApiKeyAuth(apiKey: string, projectId: string): ProjectApiKeyAuthConfig {
  return {
    mode: 'project_api_key',
    apiKey,
    projectId
  };
}

/**
 * Helper function to create auth configuration from environment variables
 * Supports both authentication modes based on available environment variables
 */
export function createAuthConfigFromEnv(): AuthConfig | null {
  // Check for project API key authentication first (for CI/CD)
  const apiKey = process.env.TESTCHIMP_API_KEY;
  const projectId = process.env.TESTCHIMP_PROJECT_ID;
  
  if (apiKey && projectId) {
    return createProjectApiKeyAuth(apiKey, projectId);
  }
  
  // Fall back to user PAT authentication (for VS Code extension)
  const userAuthKey = process.env.TESTCHIMP_USER_AUTH_KEY;
  const userMail = process.env.TESTCHIMP_USER_MAIL;
  
  if (userAuthKey && userMail) {
    return createUserPATAuth(userAuthKey, userMail);
  }
  
  return null;
}

/**
 * Helper function to get authentication headers for HTTP requests
 */
export function getAuthHeaders(authConfig: AuthConfig): Record<string, string> {
  switch (authConfig.mode) {
    case 'user_pat':
      return {
        'user_auth_key': authConfig.userAuthKey,
        'user_mail': authConfig.userMail
      };
    case 'project_api_key':
      return {
        'TestChimp-Api-Key': authConfig.apiKey,
        'project-id': authConfig.projectId
      };
    default:
      throw new Error('Invalid authentication configuration');
  }
}
