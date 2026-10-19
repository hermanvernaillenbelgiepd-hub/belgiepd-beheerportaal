// Read-only deployment metadata: Render provides these variables at runtime.
// Never return environment variables, secrets, service IDs or account data.
export function publicDeploymentInfo(env=process.env){
  const commit=typeof env.RENDER_GIT_COMMIT==='string'&&
    /^[a-f0-9]{40}$/.test(env.RENDER_GIT_COMMIT)?env.RENDER_GIT_COMMIT:null;
  const branch=typeof env.RENDER_GIT_BRANCH==='string'&&
    /^[A-Za-z0-9._/-]{1,120}$/.test(env.RENDER_GIT_BRANCH)
      ?env.RENDER_GIT_BRANCH:null;
  return {commit,branch};
}
