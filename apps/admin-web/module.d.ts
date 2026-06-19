declare module "@arco-design/color";

declare module "@better-auth/infra/client" {
    export function dashClient(): any;
    export function sentinelClient(options?: { autoSolveChallenge?: boolean }): any;
}
    
