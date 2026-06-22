export function versionInfo() {
    return {
        service: 'community-intelligence-railway-brain',
        runtimeVersion: process.env.RUNTIME_VERSION || '0.1.0-dev',
        commitSha: process.env.COMMIT_SHA || 'local-dev',
        buildTime: process.env.BUILD_TIME || 'unknown',
        environment: process.env.NODE_ENV || 'development',
    };
}
