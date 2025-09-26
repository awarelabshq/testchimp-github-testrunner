/**
 * Environment Configuration Loader
 * 
 * This module loads environment configuration from packaged env files
 * instead of relying on process.env which may not be available in VS Code extensions
 */

interface EnvConfig {
  TESTCHIMP_BACKEND_URL: string;
}

let cachedConfig: EnvConfig | null = null;

/**
 * Load environment configuration from the packaged env file
 * Falls back to process.env if env file is not available
 */
export function loadEnvConfig(): EnvConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    // Try multiple possible paths for the env file
    const possiblePaths = [
      require('path').join(__dirname, 'env'),
      require('path').join(__dirname, './env'),
      require('path').join(__dirname, '../env'),
      require('path').join(__dirname, '../../runner-core/env'),
      require('path').join(__dirname, '../../runner-core/dist/env'),
      require('path').join(process.cwd(), 'env'),
      require('path').join(process.cwd(), 'runner-core/env'),
      require('path').join(process.cwd(), 'runner-core/dist/env'),
      require('path').join(process.cwd(), 'local/runner-core/env'),
      require('path').join(process.cwd(), 'local/runner-core/dist/env')
    ];
    
    let envContent = '';
    let envPath = '';
    
    for (const path of possiblePaths) {
      try {
        envContent = require('fs').readFileSync(path, 'utf8');
        envPath = path;
        break;
      } catch (error) {
        // Silently continue to next path
      }
    }
    
    if (!envContent) {
      throw new Error('Could not find env file in any of the expected locations');
    }
    
    const config: Partial<EnvConfig> = {};
    
    envContent.split('\n').forEach((line: string) => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, value] = trimmedLine.split('=');
        if (key && value) {
          const trimmedKey = key.trim() as keyof EnvConfig;
          config[trimmedKey] = value.trim();
        }
      }
    });
    
    // Ensure required properties are present
    const finalConfig: EnvConfig = {
      TESTCHIMP_BACKEND_URL: config.TESTCHIMP_BACKEND_URL || 'https://featureservice.testchimp.io'
    };
    
    cachedConfig = finalConfig;
    return finalConfig;
  } catch (error) {
    // Fallback to process.env
    const config: EnvConfig = {
      TESTCHIMP_BACKEND_URL: process.env.TESTCHIMP_BACKEND_URL || 'https://featureservice.testchimp.io'
    };
    cachedConfig = config;
    return config;
  }
}

/**
 * Get a specific environment variable
 */
export function getEnvVar(key: keyof EnvConfig): string | undefined {
  const config = loadEnvConfig();
  return config[key];
}
