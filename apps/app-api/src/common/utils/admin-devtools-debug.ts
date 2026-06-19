export function isAdminApiDevtoolsDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    const enabled = env.APP_API_DEVTOOLS_DEBUG;
    return enabled === '1' || enabled?.toLowerCase() === 'true';
}
